import { appendFile, mkdir, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionReader, parseSampleLine } from '../src/main/providers/codexSessions'
import { limitsLine, metaLine, tempDir, writeSession } from './helpers'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const now = (): number => NOW
const minutesAgo = (minutes: number): Date => new Date(NOW - minutes * 60_000)
const iso = (minutes: number): string => minutesAgo(minutes).toISOString()

describe('createSessionReader', () => {
  it('attributes each sample to the account recorded in its session metadata', async () => {
    const sessions = await tempDir()
    await writeSession(sessions, '2026-10-06', 'a', [metaLine('acct-a'), limitsLine(iso(20), 40), limitsLine(iso(5), 55)], minutesAgo(5))
    await writeSession(sessions, '2026-10-05', 'b', [metaLine('acct-b'), limitsLine(iso(600), 12)], minutesAgo(600))

    const samples = await createSessionReader().latestSamples({ sessionsDir: sessions, now })

    expect(samples.get('acct-a')).toMatchObject({ sampledAt: iso(5), planType: 'plus', primary: { usedPercent: 55, windowMinutes: 300 } })
    expect(samples.get('acct-b')?.primary?.usedPercent).toBe(12)
    expect(samples.get('acct-a')?.primary?.resetsAt).toBe(new Date(1_900_000_000 * 1000).toISOString())
  })

  it('prefers the most recently written session, not the most recently started one', async () => {
    const sessions = await tempDir()
    await writeSession(sessions, '2026-10-06', '2026-10-06T11-00', [metaLine('acct-a'), limitsLine(iso(30), 10)], minutesAgo(30))
    await writeSession(sessions, '2026-10-06', '2026-10-06T08-00', [metaLine('acct-a'), limitsLine(iso(2), 90)], minutesAgo(2))

    const samples = await createSessionReader().latestSamples({ sessionsDir: sessions, now })

    expect(samples.get('acct-a')?.primary?.usedPercent).toBe(90)
  })

  it('ignores sessions without an account, samples older than the age limit, and stray files', async () => {
    const sessions = await tempDir()
    await writeSession(sessions, '2026-10-06', 'anon', [metaLine(), limitsLine(iso(1), 99)], minutesAgo(1))
    await writeSession(sessions, '2026-09-01', 'old', [metaLine('acct-old'), limitsLine('2026-09-01T00:00:00.000Z', 50)], new Date('2026-09-01T00:00:00.000Z'))
    await mkdir(path.join(sessions, 'archive/2026/10/06'), { recursive: true })
    await writeFile(path.join(sessions, 'archive/2026/10/06/rollout-x.jsonl'), `${metaLine('acct-x')}\n${limitsLine(iso(1), 1)}\n`)

    const samples = await createSessionReader().latestSamples({ sessionsDir: sessions, now })

    expect([...samples.keys()]).toEqual([])
  })

  it('reads only the tail of large files and drops the truncated first line', async () => {
    const sessions = await tempDir()
    const filler = Array.from({ length: 200 }, () => JSON.stringify({ type: 'response_item', payload: { text: 'x'.repeat(1000) } }))
    await writeSession(sessions, '2026-10-06', 'big', [metaLine('acct-a'), limitsLine(iso(50), 5), ...filler, limitsLine(iso(3), 33)], minutesAgo(3))

    const samples = await createSessionReader().latestSamples({ sessionsDir: sessions, now, tailBytes: 8 * 1024 })

    expect(samples.get('acct-a')?.primary?.usedPercent).toBe(33)
  })

  it('stops once every requested account has a sample', async () => {
    const sessions = await tempDir()
    await writeSession(sessions, '2026-10-06', 'new', [metaLine('acct-a'), limitsLine(iso(1), 1)], minutesAgo(1))
    await writeSession(sessions, '2026-10-06', 'older', [metaLine('acct-b'), limitsLine(iso(9), 9)], minutesAgo(9))

    const samples = await createSessionReader().latestSamples({ sessionsDir: sessions, now, accountIds: ['acct-a'] })

    expect([...samples.keys()]).toEqual(['acct-a'])
  })

  it('re-reads a cached file only after it changes', async () => {
    const sessions = await tempDir()
    const file = await writeSession(sessions, '2026-10-06', 'live', [metaLine('acct-a'), limitsLine(iso(10), 10)], minutesAgo(10))
    const reader = createSessionReader()
    expect((await reader.latestSamples({ sessionsDir: sessions, now })).get('acct-a')?.primary?.usedPercent).toBe(10)

    await appendFile(file, `${limitsLine(iso(1), 77)}\n`)
    await utimes(file, minutesAgo(1), minutesAgo(1))

    expect((await reader.latestSamples({ sessionsDir: sessions, now })).get('acct-a')?.primary?.usedPercent).toBe(77)
  })
})

describe('parseSampleLine', () => {
  it('rejects lines without usable limits', () => {
    expect(parseSampleLine('not json "rate_limits"')).toBeUndefined()
    expect(parseSampleLine(JSON.stringify({ timestamp: iso(1), payload: { rate_limits: { primary: { used_percent: 'x' } } } }))).toBeUndefined()
    expect(parseSampleLine(JSON.stringify({ payload: { rate_limits: { primary: { used_percent: 1 } } } }))).toBeUndefined()
  })

  it('clamps used percentages to 0..100', () => {
    const sample = parseSampleLine(JSON.stringify({ timestamp: iso(1), payload: { rate_limits: { primary: { used_percent: 140 }, secondary: { used_percent: -3 } } } }))
    expect(sample?.primary?.usedPercent).toBe(100)
    expect(sample?.secondary?.usedPercent).toBe(0)
  })
})

import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFreshRateLimitSample, readLatestRateLimitSample } from '../src/main/codex/rateLimits'

const statCalls = vi.hoisted(() => ({ count: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    stat: (...args: Parameters<typeof fs.stat>) => {
      statCalls.count += 1
      return fs.stat(...args)
    }
  }
})

const temporaryDirectories: string[] = []
const now = Date.parse('2026-07-27T12:00:00.000Z')

async function createSessionRoot(lines: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
  temporaryDirectories.push(directory)
  const filePath = path.join(directory, '2026', '07', '27', 'rollout-2026-07-27T11-59-00-test.jsonl')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${lines.join('\n')}\n`)
  return directory
}

function rateLimitEvent(accountId: string, timestamp: string, usedPercent: number): string {
  return JSON.stringify({
    timestamp,
    payload: {
      account_id: accountId,
      rate_limits: {
        primary: { used_percent: usedPercent, window_minutes: 300 },
        secondary: { used_percent: 20, window_minutes: 10080 },
        plan_type: 'plus'
      }
    }
  })
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('rate limit samples', () => {
  it('rejects a sample that is older than fifteen minutes', () => {
    expect(isFreshRateLimitSample({ ts: new Date(now - 16 * 60_000).toISOString() }, now)).toBe(false)
  })

  it('returns only the most recent fresh sample for the active account', async () => {
    const sessionRoot = await createSessionRoot([rateLimitEvent('account-other', '2026-07-27T11:59:00.000Z', 10), rateLimitEvent('account-active', '2026-07-27T11:58:00.000Z', 35)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toMatchObject({ accountId: 'account-active', primary: { used_percent: 35 } })
  })

  it('rejects a fresh sample that cannot be attributed to the active account', async () => {
    const sessionRoot = await createSessionRoot([rateLimitEvent('account-other', '2026-07-27T11:59:00.000Z', 10)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toBeUndefined()
  })

  it('rejects a stale sample even when it belongs to the active account', async () => {
    const sessionRoot = await createSessionRoot([rateLimitEvent('account-active', '2026-07-27T11:44:00.000Z', 10)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toBeUndefined()
  })

  it('uses mtime to select a recent sample among canonical candidates', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const sessionDirectory = path.join(directory, '2026', '07', '27')
    const recentFile = path.join(sessionDirectory, 'rollout-2026-07-27T11-59-00-recent.jsonl')
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(recentFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 25)}\n`)
    await writeFile(path.join(sessionDirectory, 'rollout-2026-07-27T12-00-00-older.jsonl'), '{}\n')
    await writeFile(path.join(sessionDirectory, 'rollout-2026-07-27T12-01-00-older.jsonl'), '{}\n')
    await utimes(recentFile, new Date(now), new Date(now))
    await utimes(path.join(sessionDirectory, 'rollout-2026-07-27T12-00-00-older.jsonl'), new Date(now - 60_000), new Date(now - 60_000))
    await utimes(path.join(sessionDirectory, 'rollout-2026-07-27T12-01-00-older.jsonl'), new Date(now - 60_000), new Date(now - 60_000))

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: recentFile, primary: { used_percent: 25 } })
  })

  it('selects the newest canonical session from more files than the candidate cap', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const sessionDirectory = path.join(directory, '2026', '07', '27')
    await mkdir(sessionDirectory, { recursive: true })
    const olderFiles = Array.from({ length: 100 }, (_, index) => path.join(sessionDirectory, `rollout-2026-07-27T11-58-${String(index).padStart(3, '0')}-older.jsonl`))
    await Promise.all(olderFiles.map((filePath) => writeFile(filePath, '{}\n')))
    await Promise.all(olderFiles.map((filePath) => utimes(filePath, new Date(now - 60_000), new Date(now - 60_000))))

    const recentFile = path.join(sessionDirectory, 'rollout-2026-07-27T11-59-00-most-recent.jsonl')
    await writeFile(recentFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 15)}\n`)
    await utimes(recentFile, new Date(now), new Date(now))

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: recentFile, primary: { used_percent: 15 } })
  })

  it('ignores an unknown nested session layout without scanning file metadata', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const activeDirectory = path.join(directory, 'z-active')
    const activeFile = path.join(activeDirectory, 'z-active-session.jsonl')
    await mkdir(activeDirectory)
    await writeFile(activeFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 40)}\n`)
    await utimes(activeFile, new Date(now), new Date(now))

    const historicalFiles = Array.from({ length: 50 }, (_, directoryIndex) =>
      Array.from({ length: 20 }, (_, fileIndex) => path.join(directory, `a-history-${String(directoryIndex).padStart(3, '0')}`, `z-session-${String(fileIndex).padStart(3, '0')}.jsonl`))
    )
    await Promise.all(
      historicalFiles.flat().map(async (filePath) => {
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, '{}\n')
        await utimes(filePath, new Date(now - 60_000), new Date(now - 60_000))
      })
    )
    statCalls.count = 0

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toBeUndefined()
    expect(statCalls.count).toBe(0)
  })

  it('prioritizes the newest Codex session date over an unrelated lexical subtree without unbounded metadata work', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const activeFile = path.join(directory, '2026', '07', '27', 'rollout-2026-07-27T11-59-00-active.jsonl')
    await mkdir(path.dirname(activeFile), { recursive: true })
    await writeFile(activeFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 45)}\n`)
    await utimes(activeFile, new Date(now), new Date(now))

    const unrelatedFiles = Array.from({ length: 20 }, (_, index) => path.join(directory, 'z-unrelated', `z-history-${String(index).padStart(3, '0')}.jsonl`))
    await Promise.all(
      unrelatedFiles.map(async (filePath) => {
        await mkdir(path.dirname(filePath), { recursive: true })
        await writeFile(filePath, '{}\n')
        await utimes(filePath, new Date(now - 60_000), new Date(now - 60_000))
      })
    )
    statCalls.count = 0

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: activeFile, primary: { used_percent: 45 } })
    expect(statCalls.count).toBeLessThanOrEqual(8)
  })

  it('ignores non-rollout JSONL files in a canonical date folder', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const sessionDirectory = path.join(directory, '2026', '07', '27')
    const validFile = path.join(sessionDirectory, 'rollout-2026-07-27T11-59-00-active.jsonl')
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(validFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 45)}\n`)
    await writeFile(path.join(sessionDirectory, 'z-unrelated-active.jsonl'), `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 99)}\n`)
    await Promise.all(Array.from({ length: 20 }, (_, index) => writeFile(path.join(sessionDirectory, `z-noise-${String(index).padStart(3, '0')}.jsonl`), '{}\n')))
    statCalls.count = 0

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: validFile, primary: { used_percent: 45 } })
    expect(statCalls.count).toBe(1)
  })

  it('ignores impossible calendar dates without scanning their sessions', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const invalidFile = path.join(directory, '2026', '02', '31', 'rollout-2026-02-31T11-59-00-active.jsonl')
    await mkdir(path.dirname(invalidFile), { recursive: true })
    await writeFile(invalidFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 45)}\n`)
    statCalls.count = 0

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toBeUndefined()
    expect(statCalls.count).toBe(0)
  })

  it('accepts sessions from a valid leap day', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const leapDayFile = path.join(directory, '2024', '02', '29', 'rollout-2024-02-29T11-59-00-active.jsonl')
    await mkdir(path.dirname(leapDayFile), { recursive: true })
    await writeFile(leapDayFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 45)}\n`)

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: leapDayFile, primary: { used_percent: 45 } })
  })

  it('does not collect metadata when the candidate cap is zero', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const activeFile = path.join(directory, '2026', '07', '27', 'rollout-2026-07-27T11-59-00-active.jsonl')
    await mkdir(path.dirname(activeFile), { recursive: true })
    await writeFile(activeFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 45)}\n`)
    statCalls.count = 0

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 0,
        now: () => now
      })
    ).resolves.toBeUndefined()
    expect(statCalls.count).toBe(0)
  })
})

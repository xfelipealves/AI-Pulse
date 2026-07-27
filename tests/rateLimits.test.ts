import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isFreshRateLimitSample, readLatestRateLimitSample } from '../src/main/codex/rateLimits'

const temporaryDirectories: string[] = []
const now = Date.parse('2026-07-27T12:00:00.000Z')

async function createSessionFile(lines: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
  temporaryDirectories.push(directory)
  const filePath = path.join(directory, 'session.jsonl')
  await writeFile(filePath, `${lines.join('\n')}\n`)
  return filePath
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
    const sessionFile = await createSessionFile([rateLimitEvent('account-other', '2026-07-27T11:59:00.000Z', 10), rateLimitEvent('account-active', '2026-07-27T11:58:00.000Z', 35)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot: path.dirname(sessionFile),
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toMatchObject({ accountId: 'account-active', primary: { used_percent: 35 } })
  })

  it('rejects a fresh sample that cannot be attributed to the active account', async () => {
    const sessionFile = await createSessionFile([rateLimitEvent('account-other', '2026-07-27T11:59:00.000Z', 10)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot: path.dirname(sessionFile),
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toBeUndefined()
  })

  it('rejects a stale sample even when it belongs to the active account', async () => {
    const sessionFile = await createSessionFile([rateLimitEvent('account-active', '2026-07-27T11:44:00.000Z', 10)])

    await expect(
      readLatestRateLimitSample({
        sessionRoot: path.dirname(sessionFile),
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toBeUndefined()
  })

  it('keeps a recently modified session eligible when its path sorts after the candidate cap', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const recentFile = path.join(directory, 'a-recent.jsonl')
    await writeFile(recentFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 25)}\n`)
    await writeFile(path.join(directory, 'y-older.jsonl'), '{}\n')
    await writeFile(path.join(directory, 'z-older.jsonl'), '{}\n')
    await utimes(recentFile, new Date(now), new Date(now))
    await utimes(path.join(directory, 'y-older.jsonl'), new Date(now - 60_000), new Date(now - 60_000))
    await utimes(path.join(directory, 'z-older.jsonl'), new Date(now - 60_000), new Date(now - 60_000))

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        maxFiles: 2,
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: recentFile, primary: { used_percent: 25 } })
  })

  it('selects the most recent lexicographically late session from more candidates than the cap', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ai-pulse-rates-'))
    temporaryDirectories.push(directory)
    const olderFiles = Array.from({ length: 100 }, (_, index) => path.join(directory, `z-older-${String(index).padStart(3, '0')}.jsonl`))
    await Promise.all(olderFiles.map((filePath) => writeFile(filePath, '{}\n')))
    await Promise.all(olderFiles.map((filePath) => utimes(filePath, new Date(now - 60_000), new Date(now - 60_000))))

    const recentFile = path.join(directory, 'a-most-recent.jsonl')
    await writeFile(recentFile, `${rateLimitEvent('account-active', '2026-07-27T11:59:00.000Z', 15)}\n`)
    await utimes(recentFile, new Date(now), new Date(now))

    await expect(
      readLatestRateLimitSample({
        sessionRoot: directory,
        activeAccountId: 'account-active',
        now: () => now
      })
    ).resolves.toMatchObject({ sourceFile: recentFile, primary: { used_percent: 15 } })
  })
})

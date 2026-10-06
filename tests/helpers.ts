import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

export async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'ai-pulse-test-'))
}

export function idToken(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`
}

export async function writeAuth(filePath: string, accountId: string | undefined, claims: Record<string, unknown> = {}): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tokens = accountId ? { account_id: accountId, id_token: idToken(claims), access_token: `token-${accountId}` } : {}
  await writeFile(filePath, JSON.stringify({ last_refresh: '2026-10-01T00:00:00.000Z', tokens }))
}

export function metaLine(accountId?: string): string {
  return JSON.stringify({ timestamp: '2026-10-06T10:00:00.000Z', type: 'session_meta', payload: { id: 'session', ...(accountId ? { creator_account_id: accountId } : {}) } })
}

export function limitsLine(timestamp: string, primaryUsed: number, secondaryUsed = 10, resetsAt = 1_900_000_000): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      rate_limits: {
        primary: { used_percent: primaryUsed, window_minutes: 300, resets_at: resetsAt },
        secondary: { used_percent: secondaryUsed, window_minutes: 10080, resets_at: resetsAt },
        plan_type: 'plus'
      }
    }
  })
}

/** Writes sessions/YYYY/MM/DD/rollout-<name>.jsonl with the given mtime. */
export async function writeSession(sessionsDir: string, day: string, name: string, lines: string[], mtime: Date): Promise<string> {
  const directory = path.join(sessionsDir, ...day.split('-'))
  await mkdir(directory, { recursive: true })
  const filePath = path.join(directory, `rollout-${name}.jsonl`)
  await writeFile(filePath, `${lines.join('\n')}\n`)
  await utimes(filePath, mtime, mtime)
  return filePath
}

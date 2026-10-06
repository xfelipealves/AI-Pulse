import type { Dirent } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

export type LimitWindow = {
  usedPercent: number
  windowMinutes?: number
  resetsAt?: string
}

export type UsageSample = {
  sampledAt: string
  planType?: string
  primary?: LimitWindow
  secondary?: LimitWindow
}

const DAY_MS = 24 * 60 * 60_000
const DEFAULTS = { maxFiles: 200, maxAgeMs: 7 * DAY_MS, headBytes: 4 * 1024, tailBytes: 128 * 1024 }
const CLOCK_SKEW_MS = 60_000
const YEAR = /^\d{4}$/
const MONTH_OR_DAY = /^\d{2}$/
const ROLLOUT_FILE = /^rollout-.+\.jsonl$/
const CREATOR_ACCOUNT_ID = /"creator_account_id"\s*:\s*"([^"]+)"/

export type SessionScanOptions = {
  sessionsDir: string
  /** Stop scanning once every one of these accounts has a sample. */
  accountIds?: string[]
  now?: () => number
  maxFiles?: number
  maxAgeMs?: number
  headBytes?: number
  tailBytes?: number
}

type FileResult = { mtimeMs: number; size: number; accountId?: string; sample?: UsageSample }

/**
 * Finds the newest rate-limit sample per account in Codex rollout files.
 *
 * A sample is attributed to the account recorded in the session's `session_meta`
 * line (`creator_account_id`). Sessions without that field are ignored rather than guessed.
 * Per-file results are cached by mtime and size, so unchanged files are not re-read.
 */
export function createSessionReader(): { latestSamples: (options: SessionScanOptions) => Promise<Map<string, UsageSample>> } {
  const cache = new Map<string, FileResult>()

  async function latestSamples(options: SessionScanOptions): Promise<Map<string, UsageSample>> {
    const settings = { ...DEFAULTS, ...options }
    const now = (options.now ?? Date.now)()
    const wanted = options.accountIds ? new Set(options.accountIds) : undefined
    const samples = new Map<string, UsageSample>()

    const files = await newestRolloutFiles(settings.sessionsDir, settings.maxFiles)
    const stamped = await Promise.all(files.map(async (filePath) => ({ filePath, info: await stat(filePath).catch(() => undefined) })))
    const recent = stamped.filter((file) => file.info && now - file.info.mtimeMs <= settings.maxAgeMs).sort((left, right) => right.info!.mtimeMs - left.info!.mtimeMs)

    const seen = new Set<string>()
    for (const { filePath, info } of recent) {
      seen.add(filePath)
      let result = cache.get(filePath)
      if (!result || result.mtimeMs !== info!.mtimeMs || result.size !== info!.size) {
        result = { mtimeMs: info!.mtimeMs, size: info!.size, ...(await readSessionFile(filePath, settings.headBytes, settings.tailBytes)) }
        cache.set(filePath, result)
      }

      const { accountId, sample } = result
      if (!accountId || !sample || samples.has(accountId)) continue
      const sampledAt = Date.parse(sample.sampledAt)
      if (sampledAt > now + CLOCK_SKEW_MS || now - sampledAt > settings.maxAgeMs) continue
      samples.set(accountId, sample)
      if (wanted && [...wanted].every((id) => samples.has(id))) break
    }

    for (const filePath of cache.keys()) if (!seen.has(filePath)) cache.delete(filePath)
    return samples
  }

  return { latestSamples }
}

export async function readSessionFile(filePath: string, headBytes: number, tailBytes: number): Promise<{ accountId?: string; sample?: UsageSample }> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(filePath, 'r')
    const { size } = await handle.stat()
    const head = await readRange(handle, 0, Math.min(size, headBytes))
    const accountId = CREATOR_ACCOUNT_ID.exec(head.split('\n', 1)[0])?.[1]
    if (!accountId) return {}

    const tailStart = Math.max(0, size - tailBytes)
    const tail = await readRange(handle, tailStart, size - tailStart)
    // Drop the first, possibly truncated, line when the tail does not start at the beginning of the file.
    const lines = (tailStart === 0 ? tail : tail.slice(tail.indexOf('\n') + 1)).split('\n')
    for (let index = lines.length - 1; index >= 0; index--) {
      const sample = parseSampleLine(lines[index])
      if (sample) return { accountId, sample }
    }
    return { accountId }
  } catch {
    return {}
  } finally {
    await handle?.close()
  }
}

type RawWindow = { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown }

export function parseSampleLine(line: string): UsageSample | undefined {
  if (!line.includes('"rate_limits"')) return undefined
  try {
    const event = JSON.parse(line) as { timestamp?: unknown; payload?: { rate_limits?: { primary?: RawWindow; secondary?: RawWindow; plan_type?: unknown } } }
    const limits = event.payload?.rate_limits
    if (!limits || typeof event.timestamp !== 'string' || Number.isNaN(Date.parse(event.timestamp))) return undefined
    const primary = parseWindow(limits.primary)
    const secondary = parseWindow(limits.secondary)
    if (!primary && !secondary) return undefined
    return {
      sampledAt: event.timestamp,
      planType: typeof limits.plan_type === 'string' ? limits.plan_type : undefined,
      primary,
      secondary
    }
  } catch {
    return undefined
  }
}

function parseWindow(raw: RawWindow | undefined): LimitWindow | undefined {
  if (!raw || typeof raw.used_percent !== 'number' || !Number.isFinite(raw.used_percent)) return undefined
  return {
    usedPercent: Math.min(100, Math.max(0, raw.used_percent)),
    windowMinutes: typeof raw.window_minutes === 'number' ? raw.window_minutes : undefined,
    resetsAt: typeof raw.resets_at === 'number' ? new Date(raw.resets_at * 1000).toISOString() : undefined
  }
}

// Codex stores sessions as sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl, so a
// reverse name walk visits the newest sessions first.
async function newestRolloutFiles(sessionsDir: string, limit: number): Promise<string[]> {
  const files: string[] = []
  for (const year of await subdirectories(sessionsDir, YEAR)) {
    for (const month of await subdirectories(year, MONTH_OR_DAY)) {
      for (const day of await subdirectories(month, MONTH_OR_DAY)) {
        const entries = (await entriesOf(day)).filter((entry) => entry.isFile() && ROLLOUT_FILE.test(entry.name))
        for (const entry of entries.sort(byNameDescending)) {
          files.push(path.join(day, entry.name))
          if (files.length >= limit) return files
        }
      }
    }
  }
  return files
}

async function subdirectories(directory: string, pattern: RegExp): Promise<string[]> {
  return (await entriesOf(directory))
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .sort(byNameDescending)
    .map((entry) => path.join(directory, entry.name))
}

async function entriesOf(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

async function readRange(handle: Awaited<ReturnType<typeof open>>, position: number, length: number): Promise<string> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead).toString('utf8')
}

function byNameDescending(left: Dirent, right: Dirent): number {
  return right.name.localeCompare(left.name)
}

import type { Dirent } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const FIFTEEN_MINUTES_MS = 15 * 60_000
const MAX_SESSION_FILES = 80
const CANDIDATE_FILE_MULTIPLIER = 4
const MAX_TAIL_BYTES = 64 * 1024
const YEAR_DIRECTORY = /^\d{4}$/
const MONTH_DIRECTORY = /^(0[1-9]|1[0-2])$/
const DAY_DIRECTORY = /^(0[1-9]|[12]\d|3[01])$/
const ROLLOUT_SESSION_FILE = /^rollout-.+\.jsonl$/

export type RateLimitWindow = {
  used_percent?: number
  window_minutes?: number
  resets_at?: number
}

export type RateLimitSample = {
  ts: string
  sourceFile?: string
  accountId?: string
  primary?: RateLimitWindow
  secondary?: RateLimitWindow
  plan_type?: string
}

type RateLimitEvent = {
  timestamp?: string
  payload?: {
    account_id?: string
    accountId?: string
    rate_limits?: {
      account_id?: string
      accountId?: string
      primary?: RateLimitWindow
      secondary?: RateLimitWindow
      plan_type?: string
    }
  }
}

export type ReadRateLimitOptions = {
  sessionRoot: string
  activeAccountId?: string
  now?: () => number
  maxFiles?: number
  maxTailBytes?: number
}

export function isFreshRateLimitSample(sample: Pick<RateLimitSample, 'ts'>, now = Date.now()): boolean {
  const timestamp = Date.parse(sample.ts)
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= FIFTEEN_MINUTES_MS
}

export async function readLatestRateLimitSample(options: ReadRateLimitOptions): Promise<RateLimitSample | undefined> {
  if (!options.activeAccountId) return undefined

  const now = options.now ?? Date.now
  const files = await recentSessionFiles(options.sessionRoot, options.maxFiles ?? MAX_SESSION_FILES)
  let latest: RateLimitSample | undefined

  for (const filePath of files) {
    const lines = await readTailLines(filePath, options.maxTailBytes ?? MAX_TAIL_BYTES)
    for (const line of lines.reverse()) {
      const sample = parseRateLimitSample(line, filePath)
      if (!sample || sample.accountId !== options.activeAccountId || !isFreshRateLimitSample(sample, now())) continue
      if (!latest || Date.parse(sample.ts) > Date.parse(latest.ts)) latest = sample
    }
  }

  return latest
}

async function recentSessionFiles(sessionRoot: string, maxFiles: number): Promise<string[]> {
  const maxCandidates = maxFiles * CANDIDATE_FILE_MULTIPLIER
  if (maxCandidates <= 0) return []

  const files = await recentCodexSessionFiles(sessionRoot, maxCandidates)

  const stampedFiles = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      modifiedAt: await stat(filePath)
        .then((file) => file.mtimeMs)
        .catch(() => 0)
    }))
  )
  return stampedFiles
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(0, maxFiles)
    .map(({ filePath }) => filePath)
}

// Codex's canonical local session layout is sessions/YYYY/MM/DD/rollout-<timestamp>.jsonl.
// Date and rollout names are chronological, so this finds the newest sessions
// without allowing unrelated sibling directories to consume the candidate cap.
async function recentCodexSessionFiles(sessionRoot: string, maxCandidates: number): Promise<string[]> {
  const files: string[] = []

  for (const year of await matchingDirectories(sessionRoot, YEAR_DIRECTORY)) {
    for (const month of await matchingDirectories(year, MONTH_DIRECTORY)) {
      for (const day of await matchingDirectories(month, DAY_DIRECTORY)) {
        if (!isValidCalendarDate(year, month, day)) continue

        const entries = await readDirectory(day)
        for (const entry of entries.sort((left, right) => right.name.localeCompare(left.name))) {
          if (!entry.isFile() || !ROLLOUT_SESSION_FILE.test(entry.name)) continue
          files.push(path.join(day, entry.name))
          if (files.length === maxCandidates) return files
        }
      }
    }
  }

  return files
}

function isValidCalendarDate(yearPath: string, monthPath: string, dayPath: string): boolean {
  const year = Number(path.basename(yearPath))
  const month = Number(path.basename(monthPath))
  const day = Number(path.basename(dayPath))
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

async function matchingDirectories(directory: string, pattern: RegExp): Promise<string[]> {
  return (await readDirectory(directory))
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .sort((left, right) => right.name.localeCompare(left.name))
    .map((entry) => path.join(directory, entry.name))
}

async function readDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return []
  }
}

async function readTailLines(filePath: string, maxBytes: number): Promise<string[]> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(filePath, 'r')
    const size = (await handle.stat()).size
    const start = Math.max(0, size - maxBytes)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const content = buffer.toString('utf8')
    const completeContent = start === 0 ? content : content.slice(content.indexOf('\n') + 1)
    return completeContent.trimEnd().split('\n').filter(Boolean)
  } catch {
    return []
  } finally {
    await handle?.close()
  }
}

function parseRateLimitSample(line: string, sourceFile: string): RateLimitSample | undefined {
  try {
    const event = JSON.parse(line) as RateLimitEvent
    const rateLimits = event.payload?.rate_limits
    if (!rateLimits) return undefined

    const accountIds = new Set([event.payload?.account_id, event.payload?.accountId, rateLimits.account_id, rateLimits.accountId].filter((accountId): accountId is string => Boolean(accountId)))
    if (accountIds.size !== 1) return undefined

    return {
      ts: event.timestamp ?? '',
      sourceFile,
      accountId: accountIds.values().next().value,
      primary: rateLimits.primary,
      secondary: rateLimits.secondary,
      plan_type: rateLimits.plan_type
    }
  } catch {
    return undefined
  }
}

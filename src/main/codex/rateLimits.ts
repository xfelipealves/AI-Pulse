import type { Dirent } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const FIFTEEN_MINUTES_MS = 15 * 60_000
const MAX_SESSION_FILES = 80
const MAX_TAIL_BYTES = 64 * 1024

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
  const files: string[] = []
  const directories = [sessionRoot]

  for (let index = 0; index < directories.length; index += 1) {
    let entries: Dirent[]
    try {
      entries = await readdir(directories[index], { withFileTypes: true, encoding: 'utf8' })
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryPath = path.join(directories[index], entry.name)
      if (entry.isDirectory()) {
        directories.push(entryPath)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(entryPath)
      }
    }
  }

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

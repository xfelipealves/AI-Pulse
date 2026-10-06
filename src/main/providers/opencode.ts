import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Account, UsageWindow } from '../../shared/types'
import { fetchJson, isAuthError, record, text, percent, type FetchJson } from './http'

const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
const WINDOWS: Array<[key: string, label: string]> = [
  ['rolling', '5h'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly']
]

export type OpenCodeOptions = {
  home: string
  /** Key saved in AI Pulse settings; otherwise `OPENCODE_API_KEY`, then the key saved by OpenCode's `/connect`. */
  apiKey?: string
  env?: NodeJS.ProcessEnv
  fetch?: FetchJson
  now?: () => number
}

/** OpenCode Go subscription meters (rolling 5h, weekly, monthly). */
export async function loadOpenCode(options: OpenCodeOptions): Promise<Account[]> {
  const key = options.apiKey ?? (options.env ?? process.env).OPENCODE_API_KEY ?? (await savedKey(options.home))
  const account: Account = { id: 'opencode', provider: 'opencode', plan: 'OpenCode Go', active: true, windows: [] }
  if (!key) return [{ ...account, error: 'Add your OpenCode Go API key in Settings.' }]
  try {
    return [{ ...account, windows: parseUsage(await (options.fetch ?? fetchJson)(USAGE_URL, { Authorization: `Bearer ${key}` }), (options.now ?? Date.now)()) }]
  } catch (error) {
    return [{ ...account, error: isAuthError(error) ? 'The OpenCode Go API key was rejected.' : 'Usage unavailable' }]
  }
}

export function parseUsage(body: unknown, now: number): UsageWindow[] {
  const usage = record(record(body)?.usage)
  return WINDOWS.flatMap(([key, label]) => {
    const window = record(usage?.[key])
    const usedPercent = percent(window?.usagePercent)
    if (usedPercent === undefined) return []
    const resetIn = window?.resetInSec
    return [{ label, usedPercent, resetsAt: typeof resetIn === 'number' ? new Date(now + resetIn * 1000).toISOString() : undefined }]
  })
}

async function savedKey(home: string): Promise<string | undefined> {
  try {
    const auth = record(JSON.parse(await readFile(path.join(home, '.local/share/opencode/auth.json'), 'utf8')))
    return text(record(auth?.['opencode-go'])?.key) ?? text(record(auth?.opencode)?.key)
  } catch {
    return undefined
  }
}

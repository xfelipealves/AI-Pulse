import type { Account, UsageWindow } from '../../shared/types'
import { fetchJson, isAuthError, percent, record, text, type FetchJson } from './http'

const API_BASE = { global: 'https://api.minimax.io', cn: 'https://api.minimaxi.com' }
const REMAINS_PATH = '/v1/api/openplatform/coding_plan/remains'

export type MiniMaxOptions = {
  apiKey?: string
  region: 'global' | 'cn'
  fetch?: FetchJson
}

/** MiniMax Coding Plan quota: the current interval and the weekly allowance. */
export async function loadMiniMax(options: MiniMaxOptions): Promise<Account[]> {
  const account: Account = { id: 'minimax', provider: 'minimax', plan: 'Coding Plan', active: true, windows: [] }
  if (!options.apiKey) return [{ ...account, error: 'Add your MiniMax API key in Settings.' }]
  try {
    const body = record(await (options.fetch ?? fetchJson)(`${API_BASE[options.region]}${REMAINS_PATH}`, { Authorization: `Bearer ${options.apiKey}` }))
    const status = record(body?.base_resp)?.status_code
    if (typeof status === 'number' && status !== 0) return [{ ...account, error: text(record(body?.base_resp)?.status_msg) ?? 'Usage unavailable' }]
    return [{ ...account, plan: text(body?.current_subscribe_title) ?? text(body?.plan_name) ?? account.plan, windows: parseRemains(body) }]
  } catch (error) {
    return [{ ...account, error: isAuthError(error) ? 'The MiniMax API key was rejected.' : 'Usage unavailable' }]
  }
}

/**
 * Uses the `general` model bucket (or the first one). MiniMax reports what is left:
 * `current_interval_usage_count` is the remaining count despite its name.
 */
export function parseRemains(body: unknown): UsageWindow[] {
  const items = Array.isArray(record(body)?.model_remains) ? (record(body)!.model_remains as unknown[]).map(record) : []
  const item = items.find((entry) => text(entry?.model_name)?.toLowerCase() === 'general') ?? items[0]
  if (!item) return []
  const windows: UsageWindow[] = []
  const interval = usedPercent(item.current_interval_remaining_percent, item.current_interval_usage_count, item.current_interval_total_count)
  if (interval !== undefined) windows.push({ label: 'Interval', usedPercent: interval, resetsAt: epoch(item.end_time) })
  const weekly = usedPercent(item.current_weekly_remaining_percent, item.current_weekly_usage_count, item.current_weekly_total_count)
  if (weekly !== undefined) windows.push({ label: 'Weekly', usedPercent: weekly, resetsAt: epoch(item.weekly_end_time) })
  return windows
}

function usedPercent(remainingPercent: unknown, remaining: unknown, total: unknown): number | undefined {
  const left = percent(remainingPercent)
  if (left !== undefined) return Math.round((100 - left) * 10) / 10
  if (typeof remaining === 'number' && typeof total === 'number' && total > 0) return percent((1 - remaining / total) * 100)
  return undefined
}

function epoch(value: unknown): string | undefined {
  if (typeof value !== 'number' || value <= 0) return undefined
  return new Date(value > 1e12 ? value : value * 1000).toISOString()
}

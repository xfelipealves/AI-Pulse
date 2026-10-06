import path from 'node:path'
import type { Account, UsageWindow } from '../../shared/types'
import { readProfiles, type Profile } from './codexProfiles'
import type { SessionScanOptions, UsageSample } from './codexSessions'
import { capitalize, fetchJson, isAuthError, percent, record, text, windowLabel, type FetchJson } from './http'

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

export type CodexOptions = {
  codexHome: string
  latestSamples: (options: SessionScanOptions) => Promise<Map<string, UsageSample>>
  fetch?: FetchJson
  now?: () => number
}

/**
 * One account per ChatGPT account ID found in `auth.json` and `auth-profiles/*.json`.
 * Usage comes from the live usage API; when a saved token no longer works, the latest
 * limits Codex wrote to local session files are used instead. Tokens are never refreshed.
 */
export async function loadCodex(options: CodexOptions): Promise<Account[]> {
  const profiles = uniqueAccounts(await readProfiles(options.codexHome))
  const activeId = profiles.find((profile) => profile.key === 'default')?.accountId
  let localSamples: Promise<Map<string, UsageSample>> | undefined
  const samples = (): Promise<Map<string, UsageSample>> =>
    (localSamples ??= options.latestSamples({
      sessionsDir: path.join(options.codexHome, 'sessions'),
      accountIds: profiles.map((profile) => profile.accountId!),
      now: options.now
    }))

  return Promise.all(
    profiles.map(async (profile): Promise<Account> => {
      const base: Account = {
        id: `codex:${profile.accountId}`,
        provider: 'codex',
        email: profile.email,
        plan: profile.planType ? `ChatGPT ${capitalize(profile.planType)}` : undefined,
        active: profile.accountId === activeId,
        windows: []
      }
      try {
        if (!profile.accessToken) throw new Error('missing token')
        return { ...base, ...parseUsage(await (options.fetch ?? fetchJson)(USAGE_URL, { Authorization: `Bearer ${profile.accessToken}`, 'ChatGPT-Account-Id': profile.accountId! })) }
      } catch (error) {
        const sample = (await samples()).get(profile.accountId!)
        if (sample) return { ...base, windows: sampleWindows(sample), updatedAt: sample.sampledAt }
        return { ...base, error: isAuthError(error) || !profile.accessToken ? 'Login expired. Sign in to this account with Codex.' : 'Usage unavailable' }
      }
    })
  )
}

export function parseUsage(body: unknown): Pick<Account, 'windows'> & { email?: string; plan?: string } {
  const data = record(body)
  const limits = record(data?.rate_limit)
  const windows = [limits?.primary_window, limits?.secondary_window].map(toWindow).filter((window): window is UsageWindow => window !== undefined)
  const planType = text(data?.plan_type)
  return {
    windows,
    ...(text(data?.email) ? { email: text(data?.email) } : {}),
    ...(planType ? { plan: `ChatGPT ${capitalize(planType)}` } : {})
  }
}

function toWindow(raw: unknown): UsageWindow | undefined {
  const window = record(raw)
  const usedPercent = percent(window?.used_percent)
  if (usedPercent === undefined) return undefined
  const resetAt = window?.reset_at
  return {
    label: windowLabel(typeof window?.limit_window_seconds === 'number' ? window.limit_window_seconds : undefined),
    usedPercent,
    resetsAt: typeof resetAt === 'number' ? new Date(resetAt * 1000).toISOString() : undefined
  }
}

function sampleWindows(sample: UsageSample): UsageWindow[] {
  return [sample.primary, sample.secondary]
    .filter((window) => window !== undefined)
    .map((window) => ({ label: windowLabel(window.windowMinutes ? window.windowMinutes * 60 : undefined), usedPercent: window.usedPercent, resetsAt: window.resetsAt }))
}

/** Keeps the first profile per account ID (`default` first); profiles without an ID are dropped. */
function uniqueAccounts(profiles: Profile[]): Profile[] {
  const seen = new Set<string>()
  return profiles.filter((profile) => {
    if (!profile.accountId || seen.has(profile.accountId)) return false
    seen.add(profile.accountId)
    return true
  })
}

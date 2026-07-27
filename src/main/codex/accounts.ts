import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import type { PulseAccount } from '../../shared'
import { discoverProfiles, readAuth } from './auth'
import { doctorChecker, resolveCodexCommand, type DoctorCheck } from './cli'
import { readLatestRateLimitSample, type RateLimitSample } from './rateLimits'

type ManualAccount = {
  label?: string
  plan?: string
  email?: string
}

export type ManualConfig = {
  accounts?: Record<string, ManualAccount>
}

type DoctorChecker = {
  check: (command: string) => Promise<DoctorCheck>
}

export type LoadCodexAccountsOptions = {
  codexHome?: string
  manualConfigPath?: string
  command?: string
  now?: () => number
  doctor?: DoctorChecker
}

export async function loadCodexAccounts(options: LoadCodexAccountsOptions = {}): Promise<PulseAccount[]> {
  const codexHome = options.codexHome ?? path.join(homedir(), '.codex')
  const manualConfigPath = options.manualConfigPath ?? path.join(homedir(), '.ai-pulse.json')
  const now = options.now ?? Date.now
  const command = options.command ?? resolveCodexCommand(process.env)
  const doctor = options.doctor ?? doctorChecker
  const [profiles, manualConfig, activeAuth] = await Promise.all([discoverProfiles(codexHome), readManualConfig(manualConfigPath), readAuth(path.join(codexHome, 'auth.json'))])
  if (profiles.length === 0) return []

  const activeAccountId = activeAuth?.tokens?.account_id
  const rateSample = await readLatestRateLimitSample({
    sessionRoot: path.join(codexHome, 'sessions'),
    activeAccountId,
    now
  })
  const doctorResult = profiles.some((profile) => profile.id === 'default') ? await doctor.check(command) : undefined
  const updatedAt = new Date(now()).toISOString()

  return Promise.all(
    profiles.map(async (profile) => {
      const auth = await readAuth(profile.filePath)
      const manual = manualAccountFor(manualConfig, profile.id)
      const isActiveAccount = auth?.tokens?.account_id === activeAccountId
      const profileRateSample = isActiveAccount ? rateSample : undefined
      const hasLocalAuth = Boolean(auth?.tokens?.account_id && auth.tokens.id_token)
      const primaryUsed = profileRateSample?.primary?.used_percent
      const secondaryUsed = profileRateSample?.secondary?.used_percent
      const remainingPercent = typeof primaryUsed === 'number' ? Math.max(0, Math.round(100 - primaryUsed)) : undefined
      const status = !hasLocalAuth ? 'error' : profileRateSample ? 'ok' : 'warning'
      const doctorDetail = profile.id === 'default' && doctorResult ? doctorResult : undefined

      return {
        id: profile.id,
        label: manual.label ?? labelForProfile(profile.id),
        provider: 'codex',
        plan: planLabel(profileRateSample?.plan_type, manual.plan),
        accountId: auth?.tokens?.account_id,
        status,
        statusText: statusTextFor(status, profileRateSample != null, isActiveAccount),
        lastRefresh: auth?.last_refresh,
        updatedAt,
        remainingPercent,
        usagePercent: primaryUsed,
        usedLabel: profileRateSample ? `5h ${formatUsed(primaryUsed)} | Weekly ${formatUsed(secondaryUsed)}` : '5h -- | Weekly --',
        resetLabel: profileRateSample
          ? `5h resets ${formatReset(profileRateSample.primary?.resets_at, now())} | Week ${formatReset(profileRateSample.secondary?.resets_at, now())}`
          : 'No recent Codex limit sample',
        details: [
          { label: 'auth file', value: hasLocalAuth ? 'local login found' : 'missing token', tone: hasLocalAuth ? 'ok' : 'error' },
          {
            label: 'doctor',
            value: doctorDetail ? doctorDetail.statusText : 'not checked for non-default profile',
            tone: doctorDetail ? (doctorDetail.status === 'error' ? 'warning' : doctorDetail.status) : 'warning'
          },
          { label: 'limits', value: sourceStatus(profileRateSample, isActiveAccount), tone: profileRateSample ? 'ok' : 'warning' },
          { label: 'profile', value: profile.id },
          { label: 'email', value: manual.email ?? decodeEmail(auth?.tokens?.id_token) ?? 'unknown' },
          { label: 'sample time', value: profileRateSample ? formatIso(profileRateSample.ts) : 'none' },
          { label: 'account id', value: auth?.tokens?.account_id ? shortId(auth.tokens.account_id) : 'unknown' }
        ]
      } satisfies PulseAccount
    })
  )
}

export function manualConfigExample(): ManualConfig {
  return {
    accounts: {
      default: { label: 'Codex Personal', email: 'first@example.com', plan: 'ChatGPT Plus' },
      work: { label: 'Codex Work', email: 'second@example.com', plan: 'ChatGPT Plus' }
    }
  }
}

async function readManualConfig(filePath: string): Promise<ManualConfig> {
  try {
    return normalizeManualConfig(JSON.parse(await readFile(filePath, 'utf8')))
  } catch {
    return {}
  }
}

function normalizeManualConfig(value: unknown): ManualConfig {
  if (!value || typeof value !== 'object' || !('accounts' in value) || !value.accounts || typeof value.accounts !== 'object') return {}

  const accounts = Object.fromEntries(Object.entries(value.accounts).map(([id, account]) => [id, normalizeManualAccount(account)]))
  return { accounts }
}

function normalizeManualAccount(value: unknown): ManualAccount {
  if (!value || typeof value !== 'object') return {}
  const account = value as Record<string, unknown>
  return {
    label: typeof account.label === 'string' ? account.label : undefined,
    plan: typeof account.plan === 'string' ? account.plan : undefined,
    email: typeof account.email === 'string' ? account.email : undefined
  }
}

function manualAccountFor(config: ManualConfig, id: string): ManualAccount {
  return config.accounts?.[id] ?? {}
}

function labelForProfile(id: string): string {
  if (id === 'default') return 'Codex'
  const suffix = id.replace(/^login/i, '')
  return suffix ? `Codex ${suffix}` : 'Codex'
}

function sourceStatus(sample: RateLimitSample | undefined, isActiveAccount: boolean): string {
  if (sample) return 'real sample'
  return isActiveAccount ? 'no limit sample' : 'inactive profile'
}

function decodeEmail(idToken?: string): string | undefined {
  try {
    const payload = idToken?.split('.')[1]
    if (!payload) return undefined
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { email?: string }
    return decoded.email
  } catch {
    return undefined
  }
}

function formatUsed(value?: number): string {
  return typeof value === 'number' ? `${Math.round(value)}% used` : '--'
}

function formatReset(epochSeconds: number | undefined, now: number): string {
  if (!epochSeconds) return '--'
  const diffMs = epochSeconds * 1000 - now
  if (diffMs <= 0) return 'now'
  const minutes = Math.round(diffMs / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${remainingMinutes}m`
  return `${remainingMinutes}m`
}

function formatIso(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function planLabel(planType?: string, manualPlan?: string): string {
  if (manualPlan) return manualPlan
  if (!planType) return 'ChatGPT'
  return planType === 'plus' ? 'ChatGPT Plus' : `ChatGPT ${planType}`
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function statusTextFor(status: PulseAccount['status'], hasRateSample: boolean, isActiveAccount: boolean): string {
  if (status === 'error') return 'login missing'
  if (hasRateSample) return 'live limits'
  return isActiveAccount ? 'waiting limits' : 'inactive'
}

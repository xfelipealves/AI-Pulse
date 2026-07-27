import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { PulseAccount } from '../shared'

const execFileAsync = promisify(execFile)

type CodexAuth = {
  last_refresh?: string
  tokens?: {
    account_id?: string
    id_token?: string
  }
}

type ManualLimit = {
  plan?: string
  email?: string
  label?: string
}

type ManualConfig = {
  accounts?: Record<string, ManualLimit>
}

const codexHome = path.join(homedir(), '.codex')
const profilesDir = path.join(codexHome, 'auth-profiles')
const manualConfigPath = path.join(homedir(), '.ai-pulse.json')
const codexBinary = '/opt/homebrew/bin/codex'

type RateLimitSample = {
  ts: string
  sourceFile: string
  primary?: { used_percent?: number; window_minutes?: number; resets_at?: number }
  secondary?: { used_percent?: number; window_minutes?: number; resets_at?: number }
  plan_type?: string
}

export async function loadCodexAccounts(): Promise<PulseAccount[]> {
  const [profiles, manualConfig, latestSample, activeAccountId] = await Promise.all([readProfiles(), readManualConfig(), readLatestRateLimitSample(), readActiveAccountId()])

  return Promise.all(
    profiles.map(async (profile) => {
      const auth = await readAuth(path.join(profilesDir, profile))
      const id = profile.replace(/\.json$/, '')
      const manual = manualConfig.accounts?.[id] ?? {}
      const doctor = await runDoctorForProfile(profile)
      const profileEmail = manual.email ?? decodeEmail(auth.tokens?.id_token)
      const hasLocalAuth = Boolean(auth.tokens?.account_id && auth.tokens?.id_token)
      const isActiveAccount = auth.tokens?.account_id === activeAccountId
      const rateSample = isActiveAccount ? latestSample : undefined
      const primaryUsed = rateSample?.primary?.used_percent
      const secondaryUsed = rateSample?.secondary?.used_percent
      const remainingPercent = typeof primaryUsed === 'number' ? Math.max(0, Math.round(100 - primaryUsed)) : undefined
      const usagePercent = primaryUsed
      const sourceStatus = rateSample ? 'real sample' : isActiveAccount ? 'no limit sample' : 'inactive profile'
      const visualStatus = !hasLocalAuth ? 'error' : rateSample ? 'ok' : 'warning'

      return {
        id,
        label: manual.label ?? labelForProfile(id),
        provider: 'codex',
        plan: planLabel(rateSample?.plan_type, manual.plan),
        accountId: auth.tokens?.account_id,
        status: visualStatus,
        statusText: statusTextFor(visualStatus, rateSample != null, isActiveAccount),
        lastRefresh: auth.last_refresh,
        updatedAt: new Date().toISOString(),
        remainingPercent,
        usagePercent,
        usedLabel: rateSample ? `5h ${formatUsed(primaryUsed)} | Weekly ${formatUsed(secondaryUsed)}` : '5h -- | Weekly --',
        resetLabel: rateSample ? `5h resets ${formatReset(rateSample.primary?.resets_at)} | Week ${formatReset(rateSample.secondary?.resets_at)}` : 'No recent Codex limit sample',
        details: [
          { label: 'auth file', value: hasLocalAuth ? 'local login found' : 'missing token', tone: hasLocalAuth ? 'ok' : 'error' },
          { label: 'doctor', value: doctor.statusText, tone: doctor.status === 'error' ? 'warning' : doctor.status },
          { label: 'limits', value: sourceStatus, tone: rateSample ? 'ok' : 'warning' },
          { label: 'profile', value: profile },
          { label: 'email', value: profileEmail ?? 'unknown' },
          { label: 'sample time', value: rateSample ? formatIso(rateSample.ts) : 'none' },
          { label: 'account id', value: auth.tokens?.account_id ? shortId(auth.tokens.account_id) : 'unknown' }
        ]
      }
    })
  )
}

export function manualConfigExample(): ManualConfig {
  return {
    accounts: {
      loginA: {
        label: 'Codex A',
        email: 'contaprogpt123@gmail.com',
        plan: 'ChatGPT Plus'
      },
      loginB: {
        label: 'Codex B',
        email: 'felipecamiloalves04@gmail.com',
        plan: 'ChatGPT Plus'
      }
    }
  }
}

async function readProfiles(): Promise<string[]> {
  try {
    const files = await readdir(profilesDir)
    return files.filter((file) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

async function readAuth(filePath: string): Promise<CodexAuth> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as CodexAuth
  } catch {
    return {}
  }
}

async function readManualConfig(): Promise<ManualConfig> {
  try {
    return JSON.parse(await readFile(manualConfigPath, 'utf8')) as ManualConfig
  } catch {
    return {}
  }
}

async function runDoctorForProfile(profile: string): Promise<{ status: PulseAccount['status']; statusText: string }> {
  const tempHome = await mkdtemp(path.join(tmpdir(), 'ai-pulse-codex-'))
  try {
    const auth = await readFile(path.join(profilesDir, profile), 'utf8')
    await writeFile(path.join(tempHome, 'auth.json'), auth)
    await writeFile(path.join(tempHome, 'config.toml'), 'approval_policy = "never"\nsandbox_mode = "danger-full-access"\n')

    const { stdout } = await execFileAsync(codexBinary, ['doctor', '--json'], {
      env: { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`, CODEX_HOME: tempHome },
      timeout: 15000,
      maxBuffer: 1024 * 1024
    })
    const report = JSON.parse(stdout) as { overallStatus?: string; checks?: Array<{ status?: string }> }
    const hasError = report.checks?.some((check) => check.status === 'error')
    const hasWarning = report.checks?.some((check) => check.status === 'warning')
    if (hasError || report.overallStatus === 'error') return { status: 'error', statusText: 'login problem' }
    if (hasWarning || report.overallStatus === 'warning') return { status: 'warning', statusText: 'login works, warning' }
    return { status: 'ok', statusText: 'login ok' }
  } catch (error) {
    return { status: 'error', statusText: error instanceof Error ? 'doctor failed' : 'doctor failed' }
  } finally {
    await rm(tempHome, { recursive: true, force: true })
  }
}

function labelForProfile(id: string): string {
  const suffix = id.replace(/^login/i, '')
  return suffix ? `Codex ${suffix}` : 'Codex'
}

function formatIso(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

async function readActiveAccountId(): Promise<string | undefined> {
  return (await readAuth(path.join(codexHome, 'auth.json'))).tokens?.account_id
}

async function readLatestRateLimitSample(): Promise<RateLimitSample | undefined> {
  const sessionRoot = path.join(codexHome, 'sessions')
  const files = await listJsonlFiles(sessionRoot)
  const sorted = (
    await Promise.all(
      files.map(async (file) => ({
        file,
        mtime: await stat(file)
          .then((value) => value.mtimeMs)
          .catch(() => 0)
      }))
    )
  ).sort((a, b) => b.mtime - a.mtime)

  for (const { file } of sorted.slice(0, 80)) {
    const sample = await readLatestRateLimitFromFile(file)
    if (sample) return sample
  }
  return undefined
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name)
        if (entry.isDirectory()) return listJsonlFiles(entryPath)
        return entry.name.endsWith('.jsonl') ? [entryPath] : []
      })
    )
    return nested.flat()
  } catch {
    return []
  }
}

async function readLatestRateLimitFromFile(file: string): Promise<RateLimitSample | undefined> {
  try {
    const lines = (await readFile(file, 'utf8')).trim().split('\n').reverse()
    for (const line of lines) {
      if (!line.includes('"rate_limits"')) continue
      const event = JSON.parse(line) as { timestamp?: string; payload?: { rate_limits?: Omit<RateLimitSample, 'ts' | 'sourceFile'> } }
      const rateLimits = event.payload?.rate_limits
      if (!rateLimits) continue
      return {
        ts: event.timestamp ?? new Date().toISOString(),
        sourceFile: file,
        ...rateLimits
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

function decodeEmail(idToken?: string): string | undefined {
  try {
    if (!idToken) return undefined
    const payload = idToken.split('.')[1]
    if (!payload) return undefined
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      email?: string
    }
    return decoded.email
  } catch {
    return undefined
  }
}

function formatUsed(value?: number): string {
  return typeof value === 'number' ? `${Math.round(value)}% used` : '--'
}

function formatReset(epochSeconds?: number): string {
  if (!epochSeconds) return '--'
  const diffMs = epochSeconds * 1000 - Date.now()
  if (diffMs <= 0) return 'now'
  const minutes = Math.round(diffMs / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function planLabel(planType?: string, fallback?: string): string {
  if (fallback) return fallback
  if (!planType) return 'ChatGPT'
  return planType === 'plus' ? 'ChatGPT Plus' : `ChatGPT ${planType}`
}

function statusTextFor(status: PulseAccount['status'], hasRateSample: boolean, isActiveAccount: boolean): string {
  if (status === 'error') return 'login missing'
  if (hasRateSample) return 'live limits'
  if (isActiveAccount) return 'waiting limits'
  return 'inactive'
}

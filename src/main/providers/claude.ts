import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Account, UsageWindow } from '../../shared/types'
import { capitalize, fetchJson, isAuthError, percent, record, text, type FetchJson } from './http'
import { readKeychain, type KeychainReader } from './keychain'

const execFileAsync = promisify(execFile)

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const KEYCHAIN_SERVICE = 'Claude Code-credentials'
const EXPIRED = 'Session expired. Re-authenticate this account.'
const WINDOWS: Array<[key: string, label: string]> = [
  ['five_hour', '5h'],
  ['seven_day', 'Weekly']
]

/** A Claude Code login: the default one, or one kept in its own `CLAUDE_CONFIG_DIR`. */
export type ClaudeLogin = {
  id: string
  /** `CLAUDE_CONFIG_DIR` for managed logins; undefined for the default `~/.claude` login. */
  configDir?: string
  keychainService: string
  email?: string
  addedAt?: string
}

/** Claude Code names the Keychain item after the config directory when `CLAUDE_CONFIG_DIR` is set. */
export function keychainServiceFor(configDir: string | undefined): string {
  return configDir ? `${KEYCHAIN_SERVICE}-${createHash('sha256').update(configDir).digest('hex').slice(0, 8)}` : KEYCHAIN_SERVICE
}

/** The default login plus every managed login under `managedRoot`. */
export async function listClaudeLogins(home: string, managedRoot: string): Promise<ClaudeLogin[]> {
  const managed = await Promise.all(
    (await directories(managedRoot)).map(async (name): Promise<ClaudeLogin> => {
      const configDir = path.join(managedRoot, name)
      return {
        id: `claude:${name}`,
        configDir,
        keychainService: keychainServiceFor(configDir),
        email: await readEmail(path.join(configDir, '.claude.json')),
        addedAt: await stat(configDir).then(
          (info) => info.birthtime.toISOString(),
          () => undefined
        )
      }
    })
  )
  return [{ id: 'claude:system', keychainService: KEYCHAIN_SERVICE, email: await readEmail(path.join(home, '.claude.json')) }, ...managed]
}

export type ClaudeOptions = {
  home: string
  managedRoot: string
  readKeychain?: KeychainReader
  /** Fallback for the default login when the Keychain has no item. */
  readCredentialsFile?: () => Promise<string | undefined>
  fetch?: FetchJson
  now?: () => number
  /** The usage endpoint rate-limits clients other than Claude Code, so requests identify as the installed version. */
  userAgent?: () => Promise<string>
}

let cachedUserAgent: Promise<string> | undefined

/** `claude-code/<version>` of the installed CLI, the client this endpoint serves. */
export function claudeCodeUserAgent(binary = 'claude'): Promise<string> {
  cachedUserAgent ??= execFileAsync(binary, ['--version'], { timeout: 10_000 }).then(
    ({ stdout }) => `claude-code/${/\d+\.\d+\.\d+/.exec(stdout)?.[0] ?? '2.1.0'}`,
    () => 'claude-code/2.1.0'
  )
  return cachedUserAgent
}

/** Usage for each signed-in Claude Code login, from the endpoint behind Claude Code's `/usage`. */
export async function loadClaude(options: ClaudeOptions): Promise<Account[]> {
  const keychain = options.readKeychain ?? readKeychain
  const readFallback = options.readCredentialsFile ?? (() => readFile(path.join(options.home, '.claude/.credentials.json'), 'utf8').catch(() => undefined))
  const logins = await listClaudeLogins(options.home, options.managedRoot)
  const systemEmail = logins[0].email

  const accounts = await Promise.all(
    logins
      // A managed login for the same person as the default login would only repeat it.
      .filter((login) => !login.configDir || !login.email || login.email !== systemEmail)
      .map(async (login) => {
        const raw = (await keychain(login.keychainService)) ?? (login.configDir ? undefined : await readFallback())
        return loadLogin(login, raw, options)
      })
  )
  return accounts.filter((account): account is Account => account !== undefined)
}

async function loadLogin(login: ClaudeLogin, raw: string | undefined, options: ClaudeOptions): Promise<Account | undefined> {
  const credentials = parseCredentials(raw)
  if (!credentials?.accessToken) return login.configDir ? { id: login.id, provider: 'claude', email: login.email, active: false, windows: [], error: EXPIRED } : undefined

  const account: Account = {
    id: login.id,
    provider: 'claude',
    email: login.email,
    plan: credentials.subscriptionType ? `Claude ${capitalize(credentials.subscriptionType)}` : undefined,
    active: !login.configDir,
    windows: []
  }
  if (credentials.expiresAt && credentials.expiresAt <= (options.now ?? Date.now)()) return { ...account, error: EXPIRED }

  try {
    const userAgent = await (options.userAgent ?? (() => claudeCodeUserAgent()))()
    const body = await (options.fetch ?? fetchJson)(USAGE_URL, { Authorization: `Bearer ${credentials.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': userAgent })
    return { ...account, windows: parseUsage(body) }
  } catch (error) {
    return { ...account, error: isAuthError(error) ? EXPIRED : 'Usage unavailable' }
  }
}

export function parseUsage(body: unknown): UsageWindow[] {
  const data = record(body)
  return WINDOWS.flatMap(([key, label]) => {
    const window = record(data?.[key])
    const usedPercent = percent(window?.utilization)
    return usedPercent === undefined ? [] : [{ label, usedPercent, resetsAt: text(window?.resets_at) }]
  })
}

type Credentials = { accessToken?: string; expiresAt?: number; subscriptionType?: string }

function parseCredentials(raw: string | undefined): Credentials | undefined {
  if (!raw) return undefined
  try {
    const oauth = record(record(JSON.parse(raw))?.claudeAiOauth)
    return {
      accessToken: text(oauth?.accessToken),
      expiresAt: typeof oauth?.expiresAt === 'number' ? oauth.expiresAt : undefined,
      subscriptionType: text(oauth?.subscriptionType)
    }
  } catch {
    return undefined
  }
}

async function readEmail(configPath: string): Promise<string | undefined> {
  try {
    return text(record(record(JSON.parse(await readFile(configPath, 'utf8')))?.oauthAccount)?.emailAddress)
  } catch {
    return undefined
  }
}

async function directories(root: string): Promise<string[]> {
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

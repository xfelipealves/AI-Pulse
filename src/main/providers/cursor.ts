import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Account, UsageWindow } from '../../shared/types'
import { capitalize, fetchJson, isAuthError, percent, record, text, type FetchJson } from './http'
import { readKeychain, type KeychainReader } from './keychain'

const execFileAsync = promisify(execFile)
const USAGE_URL = 'https://cursor.com/api/usage-summary'
const ME_URL = 'https://cursor.com/api/auth/me'
const STATE_DB = 'Library/Application Support/Cursor/User/globalStorage/state.vscdb'
/** Where the Cursor CLI (`cursor-agent`) keeps its session. */
const AGENT_KEYCHAIN_SERVICE = 'cursor-access-token'

export type CursorState = { accessToken?: string; email?: string; membership?: string }

export type CursorOptions = {
  home: string
  readKeychain?: KeychainReader
  /** Defaults to reading the Cursor app's local state database with the system `sqlite3`. */
  readAppState?: () => Promise<CursorState | undefined>
  fetch?: FetchJson
}

/**
 * The signed-in Cursor account (CLI session first, then the Cursor app), with the three
 * meters Cursor's dashboard shows for the billing cycle: total, Cursor models (`Cursor`) and other models (`Other`).
 */
export async function loadCursor(options: CursorOptions): Promise<Account[]> {
  const agentToken = await (options.readKeychain ?? readKeychain)(AGENT_KEYCHAIN_SERVICE)
  const appState = agentToken ? undefined : await (options.readAppState ?? (() => readAppState(path.join(options.home, STATE_DB))))()
  const accessToken = agentToken ?? appState?.accessToken
  const userId = userIdFromToken(accessToken)
  if (!accessToken || !userId) return []

  const fetch = options.fetch ?? fetchJson
  const headers = { Cookie: `WorkosCursorSessionToken=${userId}%3A%3A${accessToken}` }
  const account: Account = { id: 'cursor', provider: 'cursor', email: appState?.email, active: true, windows: [] }
  try {
    const [summary, me] = await Promise.all([fetch(USAGE_URL, headers), fetch(ME_URL, headers).catch(() => undefined)])
    const membership = text(record(summary)?.membershipType) ?? appState?.membership
    return [
      {
        ...account,
        email: text(record(me)?.email) ?? account.email,
        plan: membership ? `Cursor ${capitalize(membership)}` : undefined,
        windows: parseUsage(summary)
      }
    ]
  } catch (error) {
    return [{ ...account, error: isAuthError(error) ? 'Session expired. Sign in to Cursor again.' : 'Usage unavailable' }]
  }
}

export function parseUsage(body: unknown): UsageWindow[] {
  const data = record(body)
  const plan = record(record(data?.individualUsage)?.plan)
  const resetsAt = text(data?.billingCycleEnd)
  const used = typeof plan?.used === 'number' ? plan.used : undefined
  const limit = typeof plan?.limit === 'number' && plan.limit > 0 ? plan.limit : undefined
  const total = percent(plan?.totalPercentUsed) ?? (used !== undefined && limit ? percent((used / limit) * 100) : undefined)
  const meters: Array<[string, number | undefined]> = [
    ['Total', total],
    ['Cursor', percent(plan?.autoPercentUsed)],
    ['Other', percent(plan?.apiPercentUsed)]
  ]
  return meters.flatMap(([label, usedPercent]) => (usedPercent === undefined ? [] : [{ label, usedPercent, resetsAt }]))
}

/** Cursor tokens carry `sub: "<provider>|<userId>"`; the web session cookie needs the user ID. */
export function userIdFromToken(token: string | undefined): string | undefined {
  const payload = token?.split('.')[1]
  if (!payload) return undefined
  try {
    const sub = text(record(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))?.sub)
    return sub?.split('|').at(-1)
  } catch {
    return undefined
  }
}

async function readAppState(dbPath: string): Promise<CursorState | undefined> {
  try {
    await access(dbPath)
    const query = "select key, value from ItemTable where key in ('cursorAuth/accessToken', 'cursorAuth/cachedEmail', 'cursorAuth/stripeMembershipType')"
    const { stdout } = await execFileAsync('/usr/bin/sqlite3', ['-readonly', '-json', dbPath, query], { timeout: 10_000 })
    const rows = JSON.parse(stdout || '[]') as Array<{ key: string; value: string }>
    const value = (key: string): string | undefined => rows.find((row) => row.key === `cursorAuth/${key}`)?.value || undefined
    return { accessToken: value('accessToken'), email: value('cachedEmail'), membership: value('stripeMembershipType') }
  } catch {
    return undefined
  }
}

import { readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { Account, UsageWindow } from '../../shared/types'
import { HttpError, fetchJson, record, text, type FetchJson } from './http'

const CODE_ASSIST = 'https://cloudcode-pa.googleapis.com/v1internal'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLIENT_ID = /OAUTH_CLIENT_ID\s*=\s*['"]([\w.-]+)['"]/
const CLIENT_SECRET = /OAUTH_CLIENT_SECRET\s*=\s*['"]([\w-]+)['"]/

type OAuthClient = { clientId: string; clientSecret: string }
type StoredCredentials = { access_token?: string; refresh_token?: string; expiry_date?: number; id_token?: string }

export type GeminiOptions = {
  home: string
  /** OAuth client of the installed Gemini CLI, needed to renew its short-lived access token. */
  findOAuthClient?: () => Promise<OAuthClient | undefined>
  fetch?: FetchJson
  now?: () => number
}

let renewed: { refreshToken: string; accessToken: string; expiresAt: number } | undefined

/**
 * Per-model quota of the Gemini CLI login (`~/.gemini/oauth_creds.json`). An expired access
 * token is renewed in memory only; Google refresh tokens do not rotate, so the CLI's file stays valid.
 */
export async function loadGemini(options: GeminiOptions): Promise<Account[]> {
  const now = options.now ?? Date.now
  const fetch = options.fetch ?? fetchJson
  let stored: StoredCredentials
  try {
    stored = JSON.parse(await readFile(path.join(options.home, '.gemini/oauth_creds.json'), 'utf8')) as StoredCredentials
  } catch {
    return []
  }
  if (!stored.access_token && !stored.refresh_token) return []

  const account: Account = { id: 'gemini', provider: 'gemini', email: emailFromIdToken(stored.id_token), active: true, windows: [] }
  try {
    const token = await accessToken(stored, options, now)
    const headers = { Authorization: `Bearer ${token}` }
    const assist = record(await fetch(`${CODE_ASSIST}:loadCodeAssist`, headers, { metadata: { ideType: 'GEMINI_CLI', pluginType: 'GEMINI' } }))
    const project = text(assist?.cloudaicompanionProject) ?? text(record(assist?.cloudaicompanionProject)?.id)
    const plan = text(record(assist?.paidTier)?.name) ?? text(record(assist?.currentTier)?.name)
    const quota = await fetch(`${CODE_ASSIST}:retrieveUserQuota`, headers, project ? { project } : {})
    return [{ ...account, plan, windows: parseQuota(quota) }]
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) return [{ ...account, error: 'This Google account has no Gemini CLI quota.' }]
    if (error instanceof HttpError && (error.status === 400 || error.status === 401)) return [{ ...account, error: 'Session expired. Run `gemini` to sign in again.' }]
    return [{ ...account, error: 'Usage unavailable' }]
  }
}

/** One meter per model family (Pro, Flash, …), using the most constrained model of each. */
export function parseQuota(body: unknown): UsageWindow[] {
  const buckets = Array.isArray(record(body)?.buckets) ? (record(body)!.buckets as unknown[]) : []
  const families = new Map<string, UsageWindow>()
  for (const raw of buckets) {
    const bucket = record(raw)
    const model = text(bucket?.modelId)
    const remaining = bucket?.remainingFraction
    if (!model || typeof remaining !== 'number') continue
    const label = familyOf(model)
    const usedPercent = Math.min(100, Math.max(0, Math.round((1 - remaining) * 1000) / 10))
    const current = families.get(label)
    if (!current || usedPercent > current.usedPercent) families.set(label, { label, usedPercent, resetsAt: text(bucket?.resetTime) })
  }
  return [...families.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function familyOf(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('flash-lite')) return 'Flash Lite'
  if (lower.includes('flash')) return 'Flash'
  if (lower.includes('pro')) return 'Pro'
  return model
}

async function accessToken(stored: StoredCredentials, options: GeminiOptions, now: () => number): Promise<string> {
  if (stored.access_token && stored.expiry_date && stored.expiry_date > now() + 60_000) return stored.access_token
  if (!stored.refresh_token) throw new HttpError(401)
  if (renewed?.refreshToken === stored.refresh_token && renewed.expiresAt > now() + 60_000) return renewed.accessToken

  const client = await (options.findOAuthClient ?? (() => findGeminiOAuthClient()))()
  if (!client) throw new HttpError(401)
  const body = new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, refresh_token: stored.refresh_token, grant_type: 'refresh_token' })
  const response = record(await (options.fetch ?? fetchJson)(TOKEN_URL, {}, body))
  const token = text(response?.access_token)
  if (!token) throw new HttpError(401)
  const expiresIn = typeof response?.expires_in === 'number' ? response.expires_in : 3600
  renewed = { refreshToken: stored.refresh_token, accessToken: token, expiresAt: now() + expiresIn * 1000 }
  return token
}

/** Finds the OAuth client constants in the installed Gemini CLI bundle. */
export async function findGeminiOAuthClient(binaries = ['/opt/homebrew/bin/gemini', '/usr/local/bin/gemini']): Promise<OAuthClient | undefined> {
  for (const binary of binaries) {
    try {
      const packageRoot = await packageRootOf(await realpath(binary))
      for (const directory of [path.join(packageRoot, 'bundle'), path.join(packageRoot, 'dist')]) {
        const files = (await readdir(directory).catch(() => [] as string[])).filter((file) => file.endsWith('.js'))
        for (const file of files) {
          const source = await readFile(path.join(directory, file), 'utf8')
          const clientId = CLIENT_ID.exec(source)?.[1]
          const clientSecret = CLIENT_SECRET.exec(source)?.[1]
          if (clientId && clientSecret) return { clientId, clientSecret }
        }
      }
    } catch {
      // Try the next location.
    }
  }
  return undefined
}

async function packageRootOf(file: string): Promise<string> {
  let directory = path.dirname(file)
  while (directory !== path.dirname(directory)) {
    const manifest = await readFile(path.join(directory, 'package.json'), 'utf8').catch(() => undefined)
    if (manifest && text(record(JSON.parse(manifest))?.name) === '@google/gemini-cli') return directory
    directory = path.dirname(directory)
  }
  throw new Error('Gemini CLI package not found')
}

function emailFromIdToken(token: string | undefined): string | undefined {
  const payload = token?.split('.')[1]
  if (!payload) return undefined
  try {
    return text(record(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))?.email)
  } catch {
    return undefined
  }
}

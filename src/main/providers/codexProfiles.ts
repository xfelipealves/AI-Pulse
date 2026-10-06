import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export type Profile = {
  key: string
  filePath: string
  accountId?: string
  /** Kept in memory only, to query the usage API. */
  accessToken?: string
  email?: string
  planType?: string
  lastRefresh?: string
  authenticated: boolean
}

type AuthFile = {
  last_refresh?: string
  tokens?: { account_id?: string; id_token?: string; access_token?: string }
}

type IdTokenClaims = {
  email?: string
  'https://api.openai.com/auth'?: { chatgpt_plan_type?: string }
}

/** Reads `auth.json` (key `default`) and `auth-profiles/*.json`. Unreadable files are skipped. */
export async function readProfiles(codexHome: string): Promise<Profile[]> {
  const profilesDir = path.join(codexHome, 'auth-profiles')
  const named = (await listJsonFiles(profilesDir)).map((file) => ({ key: path.basename(file, '.json'), filePath: path.join(profilesDir, file) }))
  const candidates = [{ key: 'default', filePath: path.join(codexHome, 'auth.json') }, ...named]
  const profiles = await Promise.all(candidates.map(({ key, filePath }) => readProfile(key, filePath)))
  return profiles.filter((profile): profile is Profile => profile !== undefined)
}

export async function readProfile(key: string, filePath: string): Promise<Profile | undefined> {
  let auth: AuthFile
  try {
    auth = JSON.parse(await readFile(filePath, 'utf8')) as AuthFile
  } catch {
    return undefined
  }
  if (!auth || typeof auth !== 'object') return undefined

  const accountId = stringOrUndefined(auth.tokens?.account_id)
  const idToken = stringOrUndefined(auth.tokens?.id_token)
  const claims = decodeJwtClaims(idToken)
  return {
    key,
    filePath,
    accountId,
    accessToken: stringOrUndefined(auth.tokens?.access_token),
    email: stringOrUndefined(claims?.email),
    planType: stringOrUndefined(claims?.['https://api.openai.com/auth']?.chatgpt_plan_type),
    lastRefresh: stringOrUndefined(auth.last_refresh),
    authenticated: Boolean(accountId && idToken)
  }
}

export function decodeJwtClaims(token: string | undefined): IdTokenClaims | undefined {
  const payload = token?.split('.')[1]
  if (!payload) return undefined
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return claims && typeof claims === 'object' ? (claims as IdTokenClaims) : undefined
  } catch {
    return undefined
  }
}

async function listJsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith('.json')).sort()
  } catch {
    return []
  }
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

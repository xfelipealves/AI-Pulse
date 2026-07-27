import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export type CodexAuth = {
  last_refresh?: string
  tokens?: {
    account_id?: string
    id_token?: string
  }
}

export type CodexProfile = {
  id: string
  filePath: string
}

export async function discoverProfiles(codexHome: string): Promise<CodexProfile[]> {
  const defaultProfile = { id: 'default', filePath: path.join(codexHome, 'auth.json') }
  const profilesDirectory = path.join(codexHome, 'auth-profiles')
  const candidates = [defaultProfile, ...(await namedProfiles(profilesDirectory))]
  const accountIds = new Set<string>()
  const profiles: CodexProfile[] = []

  for (const profile of candidates) {
    const auth = await readAuth(profile.filePath)
    if (!auth) continue
    const accountId = auth.tokens?.account_id
    if (accountId && accountIds.has(accountId)) continue
    if (accountId) accountIds.add(accountId)
    profiles.push(profile)
  }

  return profiles
}

export async function readAuth(filePath: string): Promise<CodexAuth | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as CodexAuth
  } catch {
    return undefined
  }
}

async function namedProfiles(profilesDirectory: string): Promise<CodexProfile[]> {
  try {
    const files = await readdir(profilesDirectory)
    return files
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({ id: path.basename(file, '.json'), filePath: path.join(profilesDirectory, file) }))
  } catch {
    return []
  }
}

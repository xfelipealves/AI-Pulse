import { access, chmod, copyFile, mkdir, mkdtemp, rename, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ManagedAccount } from '../../shared/types'
import { readProfile, readProfiles, type Profile } from '../providers/codexProfiles'

/** Codex accounts: `auth.json` (the system login) plus saved profiles in `auth-profiles/`. */
export async function listCodexAccounts(codexHome: string): Promise<ManagedAccount[]> {
  const profiles = (await readProfiles(codexHome)).filter((profile) => profile.accountId)
  const activeId = profiles.find((profile) => profile.key === 'default')?.accountId
  const groups = new Map<string, Profile[]>()
  for (const profile of profiles) groups.set(profile.accountId!, [...(groups.get(profile.accountId!) ?? []), profile])

  return [...groups.entries()].map(([accountId, group]) => {
    const active = accountId === activeId
    const hasSaved = group.some((profile) => profile.key !== 'default')
    return {
      id: `codex:${accountId}`,
      provider: 'codex',
      email: group.find((profile) => profile.email)?.email,
      system: group.some((profile) => profile.key === 'default'),
      active,
      canActivate: !active && hasSaved,
      canRemove: !active && hasSaved
    }
  })
}

/**
 * Makes a saved profile the system login by copying it to `auth.json`. The current login
 * is saved as a profile first when it has none, so switching never loses an account.
 */
export async function activateCodexAccount(codexHome: string, id: string): Promise<void> {
  const profiles = await readProfiles(codexHome)
  const target = profiles.find((profile) => profile.key !== 'default' && `codex:${profile.accountId}` === id)
  if (!target) throw new Error('Account not found')
  const current = profiles.find((profile) => profile.key === 'default')
  if (current?.accountId && !profiles.some((profile) => profile.key !== 'default' && profile.accountId === current.accountId)) {
    await saveProfile(codexHome, current.filePath, current.email)
  }
  await atomicCopy(target.filePath, path.join(codexHome, 'auth.json'))
}

/** Deletes the saved profiles of an account that is not the system login. */
export async function removeCodexAccount(codexHome: string, id: string): Promise<void> {
  const profiles = (await readProfiles(codexHome)).filter((profile) => `codex:${profile.accountId}` === id)
  if (profiles.some((profile) => profile.key === 'default')) throw new Error('The active Codex login cannot be removed here')
  await Promise.all(profiles.map((profile) => unlink(profile.filePath)))
}

/** Temporary `CODEX_HOME` for `codex login`, so the system login is untouched until the result is stored. */
export async function codexLoginHome(scratchRoot: string): Promise<string> {
  await mkdir(scratchRoot, { recursive: true })
  return mkdtemp(path.join(scratchRoot, 'codex-login-'))
}

/**
 * Stores the login written to `loginHome`: it replaces the saved profiles of the same account
 * (and `auth.json` when that account is active), or becomes a new saved profile.
 */
export async function storeCodexLogin(codexHome: string, loginHome: string): Promise<string> {
  try {
    const fresh = await readProfile('login', path.join(loginHome, 'auth.json'))
    if (!fresh?.accountId) throw new Error('Codex did not save a login')
    const profiles = await readProfiles(codexHome)
    const matches = profiles.filter((profile) => profile.accountId === fresh.accountId)
    await Promise.all(matches.map((profile) => atomicCopy(fresh.filePath, profile.filePath)))
    if (!matches.some((profile) => profile.key !== 'default')) await saveProfile(codexHome, fresh.filePath, fresh.email)
    return `codex:${fresh.accountId}`
  } finally {
    await rm(loginHome, { recursive: true, force: true })
  }
}

async function saveProfile(codexHome: string, source: string, email: string | undefined): Promise<void> {
  const directory = path.join(codexHome, 'auth-profiles')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const base = (email?.split('@')[0] ?? 'account').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'account'
  let name = base
  for (let index = 2; await exists(path.join(directory, `${name}.json`)); index++) name = `${base}-${index}`
  await atomicCopy(source, path.join(directory, `${name}.json`))
}

async function atomicCopy(source: string, destination: string): Promise<void> {
  const temporary = `${destination}.ai-pulse-tmp`
  await copyFile(source, temporary)
  await chmod(temporary, 0o600)
  await rename(temporary, destination)
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false
  )
}

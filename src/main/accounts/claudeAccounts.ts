import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import type { ManagedAccount } from '../../shared/types'
import { deleteKeychain } from '../providers/keychain'
import { listClaudeLogins } from '../providers/claude'

/**
 * Claude Code accounts: the system login plus logins AI Pulse created, each in its own
 * `CLAUDE_CONFIG_DIR` under `managedRoot`. Switching the system login is not offered: Claude
 * rotates refresh tokens, so two copies of one login would sign each other out.
 */
export async function listClaudeAccounts(home: string, managedRoot: string): Promise<ManagedAccount[]> {
  return (await listClaudeLogins(home, managedRoot)).map((login) => ({
    id: login.id,
    provider: 'claude',
    email: login.email,
    system: !login.configDir,
    active: !login.configDir,
    canActivate: false,
    canRemove: Boolean(login.configDir),
    addedAt: login.addedAt
  }))
}

/** Config directory for a login: an existing managed one, a new one, or none for the system login. */
export async function claudeConfigDirFor(managedRoot: string, id: string | undefined, now = Date.now()): Promise<string | undefined> {
  if (id === 'claude:system') return undefined
  const name = id ? id.replace(/^claude:/, '') : `account-${now.toString(36)}`
  if (!/^[\w-]+$/.test(name)) throw new Error('Invalid account')
  const directory = path.join(managedRoot, name)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  return directory
}

export async function removeClaudeAccount(home: string, managedRoot: string, id: string): Promise<void> {
  const login = (await listClaudeLogins(home, managedRoot)).find((candidate) => candidate.id === id)
  if (!login?.configDir) throw new Error('The system Claude login cannot be removed here')
  await deleteKeychain(login.keychainService)
  await rm(login.configDir, { recursive: true, force: true })
}

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBinary, firstUrl } from '../src/main/accounts/cli'
import { activateCodexAccount, listCodexAccounts, removeCodexAccount, storeCodexLogin } from '../src/main/accounts/codexAccounts'
import { claudeConfigDirFor } from '../src/main/accounts/claudeAccounts'
import { tempDir, writeAuth } from './helpers'

async function codexHome(): Promise<string> {
  const home = await tempDir()
  await writeAuth(path.join(home, 'auth.json'), 'acct-a', { email: 'a@example.com' })
  await writeAuth(path.join(home, 'auth-profiles/loginB.json'), 'acct-b', { email: 'b@example.com' })
  return home
}

const accountOf = async (file: string): Promise<string> => JSON.parse(await readFile(file, 'utf8')).tokens.account_id

describe('Codex accounts', () => {
  it('lists the system login and saved profiles', async () => {
    expect(await listCodexAccounts(await codexHome())).toEqual([
      { id: 'codex:acct-a', provider: 'codex', email: 'a@example.com', system: true, active: true, canActivate: false, canRemove: false },
      { id: 'codex:acct-b', provider: 'codex', email: 'b@example.com', system: false, active: false, canActivate: true, canRemove: true }
    ])
  })

  it('switches accounts without losing the previous login', async () => {
    const home = await codexHome()

    await activateCodexAccount(home, 'codex:acct-b')

    expect(await accountOf(path.join(home, 'auth.json'))).toBe('acct-b')
    expect((await readdir(path.join(home, 'auth-profiles'))).sort()).toEqual(['a.json', 'loginB.json'])
    expect(await accountOf(path.join(home, 'auth-profiles/a.json'))).toBe('acct-a')
  })

  it('removes saved profiles but never the active login', async () => {
    const home = await codexHome()
    await expect(removeCodexAccount(home, 'codex:acct-a')).rejects.toThrow(/cannot be removed/)
    await removeCodexAccount(home, 'codex:acct-b')
    expect(await readdir(path.join(home, 'auth-profiles'))).toEqual([])
  })

  it('stores a fresh login as a new profile, or over the profiles of the same account', async () => {
    const home = await codexHome()
    const login = await tempDir()
    await writeAuth(path.join(login, 'auth.json'), 'acct-c', { email: 'new.person@example.com' })
    expect(await storeCodexLogin(home, login)).toBe('codex:acct-c')
    expect(await accountOf(path.join(home, 'auth-profiles/new.person.json'))).toBe('acct-c')

    const again = await tempDir()
    await writeAuth(path.join(again, 'auth.json'), 'acct-a', { email: 'a@example.com' })
    await writeFile(path.join(again, 'marker'), '')
    await storeCodexLogin(home, again)
    expect((await readdir(path.join(home, 'auth-profiles'))).sort()).toEqual(['a.json', 'loginB.json', 'new.person.json'])
    await expect(readdir(again)).rejects.toThrow()
  })
})

describe('Claude config directories', () => {
  it('creates a directory for new logins and rejects path tricks', async () => {
    const root = await tempDir()
    expect(await claudeConfigDirFor(root, 'claude:system')).toBeUndefined()
    expect(await claudeConfigDirFor(root, undefined, 36)).toBe(path.join(root, 'account-10'))
    await expect(claudeConfigDirFor(root, 'claude:../../etc')).rejects.toThrow('Invalid account')
  })
})

describe('CLI helpers', () => {
  it('finds the sign-in URL inside terminal escape sequences', () => {
    expect(firstUrl('visit: \x1b]8;;https://claude.com/oauth?a=1&b=2\x1b\\https://claude.com/oauth')).toBe('https://claude.com/oauth?a=1&b=2')
    expect(firstUrl('nothing here')).toBeUndefined()
  })

  it('searches the augmented PATH', async () => {
    const directory = await tempDir()
    await mkdir(path.join(directory, 'bin'))
    expect(findBinary('codex', ['/missing', path.join(directory, 'bin')].join(path.delimiter), (file) => file === path.join(directory, 'bin/codex'))).toBe(path.join(directory, 'bin/codex'))
  })
})

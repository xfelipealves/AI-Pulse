import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverProfiles } from '../src/main/codex/auth'

const temporaryHomes: string[] = []

async function createCodexHome(): Promise<string> {
  const codexHome = await mkdtemp(path.join(tmpdir(), 'ai-pulse-auth-'))
  temporaryHomes.push(codexHome)
  return codexHome
}

function auth(accountId: string): string {
  return JSON.stringify({ tokens: { account_id: accountId, id_token: 'token' } })
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('discoverProfiles', () => {
  it('includes the default auth.json when no named profile exists', async () => {
    const codexHome = await createCodexHome()
    const defaultAuthPath = path.join(codexHome, 'auth.json')
    await writeFile(defaultAuthPath, auth('account-default'))

    expect(await discoverProfiles(codexHome)).toEqual([{ id: 'default', filePath: defaultAuthPath }])
  })

  it('skips a named profile that has the same account ID as the default profile', async () => {
    const codexHome = await createCodexHome()
    const profilesDirectory = path.join(codexHome, 'auth-profiles')
    await mkdir(profilesDirectory)
    await writeFile(path.join(codexHome, 'auth.json'), auth('account-shared'))
    await writeFile(path.join(profilesDirectory, 'duplicate.json'), auth('account-shared'))
    await writeFile(path.join(profilesDirectory, 'work.json'), auth('account-work'))

    expect(await discoverProfiles(codexHome)).toEqual([
      { id: 'default', filePath: path.join(codexHome, 'auth.json') },
      { id: 'work', filePath: path.join(profilesDirectory, 'work.json') }
    ])
  })

  it('returns an explicit empty list when neither auth source exists', async () => {
    expect(await discoverProfiles(await createCodexHome())).toEqual([])
  })
})

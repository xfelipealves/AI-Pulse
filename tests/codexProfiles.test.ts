import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeJwtClaims, readProfiles } from '../src/main/providers/codexProfiles'
import { idToken, tempDir, writeAuth } from './helpers'

describe('readProfiles', () => {
  it('reads the default profile first, then named profiles in filename order', async () => {
    const home = await tempDir()
    await writeAuth(path.join(home, 'auth.json'), 'acct-a', { email: 'a@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } })
    await writeAuth(path.join(home, 'auth-profiles/zeta.json'), 'acct-z')
    await writeAuth(path.join(home, 'auth-profiles/alpha.json'), 'acct-b')

    const profiles = await readProfiles(home)

    expect(profiles.map((profile) => profile.key)).toEqual(['default', 'alpha', 'zeta'])
    expect(profiles[0]).toMatchObject({ accountId: 'acct-a', email: 'a@example.com', planType: 'plus', authenticated: true, lastRefresh: '2026-10-01T00:00:00.000Z' })
  })

  it('marks a profile without tokens as unauthenticated and skips unreadable files', async () => {
    const home = await tempDir()
    await writeAuth(path.join(home, 'auth.json'), undefined)
    await writeAuth(path.join(home, 'auth-profiles/ok.json'), 'acct-ok')
    await writeFile(path.join(home, 'auth-profiles/broken.json'), '{nope')
    await writeFile(path.join(home, 'auth-profiles/notes.txt'), 'ignored')

    const profiles = await readProfiles(home)

    expect(profiles.map((profile) => [profile.key, profile.authenticated])).toEqual([
      ['default', false],
      ['ok', true]
    ])
  })

  it('returns nothing when the Codex home does not exist', async () => {
    expect(await readProfiles(path.join(await tempDir(), 'missing'))).toEqual([])
  })
})

describe('decodeJwtClaims', () => {
  it('decodes base64url payloads and tolerates garbage', () => {
    expect(decodeJwtClaims(idToken({ email: 'ü@example.com' }))?.email).toBe('ü@example.com')
    expect(decodeJwtClaims('a.%%%.c')).toBeUndefined()
    expect(decodeJwtClaims(undefined)).toBeUndefined()
  })
})

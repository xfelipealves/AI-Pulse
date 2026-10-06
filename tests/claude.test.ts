import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { keychainServiceFor, loadClaude, parseUsage } from '../src/main/providers/claude'
import { HttpError } from '../src/main/providers/http'
import { tempDir } from './helpers'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const credentials = (token: string, expiresAt = NOW + 3_600_000): string => JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt, subscriptionType: 'max' } })
const usage = (fiveHour: number) => ({
  five_hour: { utilization: fiveHour, resets_at: '2026-10-07T03:09:59.940341+00:00' },
  seven_day: { utilization: 33, resets_at: '2026-10-09T00:59:59.940359+00:00' },
  seven_day_opus: null
})

async function setup(): Promise<{ home: string; managedRoot: string }> {
  const home = await tempDir()
  await writeFile(path.join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'me@example.com' } }))
  return { home, managedRoot: path.join(home, 'managed') }
}

async function addManaged(managedRoot: string, name: string, email: string): Promise<string> {
  const directory = path.join(managedRoot, name)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email } }))
  return directory
}

describe('keychainServiceFor', () => {
  it('matches the name Claude Code uses for a custom config directory', () => {
    expect(keychainServiceFor(undefined)).toBe('Claude Code-credentials')
    expect(keychainServiceFor('/Users/me/.claude')).toBe(`Claude Code-credentials-${createHash('sha256').update('/Users/me/.claude').digest('hex').slice(0, 8)}`)
  })
})

describe('loadClaude', () => {
  it('loads the system login and managed logins, each with its own token', async () => {
    const { home, managedRoot } = await setup()
    const work = await addManaged(managedRoot, 'account-a', 'work@example.com')
    await addManaged(managedRoot, 'account-b', 'me@example.com')
    const keychain = vi.fn(async (service: string) =>
      service === 'Claude Code-credentials' ? credentials('system-token') : service === keychainServiceFor(work) ? credentials('work-token') : undefined
    )
    const fetch = vi.fn(async (_url: string, headers: Record<string, string>) => usage(headers.Authorization === 'Bearer system-token' ? 6 : 50))

    const accounts = await loadClaude({ home, managedRoot, readKeychain: keychain, fetch, now: () => NOW, userAgent: async () => 'claude-code/9.9.9' })

    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/api/oauth/usage', { Authorization: 'Bearer system-token', 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'claude-code/9.9.9' })
    expect(accounts.map((account) => [account.id, account.email, account.active, account.windows[0]?.usedPercent])).toEqual([
      ['claude:system', 'me@example.com', true, 6],
      ['claude:account-a', 'work@example.com', false, 50]
    ])
    expect(accounts[0]).toMatchObject({ plan: 'Claude Max', windows: [{ label: '5h' }, { label: 'Weekly' }] })
  })

  it('does not call the API with an expired token, and reports managed logins without one', async () => {
    const { home, managedRoot } = await setup()
    await addManaged(managedRoot, 'account-a', 'work@example.com')
    const fetch = vi.fn()

    const accounts = await loadClaude({ home, managedRoot, readKeychain: async (service) => (service === 'Claude Code-credentials' ? credentials('t', NOW - 1) : undefined), fetch, now: () => NOW })

    expect(fetch).not.toHaveBeenCalled()
    expect(accounts.map((account) => account.error)).toEqual(['Session expired. Re-authenticate this account.', 'Session expired. Re-authenticate this account.'])
  })

  it('distinguishes rejected tokens from other failures', async () => {
    const { home, managedRoot } = await setup()
    const options = { home, managedRoot, readKeychain: async () => credentials('t'), now: () => NOW, userAgent: async () => 'ua' }
    expect((await loadClaude({ ...options, fetch: async () => Promise.reject(new HttpError(401)) }))[0].error).toMatch(/expired/)
    expect((await loadClaude({ ...options, fetch: async () => Promise.reject(new HttpError(429)) }))[0].error).toBe('Usage unavailable')
  })

  it('falls back to the credentials file and returns nothing without any login', async () => {
    const { home, managedRoot } = await setup()
    const fetch = vi.fn(async () => usage(1))
    expect(await loadClaude({ home, managedRoot, readKeychain: async () => undefined, readCredentialsFile: async () => undefined, fetch })).toEqual([])
    expect(
      await loadClaude({ home, managedRoot, readKeychain: async () => undefined, readCredentialsFile: async () => credentials('file-token'), fetch, now: () => NOW, userAgent: async () => 'ua' })
    ).toHaveLength(1)
    expect(parseUsage({ five_hour: { utilization: 'x' } })).toEqual([])
  })
})

import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadCodex, parseUsage } from '../src/main/providers/codex'
import type { UsageSample } from '../src/main/providers/codexSessions'
import { HttpError } from '../src/main/providers/http'
import { tempDir, writeAuth } from './helpers'

const usageBody = (primary: number, secondary: number) => ({
  email: 'live@example.com',
  plan_type: 'plus',
  rate_limit: {
    primary_window: { used_percent: primary, limit_window_seconds: 18_000, reset_at: 1_900_000_000 },
    secondary_window: { used_percent: secondary, limit_window_seconds: 604_800, reset_at: 1_900_500_000 }
  }
})

async function codexHome(): Promise<string> {
  const home = await tempDir()
  await writeAuth(path.join(home, 'auth.json'), 'acct-a', { email: 'a@example.com', 'https://api.openai.com/auth': { chatgpt_plan_type: 'pro' } })
  await writeAuth(path.join(home, 'auth-profiles/loginA.json'), 'acct-a')
  await writeAuth(path.join(home, 'auth-profiles/loginB.json'), 'acct-b', { email: 'b@example.com' })
  await writeAuth(path.join(home, 'auth-profiles/empty.json'), undefined)
  return home
}

describe('loadCodex', () => {
  it('returns one account per account ID with live usage from the API', async () => {
    const fetch = vi.fn(async (_url: string, headers: Record<string, string>) => usageBody(headers['ChatGPT-Account-Id'] === 'acct-a' ? 80 : 10, 58))

    const accounts = await loadCodex({ codexHome: await codexHome(), latestSamples: async () => new Map(), fetch })

    expect(fetch).toHaveBeenCalledWith('https://chatgpt.com/backend-api/wham/usage', { Authorization: 'Bearer token-acct-a', 'ChatGPT-Account-Id': 'acct-a' })
    expect(accounts.map((account) => [account.id, account.active, account.windows[0].usedPercent])).toEqual([
      ['codex:acct-a', true, 80],
      ['codex:acct-b', false, 10]
    ])
    expect(accounts[0]).toMatchObject({ email: 'live@example.com', plan: 'ChatGPT Plus', provider: 'codex' })
    expect(accounts[0].windows.map((window) => window.label)).toEqual(['5h', 'Weekly'])
  })

  it('falls back to local session limits when a saved token is rejected', async () => {
    const sample: UsageSample = { sampledAt: '2026-10-06T10:00:00.000Z', primary: { usedPercent: 42, windowMinutes: 300 } }
    const latestSamples = vi.fn(async () => new Map([['acct-b', sample]]))
    const fetch = vi.fn(async (_url: string, headers: Record<string, string>) => {
      if (headers['ChatGPT-Account-Id'] === 'acct-b') throw new HttpError(401)
      return usageBody(5, 5)
    })

    const [, other] = await loadCodex({ codexHome: await codexHome(), latestSamples, fetch })

    expect(other).toMatchObject({ email: 'b@example.com', windows: [{ label: '5h', usedPercent: 42 }], updatedAt: sample.sampledAt })
    expect(other.error).toBeUndefined()
  })

  it('reports an expired login when there is neither live nor local data', async () => {
    const accounts = await loadCodex({
      codexHome: await codexHome(),
      latestSamples: async () => new Map(),
      fetch: async () => Promise.reject(new HttpError(401))
    })

    expect(accounts[1]).toMatchObject({ windows: [], error: 'Login expired. Sign in to this account with Codex.' })
  })
})

describe('parseUsage', () => {
  it('ignores malformed windows', () => {
    expect(parseUsage({ rate_limit: { primary_window: { used_percent: 'x' } } })).toEqual({ windows: [] })
    expect(parseUsage(null)).toEqual({ windows: [] })
  })
})

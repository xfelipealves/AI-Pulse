import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadGemini, parseQuota } from '../src/main/providers/gemini'
import { HttpError } from '../src/main/providers/http'
import { loadMiniMax, parseRemains } from '../src/main/providers/minimax'
import { loadOpenCode } from '../src/main/providers/opencode'
import { idToken, tempDir } from './helpers'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')

async function geminiHome(expiry: number): Promise<string> {
  const home = await tempDir()
  await mkdir(path.join(home, '.gemini'))
  await writeFile(path.join(home, '.gemini/oauth_creds.json'), JSON.stringify({ access_token: 'old', refresh_token: 'refresh', expiry_date: expiry, id_token: idToken({ email: 'g@example.com' }) }))
  return home
}

describe('loadGemini', () => {
  it('uses a valid token and reports one meter per model family', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith(':loadCodeAssist')
        ? { cloudaicompanionProject: 'proj-1', paidTier: { name: 'Gemini Code Assist Standard' } }
        : {
            buckets: [
              { modelId: 'gemini-2.5-pro', remainingFraction: 0.25, resetTime: '2026-10-07T00:00:00Z' },
              { modelId: 'gemini-2.5-flash', remainingFraction: 0.9 },
              { modelId: 'gemini-2.5-flash-lite', remainingFraction: 1 }
            ]
          }
    )

    const [account] = await loadGemini({ home: await geminiHome(NOW + 3_600_000), fetch, now: () => NOW })

    expect(fetch).toHaveBeenCalledWith('https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota', { Authorization: 'Bearer old' }, { project: 'proj-1' })
    expect(account).toMatchObject({ email: 'g@example.com', plan: 'Gemini Code Assist Standard' })
    expect(account.windows.map((window) => [window.label, window.usedPercent])).toEqual([
      ['Flash', 10],
      ['Flash Lite', 0],
      ['Pro', 75]
    ])
  })

  it('renews an expired token in memory, and explains a missing license', async () => {
    const fetch = vi.fn(async (url: string, headers: Record<string, string>, body?: unknown) => {
      if (url === 'https://oauth2.googleapis.com/token') return { access_token: 'new', expires_in: 3600, body }
      expect(headers.Authorization).toBe('Bearer new')
      throw new HttpError(403)
    })

    const [account] = await loadGemini({ home: await geminiHome(NOW - 1), findOAuthClient: async () => ({ clientId: 'id', clientSecret: 'secret' }), fetch, now: () => NOW })

    expect(account.error).toBe('This Google account has no Gemini CLI quota.')
  })

  it('returns nothing without a Gemini CLI login', async () => {
    expect(await loadGemini({ home: await tempDir() })).toEqual([])
    expect(parseQuota({})).toEqual([])
  })
})

describe('loadOpenCode', () => {
  it('reads rolling, weekly and monthly usage with the API key', async () => {
    const fetch = vi.fn(async () => ({ usage: { rolling: { usagePercent: 12, resetInSec: 3600 }, weekly: { usagePercent: 40, resetInSec: 86_400 }, monthly: { usagePercent: 5 } } }))

    const [account] = await loadOpenCode({ home: await tempDir(), apiKey: 'key', fetch, now: () => NOW })

    expect(fetch).toHaveBeenCalledWith('https://opencode.ai/zen/go/v1/usage', { Authorization: 'Bearer key' })
    expect(account.windows).toEqual([
      { label: '5h', usedPercent: 12, resetsAt: '2026-10-06T13:00:00.000Z' },
      { label: 'Weekly', usedPercent: 40, resetsAt: '2026-10-07T12:00:00.000Z' },
      { label: 'Monthly', usedPercent: 5, resetsAt: undefined }
    ])
  })

  it('asks for a key when none is available', async () => {
    const [account] = await loadOpenCode({ home: await tempDir(), env: {} })
    expect(account.error).toBe('Add your OpenCode Go API key in Settings.')
  })
})

describe('loadMiniMax', () => {
  it('reads the general bucket from the regional API', async () => {
    const fetch = vi.fn(async () => ({
      base_resp: { status_code: 0 },
      model_remains: [
        { model_name: 'video', current_interval_remaining_percent: 1 },
        {
          model_name: 'general',
          current_interval_remaining_percent: 70,
          end_time: 1_791_400_000_000,
          current_weekly_usage_count: 300,
          current_weekly_total_count: 1000,
          weekly_end_time: 1_791_800_000
        }
      ]
    }))

    const [account] = await loadMiniMax({ apiKey: 'key', region: 'cn', fetch })

    expect(fetch).toHaveBeenCalledWith('https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains', { Authorization: 'Bearer key' })
    expect(account.windows).toEqual([
      { label: 'Interval', usedPercent: 30, resetsAt: new Date(1_791_400_000_000).toISOString() },
      { label: 'Weekly', usedPercent: 70, resetsAt: new Date(1_791_800_000_000).toISOString() }
    ])
  })

  it('surfaces API errors and missing keys', async () => {
    expect((await loadMiniMax({ region: 'global' }))[0].error).toBe('Add your MiniMax API key in Settings.')
    expect((await loadMiniMax({ apiKey: 'k', region: 'global', fetch: async () => ({ base_resp: { status_code: 1004, status_msg: 'invalid api key' } }) }))[0].error).toBe('invalid api key')
    expect(parseRemains({})).toEqual([])
  })
})

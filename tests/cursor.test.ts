import { describe, expect, it, vi } from 'vitest'
import { loadCursor, parseUsage, userIdFromToken } from '../src/main/providers/cursor'
import { HttpError } from '../src/main/providers/http'
import { idToken } from './helpers'

const token = idToken({ sub: 'google-oauth2|user_123' })
const summary = {
  billingCycleEnd: '2026-10-26T20:57:52.000Z',
  membershipType: 'pro',
  individualUsage: { plan: { used: 2000, limit: 2000, autoPercentUsed: 49.79, apiPercentUsed: 100, totalPercentUsed: 51.07 } }
}

describe('loadCursor', () => {
  it('prefers the Cursor CLI session and shows the three plan meters', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('/auth/me') ? { email: 'c@example.com' } : summary))
    const readAppState = vi.fn()

    const accounts = await loadCursor({ home: '/nowhere', readKeychain: async (service) => (service === 'cursor-access-token' ? token : undefined), readAppState, fetch })

    expect(readAppState).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith('https://cursor.com/api/usage-summary', { Cookie: `WorkosCursorSessionToken=user_123%3A%3A${token}` })
    expect(accounts).toEqual([
      {
        id: 'cursor',
        provider: 'cursor',
        email: 'c@example.com',
        plan: 'Cursor Pro',
        active: true,
        windows: [
          { label: 'Total', usedPercent: 51.07, resetsAt: summary.billingCycleEnd },
          { label: 'Cursor', usedPercent: 49.79, resetsAt: summary.billingCycleEnd },
          { label: 'Other', usedPercent: 100, resetsAt: summary.billingCycleEnd }
        ]
      }
    ])
  })

  it('falls back to the Cursor app login and its cached email', async () => {
    const fetch = vi.fn(async (url: string) => (url.endsWith('/auth/me') ? Promise.reject(new HttpError(500)) : summary))
    const [account] = await loadCursor({ home: '/nowhere', readKeychain: async () => undefined, readAppState: async () => ({ accessToken: token, email: 'app@example.com' }), fetch })
    expect(account.email).toBe('app@example.com')
  })

  it('returns nothing when Cursor is not signed in, and reports a rejected session', async () => {
    expect(await loadCursor({ home: '/nowhere', readKeychain: async () => undefined, readAppState: async () => undefined })).toEqual([])
    expect(await loadCursor({ home: '/nowhere', readKeychain: async () => 'not-a-jwt' })).toEqual([])
    const [account] = await loadCursor({ home: '/nowhere', readKeychain: async () => token, fetch: async () => Promise.reject(new HttpError(401)) })
    expect(account.error).toBe('Session expired. Sign in to Cursor again.')
  })
})

describe('parseUsage', () => {
  it('derives the total from used and limit when no percentage is given', () => {
    expect(parseUsage({ individualUsage: { plan: { used: 50, limit: 200 } } })).toEqual([{ label: 'Total', usedPercent: 25, resetsAt: undefined }])
    expect(parseUsage({ individualUsage: { plan: { used: 50, limit: 0 } } })).toEqual([])
  })
})

describe('userIdFromToken', () => {
  it('takes the last segment of the subject', () => {
    expect(userIdFromToken(token)).toBe('user_123')
    expect(userIdFromToken(undefined)).toBeUndefined()
  })
})

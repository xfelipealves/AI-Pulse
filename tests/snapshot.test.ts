import { describe, expect, it } from 'vitest'
import type { Account, Snapshot } from '../src/shared/types'
import { buildSnapshot, menuBarTitle } from '../src/main/snapshot'

const account = (overrides: Partial<Account>): Account => ({ id: 'x', provider: 'codex', active: true, windows: [], ...overrides })
const window = (usedPercent: number) => ({ label: '5h', usedPercent })

describe('buildSnapshot', () => {
  it('orders accounts by provider, active first, and survives a failing provider', async () => {
    const snapshot = await buildSnapshot(
      [async () => [account({ id: 'claude', provider: 'claude' })], async () => Promise.reject(new Error('boom')), async () => [account({ id: 'codex:b', active: false }), account({ id: 'codex:a' })]],
      undefined,
      () => 0
    )

    expect(snapshot.generatedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(snapshot.accounts.map((entry) => entry.id)).toEqual(['codex:a', 'codex:b', 'claude'])
  })

  it('keeps the previous values when a live request fails transiently, but not after a login error', async () => {
    const previous: Snapshot = { generatedAt: '', accounts: [account({ id: 'claude', provider: 'claude', windows: [window(30)] }), account({ id: 'codex:a', windows: [window(50)] })] }

    const next = await buildSnapshot(
      [async () => [account({ id: 'claude', provider: 'claude', error: 'Usage unavailable' }), account({ id: 'codex:a', error: 'Login expired. Sign in to this account with Codex.' })]],
      previous
    )

    expect(next.accounts.find((entry) => entry.id === 'claude')).toMatchObject({ windows: [window(30)], error: undefined })
    expect(next.accounts.find((entry) => entry.id === 'codex:a')).toMatchObject({ windows: [] })
  })
})

describe('menuBarTitle', () => {
  it('shows the first window of each active account', () => {
    const snapshot: Snapshot = {
      generatedAt: '',
      accounts: [
        account({ id: 'codex:b', active: false, windows: [window(99)] }),
        account({ id: 'codex:a', windows: [window(79.6)] }),
        account({ id: 'claude', provider: 'claude', windows: [window(6)] }),
        account({ id: 'cursor', provider: 'cursor', error: 'Usage unavailable' })
      ]
    }
    expect(menuBarTitle(snapshot)).toBe('Codex 80% · Claude 6%')
    expect(menuBarTitle(undefined)).toBe('')
  })
})

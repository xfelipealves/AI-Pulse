import type { Account, ManagedAccount } from '../shared/types'
import type { Loader } from './snapshot'

/**
 * Fictional accounts for screenshots and demos (`AI_PULSE_DEMO=1`), so no real
 * email or usage ever appears in published images.
 */
const inHours = (hours: number): string => new Date(Date.now() + hours * 3_600_000).toISOString()

const DEMO_ACCOUNTS: Account[] = [
  {
    id: 'codex:demo-1',
    provider: 'codex',
    email: 'ada@example.com',
    plan: 'ChatGPT Plus',
    active: true,
    windows: [
      { label: '5h', usedPercent: 42, resetsAt: inHours(2.6) },
      { label: 'Weekly', usedPercent: 63, resetsAt: inHours(4 * 24 + 7) }
    ]
  },
  {
    id: 'codex:demo-2',
    provider: 'codex',
    email: 'ada.work@example.com',
    plan: 'ChatGPT Pro',
    active: false,
    windows: [
      { label: '5h', usedPercent: 8, resetsAt: inHours(4.1) },
      { label: 'Weekly', usedPercent: 21, resetsAt: inHours(6 * 24 + 2) }
    ]
  },
  {
    id: 'claude:system',
    provider: 'claude',
    email: 'ada@example.com',
    plan: 'Claude Max',
    active: true,
    windows: [
      { label: '5h', usedPercent: 74, resetsAt: inHours(1.3) },
      { label: 'Weekly', usedPercent: 38, resetsAt: inHours(2 * 24 + 5) }
    ]
  },
  {
    id: 'cursor',
    provider: 'cursor',
    email: 'ada@example.com',
    plan: 'Cursor Pro',
    active: true,
    windows: [
      { label: 'Total', usedPercent: 51, resetsAt: inHours(19 * 24) },
      { label: 'Cursor', usedPercent: 46, resetsAt: inHours(19 * 24) },
      { label: 'Other', usedPercent: 93, resetsAt: inHours(19 * 24) }
    ]
  },
  {
    id: 'gemini',
    provider: 'gemini',
    email: 'ada@example.com',
    plan: 'Gemini Code Assist',
    active: true,
    windows: [
      { label: 'Flash', usedPercent: 12, resetsAt: inHours(9) },
      { label: 'Pro', usedPercent: 58, resetsAt: inHours(9) }
    ]
  }
]

export const demoLoaders: Loader[] = [async () => DEMO_ACCOUNTS.map((account) => ({ ...account }))]

export const DEMO_MANAGED_ACCOUNTS: ManagedAccount[] = [
  { id: 'codex:demo-1', provider: 'codex', email: 'ada@example.com', system: true, active: true, canActivate: false, canRemove: false },
  { id: 'codex:demo-2', provider: 'codex', email: 'ada.work@example.com', system: false, active: false, canActivate: true, canRemove: true },
  { id: 'claude:system', provider: 'claude', email: 'ada@example.com', system: true, active: true, canActivate: false, canRemove: false },
  { id: 'claude:account-demo', provider: 'claude', email: 'ada@studio.example', system: false, active: false, canActivate: false, canRemove: true }
]

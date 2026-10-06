import type { LoginState, ManagedAccount, SecretKey, Settings, SettingsState, Snapshot } from './types'

export const CHANNELS = {
  snapshot: 'pulse:snapshot',
  refresh: 'pulse:refresh',
  quit: 'pulse:quit',
  snapshotUpdated: 'pulse:snapshot-updated',
  getSettings: 'pulse:get-settings',
  saveSettings: 'pulse:save-settings',
  setSecret: 'pulse:set-secret',
  listAccounts: 'pulse:list-accounts',
  startLogin: 'pulse:start-login',
  submitLoginCode: 'pulse:submit-login-code',
  cancelLogin: 'pulse:cancel-login',
  activateAccount: 'pulse:activate-account',
  removeAccount: 'pulse:remove-account',
  loginStateUpdated: 'pulse:login-state',
  accountsChanged: 'pulse:accounts-changed',
  openExternal: 'pulse:open-external'
} as const

export type PulseBridge = {
  /** The latest snapshot, or null before the first load finishes. */
  snapshot: () => Promise<Snapshot | null>
  refresh: () => Promise<void>
  quit: () => Promise<void>
  onSnapshot: (callback: (snapshot: Snapshot) => void) => () => void

  getSettings: () => Promise<SettingsState>
  saveSettings: (settings: Settings) => Promise<SettingsState>
  setSecret: (key: SecretKey, value: string | null) => Promise<SettingsState>

  listAccounts: () => Promise<ManagedAccount[]>
  startLogin: (provider: 'codex' | 'claude', accountId?: string) => Promise<void>
  submitLoginCode: (code: string) => Promise<void>
  cancelLogin: () => Promise<void>
  activateAccount: (id: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  onLoginState: (callback: (state: LoginState | null) => void) => () => void
  onAccountsChanged: (callback: () => void) => () => void

  /** Opens an https URL in the default browser. */
  openExternal: (url: string) => Promise<void>
}

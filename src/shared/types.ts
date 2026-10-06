export type ProviderId = 'codex' | 'claude' | 'cursor' | 'gemini' | 'opencode' | 'minimax'

export const PROVIDERS: ProviderId[] = ['codex', 'claude', 'cursor', 'gemini', 'opencode', 'minimax']

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  gemini: 'Gemini',
  opencode: 'OpenCode Go',
  minimax: 'MiniMax'
}

export type UsageWindow = {
  /** Short name such as `5h`, `Weekly`, `Monthly` or a model group. */
  label: string
  usedPercent: number
  resetsAt?: string
}

export type Account = {
  /** Stable key, unique across providers. */
  id: string
  provider: ProviderId
  email?: string
  plan?: string
  /** The account the provider's CLI or app is currently signed in with. */
  active: boolean
  windows: UsageWindow[]
  /** Set when live data was unavailable and the values come from local files. */
  updatedAt?: string
  error?: string
}

export type Snapshot = {
  generatedAt: string
  accounts: Account[]
}

export type ProviderSettings = {
  enabled: boolean
  /** Show this provider's active account in the macOS menu bar. */
  inMenuBar: boolean
}

export type Settings = {
  providers: Record<ProviderId, ProviderSettings>
  showInMenuBar: boolean
  refreshSeconds: number
  launchAtLogin: boolean
  minimaxRegion: 'global' | 'cn'
}

export type SecretKey = 'opencodeApiKey' | 'minimaxApiKey'

export type SettingsState = {
  settings: Settings
  /** Which secrets are stored; their values never leave the main process. */
  secrets: Record<SecretKey, boolean>
}

/** An account that AI Pulse can sign in, re-authenticate, switch to or remove. */
export type ManagedAccount = {
  id: string
  provider: 'codex' | 'claude'
  email?: string
  /** The login the provider's own CLI uses by default on this Mac. */
  system: boolean
  active: boolean
  canActivate: boolean
  canRemove: boolean
  addedAt?: string
}

export type LoginStatus = 'running' | 'needs-code' | 'done' | 'error'

export type LoginState = {
  provider: 'codex' | 'claude'
  /** The account being re-authenticated; absent when adding a new one. */
  accountId?: string
  status: LoginStatus
  url?: string
  message?: string
}

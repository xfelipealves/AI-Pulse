export type AccountStatus = 'ok' | 'warning' | 'error' | 'unknown'

export type PulseAccount = {
  id: string
  label: string
  provider: 'codex'
  plan: string
  accountId?: string
  status: AccountStatus
  statusText: string
  lastRefresh?: string
  updatedAt?: string
  remainingPercent?: number
  usagePercent?: number
  usedLabel?: string
  resetLabel?: string
  details: Array<{ label: string; value: string; tone?: AccountStatus }>
}

export type PulseSnapshot = {
  generatedAt: string
  summary: string
  accounts: PulseAccount[]
}

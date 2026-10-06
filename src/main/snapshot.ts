import type { Account, ProviderId, Snapshot } from '../shared/types'
import { PROVIDERS, PROVIDER_NAMES } from '../shared/types'

export type Loader = () => Promise<Account[]>

/**
 * Loads every provider. A provider that throws contributes no accounts, and an account
 * whose live request failed transiently keeps the values from the previous snapshot.
 */
export async function buildSnapshot(loaders: Loader[], previous: Snapshot | undefined, now: () => number = Date.now): Promise<Snapshot> {
  const results = await Promise.all(loaders.map((load) => load().catch((): Account[] => [])))
  const previousById = new Map(previous?.accounts.map((account) => [account.id, account]))
  const accounts = results.flat().map((account) => {
    const last = previousById.get(account.id)
    return account.error === 'Usage unavailable' && last && last.windows.length > 0 ? { ...account, windows: last.windows, error: undefined } : account
  })
  accounts.sort((left, right) => PROVIDERS.indexOf(left.provider) - PROVIDERS.indexOf(right.provider) || Number(right.active) - Number(left.active))
  return { generatedAt: new Date(now()).toISOString(), accounts }
}

/** Menu bar text: the first window of each chosen provider's active account, e.g. `Codex 80% · Claude 6%`. */
export function menuBarTitle(snapshot: Snapshot | undefined, providers: ProviderId[] = PROVIDERS): string {
  if (!snapshot) return ''
  return providers
    .flatMap((provider) => {
      const account = snapshot.accounts.find((candidate) => candidate.provider === provider && candidate.active && candidate.windows.length > 0)
      return account ? [`${PROVIDER_NAMES[provider]} ${Math.round(account.windows[0].usedPercent)}%`] : []
    })
    .join(' · ')
}

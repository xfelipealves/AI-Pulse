import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { PulseBridge } from '../../shared/ipc'
import { PROVIDERS, PROVIDER_NAMES, type LoginState, type ManagedAccount, type ProviderId, type Settings, type SettingsState } from '../../shared/types'
import { AccountsSection } from './AccountsSection'
import { ProviderIcon } from './ProviderIcon'
import { SecretField } from './SecretField'
import { Toggle } from './Toggle'

const DESCRIPTIONS: Record<ProviderId, string> = {
  codex: 'ChatGPT plan limits for every Codex login on this Mac.',
  claude: 'Claude subscription limits from your Claude Code logins.',
  cursor: 'Monthly plan usage from the Cursor CLI or app login. Read-only.',
  gemini: 'Experimental. Per-model quota from your Gemini CLI login.',
  opencode: 'OpenCode Go subscription usage. Uses your API key.',
  minimax: 'MiniMax Coding Plan quota. Uses your API key.'
}

const REFRESH_LABELS: Record<number, string> = { 30: '30 seconds', 60: '1 minute', 120: '2 minutes', 300: '5 minutes' }

export function SettingsView({ bridge }: { bridge: PulseBridge }): ReactElement {
  const [state, setState] = useState<SettingsState | null>(null)
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [login, setLogin] = useState<LoginState | null>(null)

  const loadAccounts = useCallback(() => void bridge.listAccounts().then(setAccounts), [bridge])

  useEffect(() => {
    void bridge.getSettings().then(setState)
    loadAccounts()
    const offLogin = bridge.onLoginState(setLogin)
    const offAccounts = bridge.onAccountsChanged(loadAccounts)
    return () => {
      offLogin()
      offAccounts()
    }
  }, [bridge, loadAccounts])

  if (!state) return <div className="empty">Loading settings…</div>
  const { settings, secrets } = state

  const save = (next: Settings): void => {
    setState({ ...state, settings: next })
    void bridge.saveSettings(next).then(setState)
  }
  const setProvider = (id: ProviderId, change: Partial<Settings['providers'][ProviderId]>): void =>
    save({ ...settings, providers: { ...settings.providers, [id]: { ...settings.providers[id], ...change } } })

  return (
    <div className="settings">
      <section className="settingsSection">
        <h2>General</h2>
        <div className="settingRow">
          <div>
            <strong>Show usage in the menu bar</strong>
            <p>Next to the AI Pulse icon, for the providers marked below.</p>
          </div>
          <Toggle label="Show usage in the menu bar" checked={settings.showInMenuBar} onChange={(checked) => save({ ...settings, showInMenuBar: checked })} />
        </div>
        <div className="settingRow">
          <div>
            <strong>Refresh every</strong>
            <p>Also refreshes when Codex or Claude Code are working.</p>
          </div>
          <select value={settings.refreshSeconds} onChange={(event) => save({ ...settings, refreshSeconds: Number(event.target.value) })}>
            {Object.entries(REFRESH_LABELS).map(([seconds, label]) => (
              <option key={seconds} value={seconds}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="settingRow">
          <div>
            <strong>Open at login</strong>
            <p>Works in the installed app.</p>
          </div>
          <Toggle label="Open at login" checked={settings.launchAtLogin} onChange={(checked) => save({ ...settings, launchAtLogin: checked })} />
        </div>
      </section>

      <section className="settingsSection">
        <h2>Providers</h2>
        {PROVIDERS.map((id) => {
          const provider = settings.providers[id]
          return (
            <div className={`providerBlock ${provider.enabled ? '' : 'disabled'}`} key={id}>
              <div className="providerHead">
                <ProviderIcon provider={id} size="small" />
                <div className="providerText">
                  <strong>{PROVIDER_NAMES[id]}</strong>
                  <p>{DESCRIPTIONS[id]}</p>
                </div>
                <Toggle label={`Show ${PROVIDER_NAMES[id]}`} checked={provider.enabled} onChange={(checked) => setProvider(id, { enabled: checked })} />
              </div>

              {provider.enabled ? (
                <div className="providerBody">
                  <label className="checkRow">
                    <input type="checkbox" checked={provider.inMenuBar} onChange={(event) => setProvider(id, { inMenuBar: event.target.checked })} />
                    Show in the menu bar
                  </label>
                  {id === 'codex' || id === 'claude' ? <AccountsSection bridge={bridge} provider={id} accounts={accounts.filter((account) => account.provider === id)} login={login} /> : null}
                  {id === 'opencode' ? (
                    <SecretField
                      label="API key"
                      stored={secrets.opencodeApiKey}
                      placeholder="Leave empty to use OPENCODE_API_KEY or OpenCode's saved key"
                      onSave={(value) => bridge.setSecret('opencodeApiKey', value).then(setState)}
                    />
                  ) : null}
                  {id === 'minimax' ? (
                    <>
                      <label className="field">
                        <span className="fieldLabel">Region</span>
                        <select value={settings.minimaxRegion} onChange={(event) => save({ ...settings, minimaxRegion: event.target.value === 'cn' ? 'cn' : 'global' })}>
                          <option value="global">Global (api.minimax.io)</option>
                          <option value="cn">China mainland (api.minimaxi.com)</option>
                        </select>
                      </label>
                      <SecretField
                        label="API key"
                        stored={secrets.minimaxApiKey}
                        placeholder="From your MiniMax console → API keys"
                        onSave={(value) => bridge.setSecret('minimaxApiKey', value).then(setState)}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </section>
      <p className="footnote">Logins stay on this Mac. Each token is sent only to its own provider to read usage.</p>
    </div>
  )
}

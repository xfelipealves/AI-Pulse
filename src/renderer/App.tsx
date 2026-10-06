import { ArrowLeft, Power, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import logo from '../../assets/ai-pulse-icon.svg'
import { AccountCard } from './components/AccountCard'
import { SettingsView } from './components/SettingsView'
import { relativeTime } from './format'
import { useNow, useSnapshot } from './useSnapshot'

export function App(): ReactElement {
  const bridge = window.pulse
  const snapshot = useSnapshot(bridge)
  const now = useNow()
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState<'usage' | 'settings'>('usage')

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await bridge?.refresh().finally(() => setRefreshing(false))
  }

  return (
    <main className="shell">
      <header className="topbar">
        {view === 'settings' ? (
          <button className="backButton" onClick={() => setView('usage')}>
            <ArrowLeft size={16} /> Settings
          </button>
        ) : (
          <div className="brand">
            <img className="logo" src={logo} alt="" />
            <h1>AI Pulse</h1>
          </div>
        )}
        <div className="topActions">
          {view === 'usage' ? (
            <button className="iconButton" onClick={() => void refresh()} disabled={refreshing || !bridge} title="Refresh" aria-label="Refresh">
              <RefreshCw size={16} className={refreshing || !snapshot ? 'spin' : ''} />
            </button>
          ) : null}
          <button
            className={`iconButton ${view === 'settings' ? 'pressed' : ''}`}
            onClick={() => setView(view === 'settings' ? 'usage' : 'settings')}
            disabled={!bridge}
            title="Settings"
            aria-label="Settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      <section className="cards">
        {view === 'settings' && bridge ? (
          <SettingsView bridge={bridge} />
        ) : (
          <>
            {snapshot?.accounts.map((account) => (
              <AccountCard key={account.id} account={account} now={now} showActive={snapshot.accounts.filter((other) => other.provider === account.provider).length > 1} />
            ))}
            {snapshot && snapshot.accounts.length === 0 ? (
              <div className="empty">
                No signed-in provider found.
                <button className="smallButton" onClick={() => setView('settings')}>
                  Open Settings
                </button>
              </div>
            ) : null}
            {!snapshot ? <div className="empty">{bridge ? 'Loading usage…' : 'AI Pulse bridge is unavailable'}</div> : null}
          </>
        )}
      </section>

      <footer className="footer">
        <span>{snapshot ? `Updated ${relativeTime(snapshot.generatedAt, now)}` : ''}</span>
        <button className="textButton" disabled={!bridge} onClick={() => void bridge?.quit()} title="Quit AI Pulse">
          <Power size={14} /> Quit
        </button>
      </footer>
    </main>
  )
}

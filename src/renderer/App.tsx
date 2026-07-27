import { AlertCircle, Bot, Code2, RefreshCw } from 'lucide-react'
import type { ReactElement } from 'react'
import { useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountCard } from './components/AccountCard'
import { AppFooter } from './components/AppFooter'
import { usePulseSnapshot } from './hooks/usePulseSnapshot'
import './styles.css'

function App(): ReactElement {
  const bridge = window.pulse
  const { snapshot, loading, error, refresh } = usePulseSnapshot(bridge)
  const bridgeAvailable = Boolean(bridge)

  const updatedLabel = useMemo(() => {
    if (!snapshot?.generatedAt) return 'Waiting for first refresh'
    const seconds = Math.max(0, Math.round((Date.now() - new Date(snapshot.generatedAt).getTime()) / 1000))
    return seconds < 5 ? 'Updated now' : `Updated ${seconds}s ago`
  }, [snapshot])

  return (
    <main className="shell">
      <header className="topbar">
        <div className="titleBlock">
          <div className="mark">
            <Bot size={15} />
          </div>
          <div>
            <h1>AI Pulse</h1>
            <p>{snapshot?.summary ?? 'Checking Codex accounts'}</p>
          </div>
        </div>
        <button className="iconButton" onClick={refresh} disabled={loading || !bridgeAvailable} title="Refresh">
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </header>

      {error ? (
        <section className="errorPanel">
          <AlertCircle size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      <section className="cards">
        {loading && !snapshot ? (
          <article className="accountCard loadingCard">
            <div className="sideRail unknown" />
            <div className="accountHeader">
              <div className="identity">
                <div className="providerIcon">
                  <Code2 size={17} />
                </div>
                <div>
                  <h2>Loading Codex</h2>
                  <p>Reading local profiles</p>
                </div>
              </div>
            </div>
            <div className="meter unknown">
              <div />
            </div>
          </article>
        ) : null}
        {(snapshot?.accounts ?? []).map((account) => (
          <AccountCard account={account} key={account.id} />
        ))}
      </section>

      {snapshot?.accounts.length === 0 && !loading ? (
        <section className="emptyState">
          <AlertCircle size={22} />
          <p>No Codex profiles found in ~/.codex.</p>
        </section>
      ) : null}

      <AppFooter
        bridgeAvailable={bridgeAvailable}
        updatedLabel={updatedLabel}
        onOpenProfiles={() => void bridge?.openProfiles()}
        onOpenConfig={() => void bridge?.openConfig()}
        onQuit={() => void bridge?.quit()}
      />
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

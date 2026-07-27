import { AlertCircle, Bot, Code2, ExternalLink, Power, RefreshCw, Settings } from 'lucide-react'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PulseSnapshot } from '../shared'
import './styles.css'

function App(): ReactElement {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bridgeAvailable = typeof window.pulse !== 'undefined'

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const bridge = window.pulse
      if (!bridge) {
        throw new Error('Bridge not loaded')
      }
      setSnapshot(await bridge.getSnapshot())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    const off = window.pulse?.onRefreshRequest(refresh) ?? (() => {})
    return () => {
      window.clearInterval(timer)
      off()
    }
  }, [refresh])

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
        {(snapshot?.accounts ?? []).map((account) => {
          const remaining = account.remainingPercent
          const barValue = remaining ?? 0
          const isUnknown = remaining == null
          return (
            <article className="accountCard" key={account.id}>
              <div className={`sideRail ${account.status}`} />
              <div className="accountHeader">
                <div className="identity">
                  <div className="providerIcon">
                    <Code2 size={17} />
                  </div>
                  <div>
                    <h2>{account.label}</h2>
                    <p>{account.plan}</p>
                  </div>
                </div>
                <div className={`statusPill ${account.status}`}>
                  <span />
                  {account.statusText}
                </div>
              </div>

              <div className="metricRow">
                <div>
                  <strong className={isUnknown ? 'unknownMetric' : ''}>{isUnknown ? '--' : `${remaining}%`}</strong>
                  <span>remaining</span>
                </div>
                <div className="resetCopy">
                  <b>{account.usedLabel}</b>
                  <span>{account.resetLabel}</span>
                </div>
              </div>

              <div className={`meter ${isUnknown ? 'unknown' : ''}`} aria-label={`${account.label} remaining`}>
                <div style={{ width: `${barValue}%` }} />
              </div>

              <div className="detailGrid">
                {account.details.map((detail) => (
                  <div key={detail.label}>
                    <span>{detail.label}</span>
                    <b className={detail.tone ?? ''}>{detail.value}</b>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </section>

      {snapshot?.accounts.length === 0 && !loading ? (
        <section className="emptyState">
          <AlertCircle size={22} />
          <p>No Codex profiles found in ~/.codex.</p>
        </section>
      ) : null}

      <footer className="footer">
        <span>{updatedLabel}</span>
        <div className="actions">
          <button disabled={!bridgeAvailable} onClick={() => void window.pulse?.openProfiles()} title="Open Codex profiles">
            <ExternalLink size={15} /> Open
          </button>
          <button disabled={!bridgeAvailable} onClick={() => void window.pulse?.openConfig()} title="Edit account labels">
            <Settings size={15} /> Settings
          </button>
          <button disabled={!bridgeAvailable} onClick={() => void window.pulse?.quit()} title="Quit AI Pulse">
            <Power size={15} /> Quit
          </button>
        </div>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

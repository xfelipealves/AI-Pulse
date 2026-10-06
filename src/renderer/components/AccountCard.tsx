import type { ReactElement } from 'react'
import { PROVIDER_NAMES, type Account, type UsageWindow } from '../../shared/types'
import { relativeTime, windowView } from '../format'
import { ProviderIcon } from './ProviderIcon'

export function AccountCard({ account, now, showActive }: { account: Account; now: number; showActive: boolean }): ReactElement {
  return (
    <article className="card">
      <header className="cardHeader">
        <ProviderIcon provider={account.provider} />
        <div className="identity">
          <h2>
            {PROVIDER_NAMES[account.provider]}
            {account.plan ? <span className="plan">{account.plan}</span> : null}
          </h2>
          <p>{account.email ?? 'Signed in'}</p>
        </div>
        {showActive && account.active ? <span className="activeBadge">active</span> : null}
      </header>

      {account.error ? <p className="cardError">{account.error}</p> : null}

      {account.windows.length > 0 ? (
        <div className="meters">
          {account.windows.map((window) => (
            <Meter key={window.label} window={window} now={now} />
          ))}
        </div>
      ) : null}

      {account.updatedAt ? <p className="cardNote">From local Codex data, {relativeTime(account.updatedAt, now)}</p> : null}
    </article>
  )
}

function Meter({ window, now }: { window: UsageWindow; now: number }): ReactElement {
  const view = windowView(window, now)
  return (
    <div className="meter">
      <div className="meterLabel">
        <span>{window.label}</span>
        <strong>{view.usedPercent}%</strong>
      </div>
      <div className={`bar ${view.level}`} role="meter" aria-label={`${window.label} used`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={view.usedPercent}>
        <div style={{ width: `${view.usedPercent}%` }} />
      </div>
      <small>{view.caption}</small>
    </div>
  )
}

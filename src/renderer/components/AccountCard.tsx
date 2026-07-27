import { Code2 } from 'lucide-react'
import type { ReactElement } from 'react'
import type { PulseAccount } from '../../shared'

type AccountCardProps = {
  account: PulseAccount
}

export function AccountCard({ account }: AccountCardProps): ReactElement {
  const remaining = account.remainingPercent
  const barValue = remaining ?? 0
  const isUnknown = remaining == null

  return (
    <article className="accountCard">
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
}

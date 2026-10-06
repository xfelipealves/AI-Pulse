import { ExternalLink, LogIn, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { PulseBridge } from '../../shared/ipc'
import type { LoginState, ManagedAccount } from '../../shared/types'

type Props = {
  bridge: PulseBridge
  provider: 'codex' | 'claude'
  accounts: ManagedAccount[]
  login: LoginState | null
}

/** Accounts of one provider, with sign-in, re-authentication, switching and removal. */
export function AccountsSection({ bridge, provider, accounts, login }: Props): ReactElement {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loginHere = login?.provider === provider ? login : null

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="accounts">
      <div className="accountsHeader">
        <span>Accounts</span>
        <button className="smallButton" disabled={Boolean(loginHere && loginHere.status !== 'done' && loginHere.status !== 'error')} onClick={() => void run('add', () => bridge.startLogin(provider))}>
          <Plus size={13} /> Add account
        </button>
      </div>

      {accounts.length === 0 ? <p className="hint">No {provider === 'codex' ? 'Codex' : 'Claude Code'} login on this Mac yet.</p> : null}

      {accounts.map((account) => (
        <div className={`accountRow ${account.active ? 'current' : ''}`} key={account.id}>
          <div className="accountInfo">
            <strong>{account.email ?? 'Unknown account'}</strong>
            <div className="badges">
              <span className="badge">{account.system ? 'System login' : account.provider === 'codex' ? 'Saved profile' : 'Added in AI Pulse'}</span>
              {account.active ? <span className="badge active">Active</span> : null}
            </div>
          </div>
          <div className="accountActions">
            {account.canActivate ? (
              <button className="linkButton" disabled={busy !== null} onClick={() => void run(account.id, () => bridge.activateAccount(account.id))} title="Use this account in Codex">
                <LogIn size={13} /> Use
              </button>
            ) : null}
            <button className="linkButton" disabled={busy !== null} onClick={() => void run(account.id, () => bridge.startLogin(provider, account.id))} title="Sign in to this account again">
              <RefreshCw size={13} /> Re-authenticate
            </button>
            {account.canRemove ? (
              <button
                className="linkButton danger"
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(`Remove ${account.email ?? 'this account'} from AI Pulse? This deletes its saved login on this Mac.`)) void run(account.id, () => bridge.removeAccount(account.id))
                }}
                title="Remove this saved login"
              >
                <Trash2 size={13} /> Remove
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {loginHere ? <LoginPanel bridge={bridge} login={loginHere} /> : null}
      {error ? <p className="formError">{error}</p> : null}
    </div>
  )
}

function LoginPanel({ bridge, login }: { bridge: PulseBridge; login: LoginState }): ReactElement {
  const [code, setCode] = useState('')
  const finished = login.status === 'done' || login.status === 'error'

  return (
    <div className={`loginPanel ${login.status}`}>
      <div className="loginHeader">
        <span>{login.message ?? 'Signing in…'}</span>
        <button className="iconOnly" onClick={() => void bridge.cancelLogin()} title={finished ? 'Dismiss' : 'Cancel sign-in'} aria-label={finished ? 'Dismiss' : 'Cancel sign-in'}>
          <X size={14} />
        </button>
      </div>
      {login.url && !finished ? (
        <button className="linkButton" onClick={() => void bridge.openExternal(login.url!)}>
          <ExternalLink size={13} /> Open the sign-in page again
        </button>
      ) : null}
      {login.status === 'needs-code' ? (
        <form
          className="codeForm"
          onSubmit={(event) => {
            event.preventDefault()
            if (code.trim()) void bridge.submitLoginCode(code)
            setCode('')
          }}
        >
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste the code from the browser" autoFocus spellCheck={false} />
          <button className="smallButton" type="submit" disabled={!code.trim()}>
            Continue
          </button>
        </form>
      ) : null}
    </div>
  )
}

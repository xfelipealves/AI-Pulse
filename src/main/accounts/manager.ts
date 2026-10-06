import { rm } from 'node:fs/promises'
import path from 'node:path'
import type { LoginState, ManagedAccount } from '../../shared/types'
import { claudeConfigDirFor, listClaudeAccounts, removeClaudeAccount } from './claudeAccounts'
import { findBinary, runLogin, type LoginProcess } from './cli'
import { activateCodexAccount, codexLoginHome, listCodexAccounts, removeCodexAccount, storeCodexLogin } from './codexAccounts'

export type AccountManagerOptions = {
  home: string
  codexHome: string
  /** AI Pulse's own data directory, for managed Claude logins and temporary Codex logins. */
  dataDir: string
  onLoginState: (state: LoginState | null) => void
  /** Called after any change to the set of accounts. */
  onAccountsChanged: () => void
}

export function createAccountManager(options: AccountManagerOptions) {
  const claudeRoot = path.join(options.dataDir, 'claude-accounts')
  let login: { process: LoginProcess; state: LoginState } | undefined

  const publish = (state: LoginState | null): void => {
    if (login && state) login.state = state
    options.onLoginState(state)
  }

  async function startCodexLogin(accountId: string | undefined): Promise<void> {
    const binary = findBinary('codex')
    if (!binary) return publish({ provider: 'codex', accountId, status: 'error', message: 'Codex CLI not found. Install it first.' })
    const loginHome = await codexLoginHome(path.join(options.dataDir, 'tmp'))
    const state: LoginState = { provider: 'codex', accountId, status: 'running', message: 'Finish signing in in your browser.' }
    login = {
      state,
      process: runLogin({
        binary,
        args: ['-c', 'cli_auth_credentials_store="file"', 'login'],
        env: { ...process.env, CODEX_HOME: loginHome },
        onUrl: (url) => publish({ ...login!.state, url }),
        onNeedsCode: () => undefined,
        onExit: (ok) => {
          void (async () => {
            if (!ok) return finish({ ...state, status: 'error', message: 'Sign-in was cancelled or failed.' }, loginHome)
            try {
              await storeCodexLogin(options.codexHome, loginHome)
              finish({ ...state, status: 'done', message: 'Account saved.' })
            } catch (error) {
              finish({ ...state, status: 'error', message: error instanceof Error ? error.message : 'Could not save the login.' })
            }
          })()
        }
      })
    }
    publish(state)
  }

  async function startClaudeLogin(accountId: string | undefined): Promise<void> {
    const binary = findBinary('claude')
    if (!binary) return publish({ provider: 'claude', accountId, status: 'error', message: 'Claude Code not found. Install it first.' })
    const configDir = await claudeConfigDirFor(claudeRoot, accountId)
    const isNew = !accountId
    const state: LoginState = { provider: 'claude', accountId, status: 'running', message: 'Finish signing in in your browser.' }
    login = {
      state,
      process: runLogin({
        binary,
        args: ['auth', 'login'],
        env: configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : { ...process.env },
        codePrompt: /paste code/i,
        onUrl: (url) => publish({ ...login!.state, url }),
        onNeedsCode: () => publish({ ...login!.state, status: 'needs-code', message: 'After signing in, paste the code shown in the browser.' }),
        onExit: (ok) => {
          if (ok) return finish({ ...state, status: 'done', message: 'Account saved.' })
          if (isNew && configDir) void rm(configDir, { recursive: true, force: true })
          finish({ ...state, status: 'error', message: 'Sign-in was cancelled or failed.' })
        }
      })
    }
    publish(state)
  }

  function finish(state: LoginState, cleanup?: string): void {
    login = undefined
    if (cleanup) void rm(cleanup, { recursive: true, force: true })
    options.onLoginState(state)
    if (state.status === 'done') options.onAccountsChanged()
  }

  return {
    async list(): Promise<ManagedAccount[]> {
      const [codex, claude] = await Promise.all([listCodexAccounts(options.codexHome), listClaudeAccounts(options.home, claudeRoot)])
      return [...codex, ...claude]
    },
    async startLogin(provider: 'codex' | 'claude', accountId?: string): Promise<void> {
      login?.process.cancel()
      login = undefined
      if (provider === 'codex') await startCodexLogin(accountId)
      else await startClaudeLogin(accountId)
    },
    submitCode(code: string): void {
      if (!login || login.state.status !== 'needs-code') return
      login.process.submitCode(code)
      publish({ ...login.state, status: 'running', message: 'Checking the code…' })
    },
    cancelLogin(): void {
      login?.process.cancel()
      login = undefined
      options.onLoginState(null)
    },
    async activate(id: string): Promise<void> {
      if (!id.startsWith('codex:')) throw new Error('Only Codex accounts can be switched')
      await activateCodexAccount(options.codexHome, id)
      options.onAccountsChanged()
    },
    async remove(id: string): Promise<void> {
      if (id.startsWith('codex:')) await removeCodexAccount(options.codexHome, id)
      else await removeClaudeAccount(options.home, claudeRoot, id)
      options.onAccountsChanged()
    },
    claudeRoot
  }
}

export type AccountManager = ReturnType<typeof createAccountManager>

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCodexAccounts } from '../src/main/codex/accounts'

const temporaryHomes: string[] = []
const now = Date.parse('2026-07-27T12:00:00.000Z')

async function createCodexHome(): Promise<string> {
  const codexHome = await mkdtemp(path.join(tmpdir(), 'ai-pulse-accounts-'))
  temporaryHomes.push(codexHome)
  await mkdir(path.join(codexHome, 'sessions'))
  return codexHome
}

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('loadCodexAccounts', () => {
  it('attaches the fresh active-account sample and only applies manual label, plan, and email fields', async () => {
    const codexHome = await createCodexHome()
    const manualConfigPath = path.join(codexHome, 'manual-config.json')
    const sessionFile = path.join(codexHome, 'sessions', '2026', '07', '27', 'rollout-2026-07-27T11-59-00-test.jsonl')
    await writeFile(path.join(codexHome, 'auth.json'), JSON.stringify({ tokens: { account_id: 'account-active', id_token: 'token' } }))
    await mkdir(path.dirname(sessionFile), { recursive: true })
    await writeFile(
      sessionFile,
      `${JSON.stringify({
        timestamp: '2026-07-27T11:59:00.000Z',
        payload: {
          account_id: 'account-active',
          rate_limits: { primary: { used_percent: 40 }, secondary: { used_percent: 10 }, plan_type: 'plus' }
        }
      })}\n`
    )
    await writeFile(
      manualConfigPath,
      JSON.stringify({
        accounts: {
          default: { label: 'Personal', plan: 'Custom plan', email: 'first@example.com', status: 'error' }
        }
      })
    )

    const accounts = await loadCodexAccounts({
      codexHome,
      manualConfigPath,
      command: 'codex',
      now: () => now,
      doctor: { check: async () => ({ status: 'ok', statusText: 'login ok' }) }
    })

    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toMatchObject({
      id: 'default',
      label: 'Personal',
      plan: 'Custom plan',
      accountId: 'account-active',
      status: 'ok',
      remainingPercent: 60,
      usagePercent: 40
    })
    expect(accounts[0].details).toContainEqual({ label: 'email', value: 'first@example.com' })
  })

  it('does not show the default profile doctor result for a named profile', async () => {
    const codexHome = await createCodexHome()
    const profilesDirectory = path.join(codexHome, 'auth-profiles')
    await mkdir(profilesDirectory)
    await writeFile(path.join(codexHome, 'auth.json'), JSON.stringify({ tokens: { account_id: 'account-default', id_token: 'token' } }))
    await writeFile(path.join(profilesDirectory, 'work.json'), JSON.stringify({ tokens: { account_id: 'account-work', id_token: 'token' } }))
    let doctorCalls = 0

    const accounts = await loadCodexAccounts({
      codexHome,
      command: 'codex',
      now: () => now,
      doctor: {
        check: async () => {
          doctorCalls += 1
          return { status: 'ok', statusText: 'login ok' }
        }
      }
    })

    const namedAccount = accounts.find((account) => account.id === 'work')
    expect(namedAccount?.details).toContainEqual({ label: 'doctor', value: 'not checked for non-default profile', tone: 'warning' })
    expect(doctorCalls).toBe(1)
  })

  it('returns no accounts without invoking doctor when no profiles exist', async () => {
    const codexHome = await createCodexHome()
    let doctorCalls = 0

    await expect(
      loadCodexAccounts({
        codexHome,
        command: 'codex',
        doctor: {
          check: async () => {
            doctorCalls += 1
            return { status: 'ok', statusText: 'login ok' }
          }
        }
      })
    ).resolves.toEqual([])
    expect(doctorCalls).toBe(0)
  })
})

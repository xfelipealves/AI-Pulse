import { describe, expect, it } from 'vitest'
import { createDoctorChecker, resolveCodexCommand } from '../src/main/codex/cli'

describe('resolveCodexCommand', () => {
  it('uses CODEX_BINARY before PATH candidates', () => {
    expect(resolveCodexCommand({ CODEX_BINARY: '/custom/codex' })).toBe('/custom/codex')
  })

  it('uses codex from PATH when CODEX_BINARY is absent', () => {
    expect(resolveCodexCommand({})).toBe('codex')
  })

  it('uses codex from PATH when CODEX_BINARY is empty', () => {
    expect(resolveCodexCommand({ CODEX_BINARY: '' })).toBe('codex')
  })

  it('uses an installed Homebrew binary only when the PATH command is unavailable', () => {
    expect(
      resolveCodexCommand(
        {},
        {
          commandAvailable: () => false,
          fileExists: (candidate) => candidate === '/opt/homebrew/bin/codex'
        }
      )
    ).toBe('/opt/homebrew/bin/codex')
  })

  it('falls back to Homebrew when PATH does not contain codex', () => {
    expect(resolveCodexCommand({ PATH: '/missing-bin' }, { fileExists: (candidate) => candidate === '/opt/homebrew/bin/codex' })).toBe('/opt/homebrew/bin/codex')
  })

  it('caches doctor checks within the configured time-to-live', async () => {
    let calls = 0
    const doctor = createDoctorChecker({
      now: () => 1_000,
      ttlMs: 60_000,
      run: async () => {
        calls += 1
        return JSON.stringify({ overallStatus: 'ok' })
      }
    })

    await expect(doctor.check('codex')).resolves.toMatchObject({ status: 'ok', statusText: 'login ok' })
    await expect(doctor.check('codex')).resolves.toMatchObject({ status: 'ok', statusText: 'login ok' })
    expect(calls).toBe(1)
  })
})

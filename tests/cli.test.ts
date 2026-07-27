import { describe, expect, it } from 'vitest'
import { resolveCodexCommand } from '../src/main/codex/cli'

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
})

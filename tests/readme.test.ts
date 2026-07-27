import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('README', () => {
  it('documents cloning, local setup, and the Codex-only privacy boundary', async () => {
    const readme = await readFile('README.md', 'utf8')

    expect(readme).toContain('git clone https://github.com/xfelipealves/AI-Pulse.git')
    expect(readme).toContain('cd AI-Pulse')
    expect(readme).toContain('npm ci')
    expect(readme).toContain('Privacy')
    expect(readme).toContain('~/.codex')
    expect(readme).toContain('Codex-only')
  })
})

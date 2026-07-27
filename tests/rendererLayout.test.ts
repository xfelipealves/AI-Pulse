import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf8')

describe('renderer compact layout', () => {
  it('keeps the footer reachable by making account cards scroll within a compact viewport', () => {
    expect(styles).toMatch(/\.shell\s*{[\s\S]*?height:\s*720px;/)
    expect(styles).toMatch(/\.cards\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/)
    expect(styles).toMatch(/body\s*{[\s\S]*?overflow:\s*auto;/)
    expect(styles).toMatch(/@media\s*\(max-height:\s*719px\)\s*{[\s\S]*?\.shell\s*{[\s\S]*?height:\s*100%;/)
  })
})

import { describe, expect, it } from 'vitest'
import { duration, relativeTime, windowView } from '../src/renderer/format'

const NOW = Date.parse('2026-10-06T12:00:00.000Z')
const at = (minutes: number): string => new Date(NOW + minutes * 60_000).toISOString()

describe('windowView', () => {
  it('shows usage, a level and the time to reset', () => {
    expect(windowView({ label: '5h', usedPercent: 27.4, resetsAt: at(90) }, NOW)).toEqual({ usedPercent: 27, level: 'ok', caption: 'resets in 1h 30m' })
    expect(windowView({ label: '5h', usedPercent: 75 }, NOW)).toEqual({ usedPercent: 75, level: 'warning', caption: '' })
    expect(windowView({ label: '5h', usedPercent: 95, resetsAt: at(5) }, NOW).level).toBe('error')
  })

  it('treats a window whose reset has passed as unused', () => {
    expect(windowView({ label: '5h', usedPercent: 95, resetsAt: at(-1) }, NOW)).toEqual({ usedPercent: 0, level: 'ok', caption: 'reset' })
  })
})

describe('time formatting', () => {
  it('formats durations and relative times', () => {
    expect(duration(3 * 24 * 60 * 60_000 + 2 * 60 * 60_000)).toBe('3d 2h')
    expect(duration(5 * 60_000)).toBe('5m')
    expect(relativeTime(at(-0.5), NOW)).toBe('just now')
    expect(relativeTime(at(-125), NOW)).toBe('2h 5m ago')
    expect(relativeTime('garbage', NOW)).toBe('unknown')
  })
})

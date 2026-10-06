import { describe, expect, it, vi } from 'vitest'
import { createPoller } from '../src/main/poller'

function fakeTimers() {
  let time = 0
  const timers: Array<{ at: number; callback: () => void; cancelled: boolean }> = []
  return {
    now: () => time,
    setTimer: (callback: () => void, ms: number) => {
      const timer = { at: time + ms, callback, cancelled: false }
      timers.push(timer)
      return () => (timer.cancelled = true)
    },
    async advance(ms: number) {
      time += ms
      for (const timer of timers.filter((entry) => !entry.cancelled && entry.at <= time)) {
        timer.cancelled = true
        timer.callback()
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }
}

describe('createPoller', () => {
  it('loads on start and then on every interval', async () => {
    const clock = fakeTimers()
    const load = vi.fn(async () => undefined)
    const poller = createPoller({ load, intervalMs: 60_000, minGapMs: 20_000, ...clock })

    poller.start()
    await clock.advance(0)
    await clock.advance(60_000)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('collapses a burst of nudges into one load, spaced by the minimum gap', async () => {
    const clock = fakeTimers()
    const load = vi.fn(async () => undefined)
    const poller = createPoller({ load, intervalMs: 60_000, minGapMs: 20_000, ...clock })
    poller.start()
    await clock.advance(0)

    poller.nudge()
    poller.nudge()
    poller.nudge()
    await clock.advance(19_000)
    expect(load).toHaveBeenCalledTimes(1)

    await clock.advance(1_000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('never overlaps loads, and stops scheduling after stop()', async () => {
    const clock = fakeTimers()
    let release!: () => void
    const load = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const poller = createPoller({ load, intervalMs: 60_000, minGapMs: 0, ...clock })

    poller.start()
    void poller.refresh()
    expect(load).toHaveBeenCalledTimes(1)
    release()
    await clock.advance(0)
    expect(load).toHaveBeenCalledTimes(2)
    release()
    await clock.advance(0)

    poller.stop()
    await clock.advance(120_000)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

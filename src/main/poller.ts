export type PollerOptions = {
  load: () => Promise<void>
  /** Regular refresh interval, read again after every load so settings changes apply. */
  intervalMs: number | (() => number)
  /** Minimum gap between loads triggered by `nudge()`, so bursts of file activity cost one request. */
  minGapMs: number
  now?: () => number
  setTimer?: (callback: () => void, ms: number) => () => void
}

/**
 * Runs `load` every `intervalMs`, on demand (`refresh`), and soon after activity (`nudge`).
 * Loads never overlap; a request made during a load runs once it finishes.
 */
export function createPoller(options: PollerOptions): { start: () => void; stop: () => void; refresh: () => Promise<void>; nudge: () => void } {
  const now = options.now ?? Date.now
  const setTimer =
    options.setTimer ??
    ((callback: () => void, ms: number) => {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    })
  let running: Promise<void> | undefined
  let rerun = false
  let lastLoad = -Infinity
  let cancelInterval: (() => void) | undefined
  let cancelNudge: (() => void) | undefined
  let stopped = true

  const schedule = (): void => {
    cancelInterval?.()
    if (!stopped) cancelInterval = setTimer(() => void refresh(), typeof options.intervalMs === 'function' ? options.intervalMs() : options.intervalMs)
  }

  const refresh = (): Promise<void> => {
    if (running) {
      rerun = true
      return running
    }
    running = (async () => {
      do {
        rerun = false
        lastLoad = now()
        await options.load().catch(() => undefined)
      } while (rerun)
      running = undefined
      schedule()
    })()
    return running
  }

  const nudge = (): void => {
    if (cancelNudge || stopped) return
    const wait = Math.max(0, lastLoad + options.minGapMs - now())
    cancelNudge = setTimer(() => {
      cancelNudge = undefined
      void refresh()
    }, wait)
  }

  return {
    start: () => {
      stopped = false
      void refresh()
    },
    stop: () => {
      stopped = true
      cancelInterval?.()
      cancelNudge?.()
      cancelNudge = undefined
    },
    refresh,
    nudge
  }
}

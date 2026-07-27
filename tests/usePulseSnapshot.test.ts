import { describe, expect, it, vi } from 'vitest'
import type { PulseSnapshot } from '../src/shared'
import { createSnapshotController, startPulseSnapshotRefresh } from '../src/renderer/hooks/usePulseSnapshot'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const olderSnapshot: PulseSnapshot = {
  generatedAt: '2026-07-27T10:00:00.000Z',
  summary: 'Older data',
  accounts: []
}

const newerSnapshot: PulseSnapshot = {
  generatedAt: '2026-07-27T10:01:00.000Z',
  summary: 'Newer data',
  accounts: []
}

describe('createSnapshotController', () => {
  it('queues overlapping refreshes without allowing a stale snapshot to replace the newer one', async () => {
    const first = deferred<PulseSnapshot>()
    const second = deferred<PulseSnapshot>()
    const loadSnapshot = vi.fn(() => first.promise)
    const loadNewerSnapshot = vi.fn(() => second.promise)
    const state = createSnapshotController(loadSnapshot)
    const receivedSnapshots: PulseSnapshot[] = []
    let previousSnapshot: PulseSnapshot | null = null
    state.subscribe(({ snapshot }) => {
      if (snapshot && snapshot !== previousSnapshot) {
        previousSnapshot = snapshot
        receivedSnapshots.push(snapshot)
      }
    })

    const firstRefresh = state.refresh()
    const secondRefresh = state.refresh()

    expect(loadSnapshot).toHaveBeenCalledTimes(1)

    state.setLoader(loadNewerSnapshot)
    first.resolve(olderSnapshot)
    await flushPromises()

    expect(loadNewerSnapshot).toHaveBeenCalledTimes(1)

    second.resolve(newerSnapshot)
    await Promise.all([firstRefresh, secondRefresh])

    expect(receivedSnapshots).toEqual([newerSnapshot])
  })

  it('suppresses a queued load error and resolves the coalesced refresh', async () => {
    const first = deferred<PulseSnapshot>()
    const second = deferred<PulseSnapshot>()
    const state = createSnapshotController(() => first.promise)
    const receivedErrors: string[] = []
    let previousError: string | null = null
    state.subscribe(({ error }) => {
      if (error && error !== previousError) {
        previousError = error
        receivedErrors.push(error)
      }
    })

    const refresh = state.refresh()
    void state.refresh()
    state.setLoader(() => second.promise)

    first.reject(new Error('Older refresh failed'))
    await flushPromises()
    second.reject(new Error('Newer refresh failed'))

    await expect(refresh).resolves.toBeUndefined()
    expect(receivedErrors).toEqual(['Newer refresh failed'])
  })

  it('cleans up the tray listener and refresh interval', () => {
    const refresh = vi.fn(() => Promise.resolve())
    const unsubscribe = vi.fn()
    const onRefreshRequest = vi.fn(() => unsubscribe)
    const setInterval = vi.fn(() => 42)
    const clearInterval = vi.fn()

    const cleanup = startPulseSnapshotRefresh({
      bridge: { onRefreshRequest },
      refresh,
      setInterval,
      clearInterval
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(setInterval).toHaveBeenCalledWith(refresh, 60_000)
    expect(onRefreshRequest).toHaveBeenCalledWith(refresh)

    cleanup()

    expect(clearInterval).toHaveBeenCalledWith(42)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})

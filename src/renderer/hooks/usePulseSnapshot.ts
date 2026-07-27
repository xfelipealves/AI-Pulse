import { useEffect, useRef, useState } from 'react'
import type { PulseSnapshot } from '../../shared'
import type { PulseBridge } from '../../shared/ipc'

type SnapshotLoader = () => Promise<PulseSnapshot>
type SnapshotListener = (state: SnapshotState) => void
type SnapshotRefreshLifecycleOptions = {
  bridge: Pick<PulseBridge, 'onRefreshRequest'> | undefined
  refresh: () => Promise<void>
  setInterval?: (callback: () => void, delay: number) => number
  clearInterval?: (intervalId: number) => void
}

export type SnapshotState = {
  snapshot: PulseSnapshot | null
  loading: boolean
  error: string | null
}

export type SnapshotController = {
  getSnapshot: () => PulseSnapshot | null
  getState: () => SnapshotState
  refresh: () => Promise<void>
  setLoader: (loader: SnapshotLoader) => void
  subscribe: (listener: SnapshotListener) => () => void
}

export function createSnapshotController(initialLoader: SnapshotLoader): SnapshotController {
  let loader = initialLoader
  let state: SnapshotState = { snapshot: null, loading: false, error: null }
  let activeRefresh: Promise<void> | null = null
  let refreshQueued = false
  const listeners = new Set<SnapshotListener>()

  const notify = (): void => {
    listeners.forEach((listener) => listener(state))
  }

  const refresh = (): Promise<void> => {
    if (activeRefresh) {
      refreshQueued = true
      return activeRefresh
    }

    let finishRefresh!: () => void
    activeRefresh = new Promise<void>((resolve) => {
      finishRefresh = resolve
    })

    void (async () => {
      do {
        refreshQueued = false
        state = { ...state, loading: true, error: null }
        notify()

        try {
          const snapshot = await loader()
          if (!refreshQueued) {
            state = { snapshot, loading: true, error: null }
            notify()
          }
        } catch (error) {
          if (!refreshQueued) {
            state = {
              ...state,
              loading: true,
              error: error instanceof Error ? error.message : 'Unable to refresh'
            }
            notify()
          }
        }
      } while (refreshQueued)

      state = { ...state, loading: false }
      notify()
      activeRefresh = null
      finishRefresh()
    })()

    return activeRefresh
  }

  return {
    getSnapshot: () => state.snapshot,
    getState: () => state,
    refresh,
    setLoader: (nextLoader) => {
      loader = nextLoader
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export function startPulseSnapshotRefresh({
  bridge,
  refresh,
  setInterval = (callback, delay) => window.setInterval(callback, delay),
  clearInterval = (intervalId) => window.clearInterval(intervalId)
}: SnapshotRefreshLifecycleOptions): () => void {
  void refresh()
  if (!bridge) return () => {}

  const intervalId = setInterval(refresh, 60_000)
  const unsubscribe = bridge.onRefreshRequest(refresh)
  return () => {
    clearInterval(intervalId)
    unsubscribe()
  }
}

export function usePulseSnapshot(bridge: PulseBridge | undefined): SnapshotState & { refresh: () => Promise<void> } {
  const bridgeRef = useRef(bridge)
  bridgeRef.current = bridge

  const controllerRef = useRef<SnapshotController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createSnapshotController(async () => {
      const currentBridge = bridgeRef.current
      if (!currentBridge) {
        throw new Error('Bridge not loaded')
      }
      return currentBridge.getSnapshot()
    })
  }

  const controller = controllerRef.current
  const [state, setState] = useState(controller.getState)

  useEffect(() => controller.subscribe(setState), [controller])

  useEffect(() => startPulseSnapshotRefresh({ bridge, refresh: controller.refresh }), [bridge, controller])

  return { ...state, refresh: controller.refresh }
}

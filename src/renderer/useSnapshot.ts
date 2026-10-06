import { useEffect, useState } from 'react'
import type { PulseBridge } from '../shared/ipc'
import type { Snapshot } from '../shared/types'

/** The main process owns refreshing; this mirrors its latest snapshot. */
export function useSnapshot(bridge: PulseBridge | undefined): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  useEffect(() => {
    if (!bridge) return
    const unsubscribe = bridge.onSnapshot(setSnapshot)
    void bridge.snapshot().then((current) => current && setSnapshot((existing) => existing ?? current))
    return unsubscribe
  }, [bridge])
  return snapshot
}

/** Current time, re-read every `intervalMs` so countdowns stay accurate. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])
  return now
}

import type { UsageWindow } from '../shared/types'

export type Level = 'ok' | 'warning' | 'error'

export type WindowView = { usedPercent: number; level: Level; caption: string }

/** A window whose reset time has passed is shown as unused again. */
export function windowView(window: UsageWindow, now: number): WindowView {
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : NaN
  if (resetsAt <= now) return { usedPercent: 0, level: 'ok', caption: 'reset' }
  const usedPercent = Math.round(window.usedPercent)
  return {
    usedPercent,
    level: usedPercent >= 90 ? 'error' : usedPercent >= 70 ? 'warning' : 'ok',
    caption: Number.isNaN(resetsAt) ? '' : `resets in ${duration(resetsAt - now)}`
  }
}

export function relativeTime(iso: string, now: number): string {
  const elapsed = now - Date.parse(iso)
  if (!Number.isFinite(elapsed)) return 'unknown'
  if (elapsed < 60_000) return 'just now'
  return `${duration(elapsed)} ago`
}

export function duration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

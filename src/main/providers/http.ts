export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

/** GET by default; a `body` is sent as a JSON POST, or form-encoded when it is a URLSearchParams. */
export type FetchJson = (url: string, headers: Record<string, string>, body?: Record<string, unknown> | URLSearchParams) => Promise<unknown>

export const fetchJson: FetchJson = async (url, headers, body) => {
  const init: RequestInit = { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15_000) }
  if (body instanceof URLSearchParams) Object.assign(init, { method: 'POST', body })
  else if (body) Object.assign(init, { method: 'POST', body: JSON.stringify(body), headers: { ...init.headers, 'Content-Type': 'application/json' } })
  const response = await fetch(url, init)
  if (!response.ok) throw new HttpError(response.status)
  return response.json()
}

export function isAuthError(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403)
}

export function windowLabel(seconds: number | undefined): string {
  if (!seconds) return 'Limit'
  const hours = seconds / 3600
  if (hours === 168) return 'Weekly'
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24}d`
  return Number.isInteger(hours) ? `${hours}h` : `${Math.round(seconds / 60)}m`
}

export function percent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

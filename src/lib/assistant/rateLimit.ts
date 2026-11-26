import { RATE_LIMIT_PER_HOUR, RATE_LIMIT_WINDOW_MS } from './config'

/** My Assistant (specs/033) — rolling-window rate limit (pure; the timestamps come from assistant_messages). */

/** ISO start of the rolling window that ends at `now`. */
export function rateWindowStart(now: Date, windowMs = RATE_LIMIT_WINDOW_MS): string {
  return new Date(now.getTime() - windowMs).toISOString()
}

export interface RateDecision {
  allowed: boolean
  /** Questions still allowed in the window after this one (0 when refused). */
  remaining: number
  /** When enough old questions leave the window to allow one more (ms from now); null when allowed. */
  retryAfterMs: number | null
}

/**
 * Decide from the timestamps of the user's earlier questions (any order). Timestamps outside the window are ignored,
 * so passing extra rows is harmless.
 */
export function rateDecision(sentAt: readonly string[], now: Date, limit = RATE_LIMIT_PER_HOUR, windowMs = RATE_LIMIT_WINDOW_MS): RateDecision {
  const start = now.getTime() - windowMs
  const inWindow = sentAt
    .map(s => new Date(s).getTime())
    .filter(t => Number.isFinite(t) && t > start && t <= now.getTime())
    .sort((a, b) => a - b)
  if (inWindow.length < limit) return { allowed: true, remaining: limit - inWindow.length - 1, retryAfterMs: null }
  const mustExpire = inWindow[inWindow.length - limit]
  return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, mustExpire + windowMs - now.getTime()) }
}

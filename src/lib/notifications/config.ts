/** Email configuration from the environment. Missing key or sender → notifications are a silent no-op. */
export type EmailConfig =
  | { ok: true; apiKey: string; from: string; baseUrl: string }
  | { ok: false; reason: 'missing_api_key' | 'missing_from' }

export const DEFAULT_BASE_URL = 'http://localhost:3000'

export function readBaseUrl(env: Record<string, string | undefined>): string {
  const raw = (env.APP_BASE_URL || env.NEXT_PUBLIC_APP_URL || DEFAULT_BASE_URL).trim()
  return raw.replace(/\/+$/, '')
}

export function readEmailConfig(env: Record<string, string | undefined>): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) return { ok: false, reason: 'missing_api_key' }
  const from = (env.NOTIFICATIONS_FROM_EMAIL || env.RESEND_FROM_EMAIL)?.trim()
  if (!from) return { ok: false, reason: 'missing_from' }
  return { ok: true, apiKey, from, baseUrl: readBaseUrl(env) }
}

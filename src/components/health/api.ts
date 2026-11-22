/** Tiny JSON fetch helper for Health client components (errors become a message for the toast). */
export interface ApiResult<T = Record<string, unknown>> { ok: boolean; status: number; data: T & { error?: string } }

export async function sendJson<T = Record<string, unknown>>(url: string, body?: unknown, method = 'POST'): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error — try again' } as T & { error?: string } }
  }
}

export function errorOf(r: ApiResult<unknown>, fallback = 'Something went wrong'): string {
  return (r.data as { error?: string })?.error ?? fallback
}

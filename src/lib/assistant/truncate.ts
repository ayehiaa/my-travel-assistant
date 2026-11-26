import { TOOL_RESULT_MAX_BYTES } from './config'

/**
 * My Assistant (specs/033) — keep each tool result compact (≤ 8 KB of JSON). Pure.
 * The largest array is shortened step by step and the result says so (`truncated: true` + a note); the JSON is never
 * cut mid-value. If shortening arrays is not enough, a short object asks Claude to narrow the query.
 */

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
type Path = Array<string | number>

function largestArray(value: Json, path: Path = []): { path: Path; length: number } | null {
  let best: { path: Path; length: number } | null = null
  const consider = (cand: { path: Path; length: number } | null) => {
    if (cand && (!best || cand.length > best.length)) best = cand
  }
  if (Array.isArray(value)) {
    if (value.length > 0) consider({ path, length: value.length })
    value.forEach((v, i) => consider(largestArray(v, [...path, i])))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) consider(largestArray(v, [...path, k]))
  }
  return best
}

function arrayAt(root: Json, path: Path): Json[] {
  return path.reduce<Json>((node, key) => (node as Record<string | number, Json>)[key], root) as Json[]
}

const NOTE = 'Some rows were left out to keep this short — narrow the filters or page with offset.'

/** JSON text of `value`, at most `maxBytes` long. */
export function capToolResult(value: unknown, maxBytes = TOOL_RESULT_MAX_BYTES): string {
  const first = JSON.stringify(value ?? null)
  if (byteLength(first) <= maxBytes) return first
  const work = JSON.parse(first) as Json
  for (let guard = 0; guard < 500; guard++) {
    const target = largestArray(work)
    if (!target || target.length <= 1) break
    const arr = arrayAt(work, target.path)
    arr.length = Math.max(1, Math.floor(arr.length * 0.75))
    const wrapped: Json = work && typeof work === 'object' && !Array.isArray(work)
      ? { ...work, truncated: true, note: NOTE }
      : { items: work, truncated: true, note: NOTE }
    const s = JSON.stringify(wrapped)
    if (byteLength(s) <= maxBytes) return s
  }
  return JSON.stringify({ truncated: true, error: 'The result was too large to return. Ask for a shorter period or fewer rows.' })
}

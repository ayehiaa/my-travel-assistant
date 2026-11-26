import { computeCallCost, normalizeUsage, type RawUsage, type TokenTotals } from '@/lib/aiCost'

/** My Assistant (specs/033) — per-turn usage and cost (pure). */

interface IterationLike extends RawUsage { model?: string | null; type?: string }
export interface TurnUsageLike extends RawUsage { iterations?: readonly IterationLike[] | null }

/**
 * Cost of one API call. With refusal fallbacks `usage.iterations` lists every attempt (each billed at its own model's
 * rate) while the top-level usage covers only the attempt that produced the message — so the iterations are priced
 * when present. A model missing from the price table is priced like the requested model (an estimate).
 */
export function turnCostUsd(requestedModel: string, usage: TurnUsageLike | null | undefined): number {
  const price = (model: string | null | undefined, u: RawUsage) =>
    computeCallCost(model ?? requestedModel, u) ?? computeCallCost(requestedModel, u) ?? 0
  const its = (usage?.iterations ?? []).filter(i => typeof i?.input_tokens === 'number' || typeof i?.output_tokens === 'number')
  if (its.length > 0) return Math.round(its.reduce((s, i) => s + price(i.model, i), 0) * 1e6) / 1e6
  return price(requestedModel, usage ?? {})
}

export const ZERO_TOTALS: TokenTotals = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

export function addTotals(a: TokenTotals, b: RawUsage | null | undefined): TokenTotals {
  const n = normalizeUsage(b)
  return {
    input_tokens: a.input_tokens + n.input_tokens,
    output_tokens: a.output_tokens + n.output_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + n.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + n.cache_read_input_tokens,
  }
}

/** "$0.04" / "<$0.01" for the subtle conversation cost line. */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00'
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

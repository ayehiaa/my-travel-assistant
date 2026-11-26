import { z } from 'zod'

/**
 * Pure token-usage and cost accounting for Claude calls.
 * Prices are USD per 1M tokens (first-party API). Cache writes use the standard 5-minute multiplier (1.25 × input).
 */

export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5':   { input: 4, output: 20, cacheRead: 0.20, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 2.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
}

/** Subset of the SDK's `response.usage` we record (fields may be null/absent). */
export interface RawUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export interface TokenTotals {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface AiCallUsage extends TokenTotals {
  /** Role from aiModels (agent | synthesizer | shariah_reviewer). */
  role: string
  /** Call name, e.g. the agent key ('fed_rates') or the role for single calls. */
  name: string
  model: string
  stop_reason: string | null
  cost_usd: number
  /** True when the model has no entry in MODEL_PRICES (cost recorded as 0). */
  unpriced?: boolean
}

export interface AiRunUsage {
  calls: AiCallUsage[]
  totals: TokenTotals & { total_tokens: number }
  cost_usd: number
  /** True when at least one call could not be priced (cost_usd is then a lower bound). */
  partial?: boolean
}

const n = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

/** Round to 6 decimals (micro-dollars) to keep stored JSON tidy without losing precision that matters. */
const roundUsd = (v: number): number => Math.round(v * 1e6) / 1e6

export function normalizeUsage(usage: RawUsage | null | undefined): TokenTotals {
  return {
    input_tokens:                n(usage?.input_tokens),
    output_tokens:               n(usage?.output_tokens),
    cache_creation_input_tokens: n(usage?.cache_creation_input_tokens),
    cache_read_input_tokens:     n(usage?.cache_read_input_tokens),
  }
}

/** Cost in USD for one call, or null when the model is not in the price table. */
export function computeCallCost(model: string, usage: RawUsage | null | undefined): number | null {
  const price = MODEL_PRICES[model]
  if (!price) return null
  const u = normalizeUsage(usage)
  const cost =
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      u.cache_read_input_tokens * price.cacheRead +
      u.cache_creation_input_tokens * price.cacheWrite) / 1_000_000
  return roundUsd(cost)
}

export function buildCallUsage(params: {
  role: string
  name: string
  model: string
  stopReason: string | null | undefined
  usage: RawUsage | null | undefined
}): AiCallUsage {
  const cost = computeCallCost(params.model, params.usage)
  return {
    role:        params.role,
    name:        params.name,
    model:       params.model,
    stop_reason: params.stopReason ?? null,
    ...normalizeUsage(params.usage),
    cost_usd:    cost ?? 0,
    ...(cost === null ? { unpriced: true } : {}),
  }
}

/** Per-run summary; null/undefined entries (calls that did not happen) are skipped. */
export function summarizeRunUsage(calls: ReadonlyArray<AiCallUsage | null | undefined>): AiRunUsage {
  const kept = calls.filter((c): c is AiCallUsage => !!c)
  const totals = kept.reduce(
    (t, c) => ({
      input_tokens:                t.input_tokens + c.input_tokens,
      output_tokens:               t.output_tokens + c.output_tokens,
      cache_creation_input_tokens: t.cache_creation_input_tokens + c.cache_creation_input_tokens,
      cache_read_input_tokens:     t.cache_read_input_tokens + c.cache_read_input_tokens,
    }),
    { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  )
  const total_tokens =
    totals.input_tokens + totals.output_tokens + totals.cache_creation_input_tokens + totals.cache_read_input_tokens
  const partial = kept.some(c => c.unpriced)
  return {
    calls:    kept,
    totals:   { ...totals, total_tokens },
    cost_usd: roundUsd(kept.reduce((s, c) => s + c.cost_usd, 0)),
    ...(partial ? { partial: true } : {}),
  }
}

const tokens = z.number().nonnegative()

const RunUsageSchema = z.object({
  calls: z.array(z.object({
    role:                        z.string(),
    name:                        z.string(),
    model:                       z.string(),
    stop_reason:                 z.string().nullable(),
    input_tokens:                tokens,
    output_tokens:               tokens,
    cache_creation_input_tokens: tokens,
    cache_read_input_tokens:     tokens,
    cost_usd:                    tokens,
    unpriced:                    z.boolean().optional(),
  })),
  totals: z.object({
    input_tokens:                tokens,
    output_tokens:               tokens,
    cache_creation_input_tokens: tokens,
    cache_read_input_tokens:     tokens,
    total_tokens:                tokens,
  }),
  cost_usd: tokens,
  partial:  z.boolean().optional(),
})

/**
 * Read the run usage summary from a recommendation row (`agent_outputs.usage`).
 * Returns null for runs recorded before usage logging, or when the stored value is malformed.
 */
export function readRunUsage(row: { agent_outputs?: unknown } | null | undefined): AiRunUsage | null {
  const outputs = row?.agent_outputs
  if (!outputs || typeof outputs !== 'object' || !('usage' in outputs)) return null
  const parsed = RunUsageSchema.safeParse((outputs as Record<string, unknown>).usage)
  return parsed.success ? parsed.data : null
}

export function formatUsd(v: number): string {
  if (v > 0 && v < 0.01) return '<$0.01'
  return `$${v.toFixed(2)}`
}

/** e.g. "52,310 tokens (31,200 in · 21,110 out) · $0.27" */
export function formatRunCost(usage: AiRunUsage): string {
  const t = usage.totals
  const inTokens = t.input_tokens + t.cache_creation_input_tokens + t.cache_read_input_tokens
  const fmt = (v: number) => v.toLocaleString('en-US')
  const cost = usage.partial ? `≥ ${formatUsd(usage.cost_usd)}` : formatUsd(usage.cost_usd)
  return `${fmt(t.total_tokens)} tokens (${fmt(inTokens)} in · ${fmt(t.output_tokens)} out) · ${cost}`
}

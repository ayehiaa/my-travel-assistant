import { describe, it, expect } from 'vitest'
import {
  computeCallCost, buildCallUsage, summarizeRunUsage, readRunUsage, formatRunCost, formatUsd, normalizeUsage,
} from './aiCost'

describe('computeCallCost', () => {
  it('prices Sonnet 5.5 at $2 in / $10 out per 1M', () => {
    expect(computeCallCost('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(2)
    expect(computeCallCost('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 1_000_000 })).toBe(10)
    expect(computeCallCost('claude-sonnet-5-5', { input_tokens: 10_000, output_tokens: 2_000 })).toBeCloseTo(0.04, 10)
  })

  it('prices cache reads at $0.10 and cache writes at 1.25 × input', () => {
    expect(computeCallCost('claude-sonnet-5-5', { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.1, 10)
    expect(computeCallCost('claude-sonnet-5-5', { cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(2.5, 10)
  })

  it('treats null / missing / negative counts as 0', () => {
    expect(computeCallCost('claude-sonnet-5-5', { input_tokens: null, output_tokens: -5 })).toBe(0)
    expect(computeCallCost('claude-sonnet-5-5', null)).toBe(0)
    expect(normalizeUsage(undefined)).toEqual({
      input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    })
  })

  it('returns null for an unknown model', () => {
    expect(computeCallCost('claude-unknown', { input_tokens: 100 })).toBeNull()
  })
})

describe('buildCallUsage / summarizeRunUsage', () => {
  const agent = buildCallUsage({
    role: 'agent', name: 'fed_rates', model: 'claude-sonnet-5-5', stopReason: 'end_turn',
    usage: { input_tokens: 2000, output_tokens: 1500, cache_creation_input_tokens: null, cache_read_input_tokens: null },
  })
  const synth = buildCallUsage({
    role: 'synthesizer', name: 'synthesizer', model: 'claude-sonnet-5-5', stopReason: 'end_turn',
    usage: { input_tokens: 8000, output_tokens: 4000 },
  })

  it('records tokens, stop reason and cost per call', () => {
    expect(agent).toMatchObject({ role: 'agent', name: 'fed_rates', input_tokens: 2000, output_tokens: 1500, stop_reason: 'end_turn' })
    expect(agent.cost_usd).toBeCloseTo(0.019, 10)
    expect(agent.unpriced).toBeUndefined()
  })

  it('flags an unpriced model with cost 0', () => {
    const u = buildCallUsage({ role: 'agent', name: 'x', model: 'mystery', stopReason: undefined, usage: { input_tokens: 5 } })
    expect(u).toMatchObject({ cost_usd: 0, unpriced: true, stop_reason: null })
  })

  it('sums calls, skipping null entries', () => {
    const run = summarizeRunUsage([agent, null, synth, undefined])
    expect(run.calls).toHaveLength(2)
    expect(run.totals).toEqual({
      input_tokens: 10000, output_tokens: 5500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, total_tokens: 15500,
    })
    expect(run.cost_usd).toBeCloseTo(0.075, 10)
    expect(run.partial).toBeUndefined()
  })

  it('marks the summary partial when a call is unpriced', () => {
    const u = buildCallUsage({ role: 'agent', name: 'x', model: 'mystery', stopReason: 'end_turn', usage: {} })
    expect(summarizeRunUsage([agent, u]).partial).toBe(true)
  })

  it('handles an empty run', () => {
    expect(summarizeRunUsage([])).toMatchObject({ calls: [], cost_usd: 0, totals: { total_tokens: 0 } })
  })
})

describe('readRunUsage', () => {
  const run = summarizeRunUsage([
    buildCallUsage({ role: 'agent', name: 'sentiment', model: 'claude-sonnet-5-5', stopReason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } }),
  ])

  it('reads agent_outputs.usage', () => {
    expect(readRunUsage({ agent_outputs: { macroeconomics: {}, usage: run } })).toEqual(run)
  })

  it('round-trips through JSON (as stored in jsonb)', () => {
    expect(readRunUsage({ agent_outputs: JSON.parse(JSON.stringify({ usage: run })) })).toEqual(run)
  })

  it('returns null for old runs, missing rows and malformed values', () => {
    expect(readRunUsage({ agent_outputs: { macroeconomics: {} } })).toBeNull()
    expect(readRunUsage({ agent_outputs: null })).toBeNull()
    expect(readRunUsage(null)).toBeNull()
    expect(readRunUsage({ agent_outputs: { usage: { calls: 'nope' } } })).toBeNull()
  })
})

describe('formatRunCost', () => {
  it('formats tokens and dollars', () => {
    const run = summarizeRunUsage([
      buildCallUsage({ role: 'agent', name: 'a', model: 'claude-sonnet-5-5', stopReason: 'end_turn', usage: { input_tokens: 30000, output_tokens: 20000, cache_read_input_tokens: 1000 } }),
    ])
    expect(formatRunCost(run)).toBe('51,000 tokens (31,000 in · 20,000 out) · $0.26')
  })

  it('marks partial totals as a lower bound', () => {
    const run = summarizeRunUsage([
      buildCallUsage({ role: 'agent', name: 'a', model: 'mystery', stopReason: 'end_turn', usage: { input_tokens: 10 } }),
    ])
    expect(formatRunCost(run)).toContain('≥ $0.00')
  })

  it('shows <$0.01 for tiny non-zero costs', () => {
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.255)).toBe('$0.26')
  })
})

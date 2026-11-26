import { describe, expect, it } from 'vitest'
import { deriveAccess } from '@/lib/access'
import { enabledAreas, isAreaAllowed, normalizeAreas, areaForPath, suggestionGroups } from './areas'
import { TOOL_SPECS, TOOL_INPUT_SCHEMAS, buildTools, toolBlockedReason, invalidInputResult, toolLabel, toolNamesFor, usedSummary, validateToolInput } from './toolDefs'

const member = (features: string[]) => deriveAccess({ account_type: 'member', plan: 'plus', features })
const assistant = deriveAccess({ account_type: 'assistant', plan: 'free', features: [] }, { linkedMain: { account_type: 'member', plan: 'plus', features: ['health', 'portfolio'] } })

describe('access gating', () => {
  it('gives every member travel + expenses and add-on areas only with the add-on', () => {
    expect(enabledAreas(member([]))).toEqual(['travel', 'expenses'])
    expect(enabledAreas(member(['health']))).toEqual(['travel', 'expenses', 'lifestyle'])
    expect(enabledAreas(member(['portfolio', 'health']))).toEqual(['travel', 'expenses', 'lifestyle', 'trading'])
  })

  it('never gives assistants lifestyle or trading, even when the linked member has them', () => {
    expect(enabledAreas(assistant)).toEqual(['travel', 'expenses'])
    expect(isAreaAllowed(assistant, 'lifestyle')).toBe(false)
    expect(isAreaAllowed(assistant, 'trading')).toBe(false)
  })

  it('offers only the tools of enabled areas (plus get_context), sorted', () => {
    const basic = toolNamesFor(['travel', 'expenses'])
    expect(basic).toEqual(['days_outside_uk', 'expense_summary', 'get_context', 'list_trips', 'query_expenses', 'trip_details'])
    expect(basic.some(n => n.startsWith('health') || n === 'portfolio_live')).toBe(false)
    const all = toolNamesFor(['travel', 'expenses', 'lifestyle', 'trading'])
    expect(all).toHaveLength(TOOL_SPECS.length)
    expect([...all].sort()).toEqual(all)
  })

  it('blocks tools of undeclared or no-longer-allowed areas on every call', () => {
    expect(toolBlockedReason('get_context', [], assistant)).toBeNull()
    expect(toolBlockedReason('list_trips', ['travel'], assistant)).toBeNull()
    expect(toolBlockedReason('health_today', ['travel', 'lifestyle'], assistant)).toMatch(/not enabled/)
    expect(toolBlockedReason('portfolio_live', ['trading'], member(['health']))).toMatch(/not enabled/)
    expect(toolBlockedReason('portfolio_live', ['travel'], member(['portfolio']))).toMatch(/not enabled/)
    expect(toolBlockedReason('portfolio_live', ['trading'], member(['portfolio']))).toBeNull()
    expect(toolBlockedReason('rm_rf', ['travel'], member([]))).toMatch(/Unknown/)
  })

  it('normalizes stored areas', () => {
    expect(normalizeAreas(['trading', 'junk', 'travel', 'travel'])).toEqual(['travel', 'trading'])
    expect(normalizeAreas(null)).toEqual([])
  })

  it('maps pages to areas and orders suggestion groups', () => {
    expect(areaForPath('/expenses')).toBe('expenses')
    expect(areaForPath('/health')).toBe('lifestyle')
    expect(areaForPath('/portfolio/recommendations/x')).toBe('trading')
    expect(areaForPath('/')).toBe('travel')
    expect(areaForPath('/settings')).toBeNull()
    expect(suggestionGroups(['travel', 'expenses'], 'expenses').map(g => g.area)).toEqual(['expenses', 'travel'])
    expect(suggestionGroups(['travel'], 'trading').map(g => g.area)).toEqual(['travel'])
  })
})

describe('tool definitions', () => {
  it('has a Zod schema, label and description for every tool', () => {
    for (const s of TOOL_SPECS) {
      expect(TOOL_INPUT_SCHEMAS[s.name]).toBeDefined()
      expect(s.description.length).toBeGreaterThan(40)
      expect(s.label.endsWith('…')).toBe(true)
      for (const r of s.required ?? []) expect(Object.keys(s.properties)).toContain(r)
    }
  })

  it('builds deterministic tools with eager input streaming and closed schemas', () => {
    const a = buildTools(['travel', 'expenses', 'lifestyle', 'trading'])
    const b = buildTools(['trading', 'lifestyle', 'expenses', 'travel'])
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const t of a) {
      expect(t.eager_input_streaming).toBe(true)
      expect(t.input_schema.type).toBe('object')
      expect(t.input_schema.additionalProperties).toBe(false)
      expect('strict' in t).toBe(false)
    }
  })

  it('labels running tools and summarises the areas used', () => {
    expect(toolLabel('list_trips')).toBe('Looking at your trips…')
    expect(toolLabel('nope')).toBe('Looking that up…')
    expect(usedSummary(['get_context', 'list_trips', 'days_outside_uk', 'query_expenses', 'portfolio_live'])).toEqual(['Trips', 'Expenses', 'Portfolio'])
  })
})

describe('tool input validation', () => {
  it('accepts valid inputs and treats null as absent', () => {
    expect(validateToolInput('list_trips', { when: 'upcoming', limit: 5 }).ok).toBe(true)
    expect(validateToolInput('list_trips', { when: null, from: null }).ok).toBe(true)
    expect(validateToolInput('get_context', {}).ok).toBe(true)
    expect(validateToolInput('expense_summary', { group_by: 'month', from: '2026-10-01', to: '2026-10-31' }).ok).toBe(true)
    expect(validateToolInput('food_log', { from: '2026-11-01', to: '2026-11-07' }).ok).toBe(true)
  })

  it('rejects bad dates, out-of-range numbers, unknown keys, wrong enums and unknown tools', () => {
    expect(validateToolInput('list_trips', { from: '2026-02-30' }).ok).toBe(false)
    expect(validateToolInput('list_trips', { limit: 500 }).ok).toBe(false)
    expect(validateToolInput('list_trips', { sql: 'drop table' }).ok).toBe(false)
    expect(validateToolInput('expense_summary', { group_by: 'year' }).ok).toBe(false)
    expect(validateToolInput('expense_summary', {}).ok).toBe(false)
    expect(validateToolInput('trip_details', { trip_id: 'abc' }).ok).toBe(false)
    expect(validateToolInput('delete_everything', {}).ok).toBe(false)
    expect(validateToolInput('food_log', { from: '2026-11-01' }).ok).toBe(false)
  })

  it('wraps invalid input as an INVALID_JSON error result with escaped quotes', () => {
    const r = invalidInputResult('toolu_1', { text: 'say "hi"' })
    expect(r.is_error).toBe(true)
    expect(r.tool_use_id).toBe('toolu_1')
    const parsed = JSON.parse(r.content as string)
    expect(JSON.parse(parsed.INVALID_JSON)).toEqual({ text: 'say "hi"' })
  })
})

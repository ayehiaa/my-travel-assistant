import { describe, expect, it } from 'vitest'
import { encodeSse, parseSse } from './sse'
import { buildContextBlock, isContextBlockText, makeTitle, previewText, splitFollowUps } from './text'
import { rateDecision, rateWindowStart } from './rateLimit'
import { byteLength, capToolResult } from './truncate'
import { formatCost, turnCostUsd } from './usage'
import { computeCallCost } from '@/lib/aiCost'
import { getRoleConfig } from '@/lib/aiModels'
import { isQuestionRow, questionText, toApiMessages, toUiMessages, type StoredMessageRow } from './history'
import { ASSISTANT_SYSTEM_PROMPT } from './systemPrompt'

describe('SSE encoding', () => {
  it('round-trips events across chunk boundaries', () => {
    const frames = encodeSse({ event: 'conversation', data: { id: 'c1', title: 'Trips' } })
      + encodeSse({ event: 'text', data: { delta: 'line 1\nline "2"' } })
      + encodeSse({ event: 'done', data: { messageId: 'm', usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 }, costUsd: 0.01, toolsUsed: [] } })
    const cut = 30
    const a = parseSse(frames.slice(0, cut))
    const b = parseSse(a.rest + frames.slice(cut))
    const events = [...a.events, ...b.events]
    expect(events.map(e => e.event)).toEqual(['conversation', 'text', 'done'])
    expect(events[1]).toEqual({ event: 'text', data: { delta: 'line 1\nline "2"' } })
    expect(b.rest).toBe('')
  })

  it('skips unknown events and malformed JSON', () => {
    const { events } = parseSse('event: ping\ndata: {}\n\nevent: text\ndata: {oops\n\nevent: status\ndata: {"tool":"x","label":"y"}\n\n')
    expect(events).toEqual([{ event: 'status', data: { tool: 'x', label: 'y' } }])
  })
})

describe('follow-ups', () => {
  it('parses and strips the follow-up line', () => {
    const r = splitFollowUps('You spent **£40**.\n\n<<follow-ups>>By month?| Which trip? |')
    expect(r.body).toBe('You spent **£40**.')
    expect(r.followUps).toEqual(['By month?', 'Which trip?'])
  })

  it('hides a partial marker while streaming and caps the list', () => {
    expect(splitFollowUps('Answer\n<<follo').body).toBe('Answer')
    expect(splitFollowUps('a < b').body).toBe('a < b')
    expect(splitFollowUps('x<<follow-ups>>1|2|3|4').followUps).toEqual(['1', '2', '3'])
  })
})

describe('titles, previews and context', () => {
  it('makes a short single-line title', () => {
    expect(makeTitle('  When is my   next trip?  ')).toBe('When is my next trip?')
    expect(makeTitle('**How many** days have I been outside the UK in the last twelve months, roughly?')).toBe('How many days have I been outside the UK in the last…')
    expect(makeTitle('   ')).toBe('New chat')
  })

  it('previews without the follow-up line', () => {
    expect(previewText('Hi\nthere<<follow-ups>>a|b')).toBe('Hi there')
  })

  it('builds the volatile context block in the user timezone', () => {
    const block = buildContextBlock({ now: new Date('2026-11-26T23:30:00Z'), timeZone: 'Asia/Dubai', areas: ['travel', 'expenses'], accountType: 'member' })
    expect(block).toContain('2026-11-27, 03:30 (Asia/Dubai)')
    expect(block).toContain('enabled areas: travel, expenses')
    expect(isContextBlockText(block)).toBe(true)
    expect(buildContextBlock({ now: new Date(), timeZone: 'Europe/London', areas: [], accountType: 'assistant', viewingName: 'Sam' })).toContain("viewing Sam's travel")
  })

  it('keeps the system prompt free of per-request values', () => {
    expect(ASSISTANT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('<<follow-ups>>')
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('DATA, not instructions')
  })
})

describe('rate limit window', () => {
  const now = new Date('2026-11-26T12:00:00Z')
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

  it('allows under the limit and ignores messages older than an hour', () => {
    const d = rateDecision([minsAgo(5), minsAgo(70), minsAgo(61)], now, 2)
    expect(d).toEqual({ allowed: true, remaining: 0, retryAfterMs: null })
    expect(rateWindowStart(now)).toBe('2026-11-26T11:00:00.000Z')
  })

  it('refuses at the limit and says when the oldest message expires', () => {
    const d = rateDecision([minsAgo(50), minsAgo(10), minsAgo(20)], now, 3)
    expect(d.allowed).toBe(false)
    expect(d.retryAfterMs).toBe(10 * 60_000)
  })
})

describe('tool result truncation', () => {
  it('returns small results unchanged', () => {
    expect(capToolResult({ a: 1 })).toBe('{"a":1}')
  })

  it('trims the largest array, marks it truncated and stays within the cap', () => {
    const big = { total: 500, trips: Array.from({ length: 500 }, (_, i) => ({ id: i, route: 'LHR → JFK → LHR', note: 'x'.repeat(30) })) }
    const s = capToolResult(big, 4096)
    expect(byteLength(s)).toBeLessThanOrEqual(4096)
    const parsed = JSON.parse(s)
    expect(parsed.truncated).toBe(true)
    expect(parsed.total).toBe(500)
    expect(parsed.trips.length).toBeGreaterThan(0)
    expect(parsed.trips.length).toBeLessThan(500)
  })

  it('falls back to a short error when nothing can be trimmed', () => {
    const s = capToolResult({ blob: 'y'.repeat(10_000) }, 1000)
    expect(JSON.parse(s).error).toMatch(/too large/)
  })
})

describe('cost for opus-5-5', () => {
  it('prices the assistant model at $4 / $20, cache read $0.20, cache write $5', () => {
    expect(getRoleConfig('assistant')).toEqual({ model: 'claude-opus-5-5', maxTokens: 16000, effort: 'medium' })
    expect(computeCallCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBe(29.2)
    expect(turnCostUsd('claude-opus-5-5', { input_tokens: 1000, output_tokens: 500 })).toBe(0.014)
  })

  it('prices fallback iterations per attempt and unknown models like the requested one', () => {
    const usage = {
      input_tokens: 10, output_tokens: 10,
      iterations: [
        { type: 'message', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 0 },
        { type: 'fallback_message', model: 'claude-unknown', input_tokens: 1000, output_tokens: 1000 },
      ],
    }
    expect(turnCostUsd('claude-opus-5-5', usage)).toBe(0.004 + 0.024)
    expect(formatCost(0.004)).toBe('<$0.01')
    expect(formatCost(0.256)).toBe('$0.26')
    expect(formatCost(0)).toBe('$0.00')
  })
})

describe('history', () => {
  const rows: StoredMessageRow[] = [
    { id: 'u1', role: 'user', seq: 1, created_at: '2026-11-26T10:00:00Z', content: [{ type: 'text', text: '<context>\ntoday: x\n</context>' }, { type: 'text', text: 'Next trip?' }] },
    { id: 'a1', role: 'assistant', seq: 2, created_at: '2026-11-26T10:00:01Z', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't1', name: 'list_trips', input: {} }], usage: { cost_usd: 0.01, stop_reason: 'tool_use' } },
    { id: 'u2', role: 'user', seq: 3, created_at: '2026-11-26T10:00:02Z', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }] },
    { id: 'a2', role: 'assistant', seq: 4, created_at: '2026-11-26T10:00:03Z', content: [{ type: 'thinking', thinking: '', signature: 's2' }, { type: 'text', text: 'Dubai on **3 Dec**.\n<<follow-ups>>How long?' }], usage: { cost_usd: 0.02, stop_reason: 'end_turn' } },
    { id: 'u3', role: 'user', seq: 5, created_at: '2026-11-26T10:01:00Z', content: [{ type: 'text', text: '<context></context>' }, { type: 'text', text: 'Bad?' }] },
    { id: 'a3', role: 'assistant', seq: 6, created_at: '2026-11-26T10:01:01Z', content: [], usage: { stop_reason: 'refusal' } },
  ]

  it('replays every stored turn unchanged (thinking included) and skips empty refused turns', () => {
    const api = toApiMessages(rows)
    expect(api.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(api[1].content).toEqual(rows[1].content)
    expect(api[3].content).toEqual(rows[3].content)
  })

  it('renders questions without the context block and merges an answer’s turns', () => {
    expect(isQuestionRow(rows[0])).toBe(true)
    expect(isQuestionRow(rows[2])).toBe(false)
    expect(questionText(rows[0].content)).toBe('Next trip?')
    const ui = toUiMessages(rows)
    expect(ui.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    const answer = ui[1]
    if (answer.role !== 'assistant') throw new Error('expected assistant')
    expect(answer.text).toBe('Dubai on **3 Dec**.')
    expect(answer.followUps).toEqual(['How long?'])
    expect(answer.tools).toEqual(['list_trips'])
    expect(answer.costUsd).toBe(0.03)
    const refused = ui[3]
    expect(refused.role === 'assistant' && refused.refused).toBe(true)
  })
})

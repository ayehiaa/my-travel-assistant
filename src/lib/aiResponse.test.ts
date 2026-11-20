import { describe, it, expect } from 'vitest'
import {
  extractFirstText, checkStopReason, assertCompleteResponse, parseAgentResponse, AGENT_REFUSAL_ANALYSIS,
} from './aiResponse'

describe('extractFirstText', () => {
  it('skips leading thinking blocks', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"a":1}' },
      { type: 'text', text: 'second' },
    ]
    expect(extractFirstText(content)).toBe('{"a":1}')
  })

  it('returns empty string when there is no text block', () => {
    expect(extractFirstText([{ type: 'thinking' }])).toBe('')
    expect(extractFirstText([])).toBe('')
    expect(extractFirstText(null)).toBe('')
  })
})

describe('checkStopReason / assertCompleteResponse', () => {
  it('accepts normal completions', () => {
    expect(checkStopReason('end_turn')).toEqual({ ok: true })
    expect(checkStopReason(null)).toEqual({ ok: true })
    expect(() => assertCompleteResponse('end_turn', 'X')).not.toThrow()
  })

  it('flags refusal and max_tokens', () => {
    expect(checkStopReason('refusal')).toEqual({ ok: false, reason: 'refusal' })
    expect(checkStopReason('max_tokens')).toEqual({ ok: false, reason: 'max_tokens' })
    expect(() => assertCompleteResponse('refusal', 'Synthesizer')).toThrow(/Synthesizer declined/)
    expect(() => assertCompleteResponse('max_tokens', 'Shariah reviewer')).toThrow(/Shariah reviewer ran out/)
  })
})

describe('parseAgentResponse', () => {
  const good = JSON.stringify({ analysis: 'Rates are falling.', confidence: 'high', stance: 'bullish' })

  it('parses a valid agent JSON answer', () => {
    expect(parseAgentResponse(good, 'end_turn')).toEqual({ analysis: 'Rates are falling.', confidence: 'high', stance: 'bullish' })
  })

  it('returns a neutral, low-confidence fallback on refusal (even if text is present)', () => {
    expect(parseAgentResponse(good, 'refusal')).toEqual({ analysis: AGENT_REFUSAL_ANALYSIS, confidence: 'low', stance: 'neutral' })
  })

  it('falls back on unparseable or truncated text', () => {
    expect(parseAgentResponse('{"analysis": "cut of', 'max_tokens')).toEqual({ analysis: '{"analysis": "cut of', confidence: 'low', stance: 'neutral' })
    expect(parseAgentResponse('not json', 'end_turn')).toMatchObject({ confidence: 'low', stance: 'neutral' })
  })

  it('falls back when the JSON has the wrong shape', () => {
    expect(parseAgentResponse(JSON.stringify({ analysis: 'x', confidence: 'certain', stance: 'up' }), 'end_turn'))
      .toMatchObject({ confidence: 'low', stance: 'neutral' })
  })
})

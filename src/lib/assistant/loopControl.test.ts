import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { answerText, danglingToolUseIds, decideNextStep, notRunResults, replayableContent, runnableToolUses } from './loopControl'

type Block = Anthropic.Beta.BetaContentBlock
const thinking = { type: 'thinking', thinking: '', signature: 'sig' } as unknown as Block
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Block
const tool = (id: string, name = 'list_trips') => ({ type: 'tool_use', id, name, input: {} }) as unknown as Block
const fallback = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } } as unknown as Block

describe('decideNextStep', () => {
  it('finishes on end_turn even if text mentions tools', () => {
    expect(decideNextStep({ stop_reason: 'end_turn', content: [thinking, text('done')] })).toEqual({ kind: 'done', truncated: false })
    expect(decideNextStep({ stop_reason: 'stop_sequence', content: [text('x')] }).kind).toBe('done')
  })

  it('stops on refusal and never runs that turn’s tools', () => {
    expect(decideNextStep({ stop_reason: 'refusal', content: [tool('a')] })).toEqual({ kind: 'refusal' })
  })

  it('continues a paused turn', () => {
    expect(decideNextStep({ stop_reason: 'pause_turn', content: [thinking] })).toEqual({ kind: 'pause' })
  })

  it('does not run a tool call cut off at max_tokens; a truncated text answer is just done', () => {
    const step = decideNextStep({ stop_reason: 'max_tokens', content: [thinking, tool('a')] })
    expect(step.kind).toBe('truncated_tool_call')
    expect(decideNextStep({ stop_reason: 'max_tokens', content: [text('long…')] })).toEqual({ kind: 'done', truncated: true })
  })

  it('runs every tool of a tool_use turn', () => {
    const step = decideNextStep({ stop_reason: 'tool_use', content: [thinking, tool('a'), tool('b', 'query_expenses')] })
    expect(step.kind).toBe('run_tools')
    if (step.kind === 'run_tools') expect(step.toolUses.map(t => t.id)).toEqual(['a', 'b'])
  })

  it('treats a tool_use stop without tool blocks and unknown stops as done', () => {
    expect(decideNextStep({ stop_reason: 'tool_use', content: [text('hm')] }).kind).toBe('done')
    expect(decideNextStep({ stop_reason: 'compaction', content: [text('hm')] }).kind).toBe('done')
    expect(decideNextStep({ stop_reason: 'model_context_window_exceeded', content: [] }).kind).toBe('context_full')
  })
})

describe('fallback boundary', () => {
  const content = [thinking, tool('old'), fallback, thinking, text('hi'), tool('new')]

  it('runs only tool calls after the last fallback block', () => {
    expect(runnableToolUses(content).map(t => t.id)).toEqual(['new'])
    expect(runnableToolUses([tool('a'), tool('b')]).map(t => t.id)).toEqual(['a', 'b'])
  })

  it('replays content unchanged without a fallback block', () => {
    const plain = [thinking, text('a'), tool('x')]
    expect(replayableContent(plain)).toEqual(plain)
  })

  it('omits thinking and tool_use before the boundary but keeps the fallback block in place', () => {
    const out = replayableContent(content)
    expect(out.map(b => b.type)).toEqual(['fallback', 'thinking', 'text', 'tool_use'])
    expect(out[0]).toBe(fallback)
  })
})

describe('history repair helpers', () => {
  it('finds tool calls of the last assistant turn that have no results', () => {
    const msgs: Anthropic.Beta.BetaMessageParam[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'x', input: {} }, { type: 'tool_use', id: 'b', name: 'y', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: '{}' }] },
    ]
    expect(danglingToolUseIds(msgs)).toEqual(['b'])
    expect(danglingToolUseIds([{ role: 'user', content: 'q' }])).toEqual([])
    expect(danglingToolUseIds([...msgs, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: '{}' }] }])).toEqual([])
  })

  it('builds not-run results and reads answer text only from text blocks', () => {
    expect(notRunResults([{ id: 'a' }], 'stopped')).toEqual([{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'stopped' }])
    expect(answerText([thinking, text('Hello '), tool('a'), text('world')])).toBe('Hello world')
  })
})

/**
 * My Assistant (specs/033) — Server-Sent Events used by POST /api/assistant/chat. Pure; shared by server and client.
 */

export interface AssistantUsageSummary {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type AssistantEvent =
  | { event: 'conversation'; data: { id: string; title: string } }
  | { event: 'status'; data: { tool: string; label: string } }
  | { event: 'text'; data: { delta: string; reset?: boolean } }
  | { event: 'done'; data: { messageId: string | null; usage: AssistantUsageSummary; costUsd: number; toolsUsed: string[]; refused?: boolean; notice?: string } }
  | { event: 'error'; data: { message: string; code?: string } }

export type AssistantEventName = AssistantEvent['event']
const EVENT_NAMES: ReadonlySet<string> = new Set(['conversation', 'status', 'text', 'done', 'error'])

/** One SSE frame. JSON on a single `data:` line (JSON.stringify never emits raw newlines). */
export function encodeSse(e: AssistantEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
}

/**
 * Parse complete frames out of a buffer; returns the events and the unparsed remainder (an incomplete frame).
 * Unknown event names and malformed JSON are skipped.
 */
export function parseSse(buffer: string): { events: AssistantEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const frames = normalized.split('\n\n')
  const rest = frames.pop() ?? ''
  const events: AssistantEvent[] = []
  for (const frame of frames) {
    let name = 'message'
    const data: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (!EVENT_NAMES.has(name) || data.length === 0) continue
    try {
      events.push({ event: name, data: JSON.parse(data.join('\n')) } as AssistantEvent)
    } catch {
      // malformed frame — skip
    }
  }
  return { events, rest }
}

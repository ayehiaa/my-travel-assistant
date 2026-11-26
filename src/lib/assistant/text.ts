import { TITLE_MAX_CHARS } from './config'

/**
 * My Assistant (specs/033) — pure text helpers: follow-up suggestions, conversation titles, the volatile context block.
 */

export const FOLLOW_UPS_MARKER = '<<follow-ups>>'
const MAX_FOLLOW_UPS = 3
const MAX_FOLLOW_UP_CHARS = 120

/**
 * Split an answer into the text to display and the follow-up suggestions from a final `<<follow-ups>>a|b` line.
 * While streaming, a trailing partial marker (e.g. "<<follo") is hidden too, so it never flashes on screen.
 */
export function splitFollowUps(text: string): { body: string; followUps: string[] } {
  const idx = text.lastIndexOf(FOLLOW_UPS_MARKER)
  if (idx >= 0) {
    const raw = text.slice(idx + FOLLOW_UPS_MARKER.length).split('\n')[0]
    const followUps = raw
      .split('|')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length <= MAX_FOLLOW_UP_CHARS)
      .slice(0, MAX_FOLLOW_UPS)
    return { body: text.slice(0, idx).trimEnd(), followUps }
  }
  // Hide a partial marker at the very end of a streaming answer.
  for (let n = Math.min(FOLLOW_UPS_MARKER.length - 1, text.length); n > 0; n--) {
    if (text.endsWith(FOLLOW_UPS_MARKER.slice(0, n))) return { body: text.slice(0, text.length - n).trimEnd(), followUps: [] }
  }
  return { body: text, followUps: [] }
}

/** Conversation title from the first question: one line, markdown symbols removed, cut at a word boundary. */
export function makeTitle(question: string, max = TITLE_MAX_CHARS): string {
  const clean = question.replace(/[`*_#>|[\]]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`
}

export const CONTEXT_OPEN = '<context>'

export interface ContextInput {
  /** Instant of the request. */
  now: Date
  /** IANA timezone for the user's "today". */
  timeZone: string
  areas: readonly string[]
  accountType: 'member' | 'assistant'
  /** For assistants: whose data they are viewing. */
  viewingName?: string | null
}

/** YYYY-MM-DD and HH:MM in a timezone. */
export function zonedParts(now: Date, timeZone: string): { date: string; time: string; weekday: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday }
}

/**
 * The short volatile context sent as the first text block of each new user message (never in the system prompt, so
 * the cached prefix stays stable). It is stored with the message, so replays are byte-identical.
 */
export function buildContextBlock(c: ContextInput): string {
  const { date, time, weekday } = zonedParts(c.now, c.timeZone)
  const lines = [
    CONTEXT_OPEN,
    `today: ${weekday} ${date}, ${time} (${c.timeZone})`,
    'home country: United Kingdom',
    `enabled areas: ${c.areas.join(', ') || 'none'}`,
    c.accountType === 'assistant'
      ? `account: assistant account viewing ${c.viewingName ? `${c.viewingName}'s` : "the linked member's"} travel and expenses`
      : 'account: member',
    '</context>',
  ]
  return lines.join('\n')
}

export function isContextBlockText(text: string): boolean {
  return text.startsWith(CONTEXT_OPEN)
}

/** A short single-line preview (history lists, stored text_preview). */
export function previewText(text: string, max = 160): string {
  const one = splitFollowUps(text).body.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max - 1)}…`
}

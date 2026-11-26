/**
 * My Assistant (specs/033) — limits and request constants. Pure, safe in client and server code.
 */

/** Longest question a user can send. */
export const MAX_MESSAGE_CHARS = 4000
/** Show the character counter once the draft is this long. */
export const COUNTER_FROM_CHARS = 3500
/** Tool-use loop iterations per user message (each is one Messages API call). */
export const MAX_TOOL_ITERATIONS = 8
/** Re-issues of a turn whose streamed tool input could not be parsed at all (or whose connection dropped). */
export const MAX_JSON_RETRIES = 2
/** User messages per rolling hour per user. */
export const RATE_LIMIT_PER_HOUR = 40
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
/** Upper bound for one tool result sent back to Claude. */
export const TOOL_RESULT_MAX_BYTES = 8 * 1024
/** Conversation titles are cut to this length. */
export const TITLE_MAX_CHARS = 60
/** Refusal fallbacks: Anthropic's recommended fallback per refusal category (beta). */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export const ASSISTANT_NAME = 'My Assistant'
export const ASSISTANT_MIGRATION_MESSAGE = 'My Assistant needs a database update — apply supabase/apply_my_assistant.sql'
export const REFUSAL_MESSAGE = "Sorry — I can't help with that one. Try asking about your trips, expenses, lifestyle or portfolio."
export const BUSY_MESSAGE = 'Claude is busy right now — please try again in a minute.'
export const KEY_REJECTED_MESSAGE = 'Your Anthropic key was rejected — update it in Settings.'
export const RATE_LIMITED_MESSAGE = `You've sent ${RATE_LIMIT_PER_HOUR} messages in the last hour — please wait a little before asking again.`
export const GENERIC_ERROR_MESSAGE = 'Something went wrong while answering — please try again.'
export const DISCLAIMER = 'Answers use your own app data. Not financial or medical advice.'
/** Where a user without a key adds one: the My Assistant page shows the key card when no key resolves. */
export const AI_KEY_SETTINGS_HREF = '/assistant#ai-key'

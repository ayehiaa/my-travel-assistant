# Feature Specification: My Assistant

**Feature dir**: `specs/033-my-assistant` · **Created**: 2026-11-26 · **Status**: Implemented
**Input**: Owner: "an AI assistant called My Assistant that I can ask anything about my travels, expenses, lifestyle,
trading — make it a good experience".

## User scenarios

1. **Ask about travel (P1)** — "How many days have I been outside the UK in the last 12 months?" → a short answer led
   by the number, the period used, a small table of the trips that count, and one tappable follow-up.
2. **Ask about expenses (P1)** — "What did I spend last month by category?" → totals per currency (never silently
   converted), a table by category, the period cited.
3. **Ask about lifestyle (P2, Health add-on)** — "Am I on track for protein today?" → today's protein vs target,
   remaining, and the app's own next recommendation; weight trends from the 7-day averages the app already uses.
4. **Ask about trading (P2, Portfolio add-on)** — "Why did the last recommendation sell anything?" → the actions,
   the forced-sell notes (e.g. Shariah screening), cash target and the return vs target; live holdings from Alpaca.
5. **Ask from anywhere (P1)** — an "Ask" button in the top nav (and ⌘K / Ctrl+K) opens a slide-over panel on any page
   with suggestions for the area of that page; the full page `/assistant` keeps the conversation list.
6. **Assistant accounts (P2)** — an assistant user can ask only about the linked member's travel and expenses.

## Requirements

- FR-1 Claude Messages API, streaming manual tool-use loop server-side; model `claude-opus-5-5` via role `assistant`
  in `aiModels.ts` (effort `medium`, `max_tokens` 16000 per turn); adaptive thinking (omitted); no sampling params,
  no forced `tool_choice`, no prefill. Refusal fallbacks ON (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`). `stop_reason` is checked before content is read; a refusal shows a friendly
  message and that turn's tools never run.
- FR-2 Append-only history: each assistant turn's `content` is stored exactly as returned (thinking blocks included)
  and replayed unchanged; nothing earlier in a conversation is edited or dropped. The system prompt and the tool list
  of a conversation are byte-stable (tool set frozen per conversation, see decision 3).
- FR-3 Read-only tools (each `eager_input_streaming: true`, precise description, strict-style JSON schema
  `additionalProperties: false`), every input validated with Zod; invalid input → `is_error` result
  `{"INVALID_JSON": "<input>"}`; tool errors → short `is_error` message; results are compact JSON (≤ 8 KB, truncated
  with a marker). Tools run in parallel; max 8 tool iterations per user message.
- FR-4 Scope: tools are scoped server-side to the authenticated user. Travel / expenses use the active data account
  (assistants → the linked member, via existing helpers + RLS). Lifestyle tools only with `hasFeature(access,'health')`,
  trading tools only with `hasFeature(access,'portfolio')`; tools of disabled areas are not sent and refuse to run.
  Alpaca credentials and API keys never leave the server.
- FR-5 Keys and cost: the per-user key resolver (spec 026). No key → friendly empty state linking to the AI key
  settings and a disabled composer. Usage + cost per assistant message (opus-5-5 pricing added to `aiCost.ts`), the
  conversation total shown subtly. Cache-read tokens logged.
- FR-6 Prompt caching: constant system prompt + deterministic sorted tool list, top-level `cache_control`; volatile
  context (today in the user's timezone, enabled areas) in a short context block inside each new user message.
- FR-7 Persistence: `assistant_conversations`, `assistant_messages` (content jsonb = exact API blocks), owner-only RLS,
  append-only messages; delete conversation allowed; title from the first question (no AI call). Code tolerates the
  missing migration ("database update needed" state).
- FR-8 API: `POST /api/assistant/chat` streams SSE (`conversation`, `status`, `text`, `done`, `error`); user message
  persisted before the call, each assistant turn after each loop iteration; client abort aborts the SDK stream.
  `GET/DELETE/PATCH /api/assistant/conversations[/id]`. Rate limit 40 user messages / hour / user.
- FR-9 UX: nav item "My Assistant" (sparkle) for every signed-in user; "Ask" button + ⌘K / Ctrl+K slide-over; page
  with conversation sidebar (mobile drawer), safe Markdown answers (no raw HTML, sanitised links), auto-scroll with
  "Jump to latest", Stop, copy, retry, hover timestamps, tool-activity chips while running and a collapsible
  "Used: …" line afterwards, grouped suggestion chips, follow-up chips parsed from `<<follow-ups>>a|b`, auto-growing
  composer (Enter sends, Shift+Enter newline, counter near the limit), aria-live, "Not financial or medical advice".
- FR-10 Dev-only preview `/dev/assistant-preview` (404 in production; middleware bypass only outside production).

## Success criteria

- Answers cite the period and data used; never invent numbers when a tool returns no data.
- `npm run build`, `npm test`, `npm run lint` pass; screenshots at 375×812 and 1280×800 in `screenshots/`.

## Decisions made autonomously

1. **SDK upgraded** `@anthropic-ai/sdk` ^0.92.0 → **1.14.0** (exact pin): 0.92 had no `fallbacks` param. Existing
   callers (`aiCall.ts`, `gmailParser.ts`, `parse-receipt`) compiled unchanged.
2. **No `strict: true` on tools.** Schemas are written strict-style (`additionalProperties: false`, enums, required)
   but the strict flag is left off: without a key here it cannot be verified that every keyword combines with
   eager input streaming, and a 400 would break every request. Zod validates every input instead.
3. **Tool set frozen per conversation.** Opus 5.5 binds replayed thinking blocks to a byte-identical prefix (system +
   tools + earlier messages). The enabled areas are stored on the conversation at creation; later requests send the
   same tools. If an add-on is later removed, its tools stay declared but refuse to run (server-side access check on
   every call). A newly enabled add-on applies to new chats.
4. **Volatile context lives in the new user message** (a `<context>` text block before the question) and is persisted
   with it, so replay stays byte-identical and the cache prefix stable. The UI shows only the question.
5. **Fallback boundary on replay.** Content is stored exactly as returned. When a turn contains a `fallback` block
   (mid-output fallback), only `tool_use` blocks after the last `fallback` block are executed, and on replay the
   `thinking` / `redacted_thinking` / `tool_use` blocks before that boundary are omitted, as the API docs require.
   Turns without a fallback block are replayed unchanged.
6. **Expenses are summarised per currency** (as the Expenses page does); no FX conversion inside the assistant.
7. **Days outside the UK** use the dashboard rules (`daysOutsideUKInWindow`, departure and return days excluded,
   rolling 12 months ending at the user's reference date, or today when none is set).
8. **No audit entries for chats.** The assistant changes no app data; conversations are private and may mention
   health data, which must never reach the audit log (shared with assistant accounts).
9. Assistants use **their own** AI key (or the owner fallback when their email is listed), never the member's.
10. Rate limit counts the user's own `assistant_messages` rows (role user) in the last hour; when the table is
    missing the request is refused with the "database update needed" message anyway.
11. Tool result cap 8 KB: lists are trimmed (with `truncated: true` + `total`), never cut mid-JSON.
12. Answers in UK date format; amounts in the stored currency; follow-up line format `<<follow-ups>>a|b|c` (max 3,
    each ≤ 120 chars), stripped from display and history previews.
13. Markdown: a small in-house renderer (no new dependency) producing React elements only — headings, paragraphs,
    lists, tables, bold/italic, inline code, code blocks, links (http/https/mailto and same-site paths only, opened
    with `rel="noopener noreferrer"`); raw HTML is shown as text.
14. Conversation rename (PATCH) updates only `title`; messages are never updated.
15. **Refused turns**: the partial output of a refused turn is discarded (per the refusal docs) — an assistant row with
    empty content and `stop_reason: refusal` is stored for the UI and skipped on replay. Calls left without results
    (aborted request, truncated tool input) are answered with appended `is_error` tool results, never by editing.
16. **AI key for everyone**: `POST/DELETE /api/portfolio/ai-key` no longer requires the Portfolio or Health add-on —
    any signed-in user can store their own key (still encrypted, verified with Anthropic, audited). The key card is
    shown inline on `/assistant` when no key resolves.
17. **Nav at 1280 px**: with every add-on plus "My Assistant" the desktop nav overflowed by 166 px; the name · plan
    badge now shows from 2xl (≥ 1536 px) with a tooltip on the avatar, and pill padding is 12 px below 2xl.
18. Retried turns (unparseable streamed tool input / dropped connection) send `text {delta:'', reset:true}` so the
    UI drops the partial text of that turn before the re-issued stream.


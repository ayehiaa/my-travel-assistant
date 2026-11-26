# Implementation plan: My Assistant

## Approach
Server-side streaming manual tool-use loop on the beta Messages API (`client.beta.messages.stream`) so refusal
fallbacks can be enabled. Pure logic (loop decisions, tool schemas/gating, SSE encoding, follow-ups, titles, markdown,
rate-limit window, truncation, cost) lives in `src/lib/assistant/*` with Vitest tests. Server-only tool executors reuse
existing loaders (trips/expenses queries as the pages do, `daysCalculator`, Health server loaders, Portfolio loaders).
The UI is one client chat component used by both the page and the slide-over.

## Files
- `src/lib/aiModels.ts` — model `OPUS_5_5`, role `assistant` (effort medium, 16000).
- `src/lib/aiCost.ts` — `claude-opus-5-5` price ($4 / $20, cache read $0.20, cache write $5).
- `src/lib/assistant/`
  - `config.ts` — limits, model role, betas.
  - `areas.ts` — enabled areas from access; suggestions per area.
  - `toolDefs.ts` — tool registry (name, area, label, description, JSON schema, Zod), `buildTools(areas)`.
  - `loopControl.ts` — `decideNextStep(message)` pure; `replayableContent`, `runnableToolUses`.
  - `sse.ts` — event encoding/parsing.
  - `followUps.ts`, `title.ts`, `markdown.ts` (tokeniser → AST, link sanitiser), `rateLimit.ts`, `truncate.ts`,
    `history.ts` (DB rows → API messages / UI messages), `systemPrompt.ts`, `contextBlock.ts`.
  - `tools/` server-only executors: `travel.ts`, `expenses.ts`, `lifestyle.ts`, `trading.ts`, `index.ts` (dispatch +
    access re-check + Zod validation + truncation).
  - `store.ts` — Supabase persistence (tolerates missing migration).
  - `chatLoop.ts` — the streaming loop (SDK), emits events via callback.
- `src/app/api/assistant/chat/route.ts` (SSE, nodejs, maxDuration 300), `conversations/route.ts`,
  `conversations/[id]/route.ts`.
- `src/app/assistant/page.tsx`; `src/components/assistant/*` (AssistantChat, ConversationList, MessageBubble,
  Markdown, ToolChips, Suggestions, Composer, AskPanel, AskButton, icons).
- `src/components/Nav.tsx` — nav item + Ask button; panel mounted in layout via `AskPanelHost`.
- `src/app/dev/assistant-preview/` + middleware bypass.
- `supabase/migrations/20261126_my_assistant.sql`, `supabase/apply_my_assistant.sql`.

## Pricing note
Opus 5.5: $4 input / $20 output, cache read $0.20 (documented), 5-minute cache write $5 (1.25 × input).

## Loop (per user message)
1. Auth → Zod body → access → areas (frozen per conversation) → key → rate limit → persist user message.
2. Up to 8 iterations: stream (`text` events forwarded) → `finalMessage()` (JSON-parse errors retried ≤ 2, API errors
   mapped) → persist assistant turn → `decideNextStep` → run tools in parallel (status events) → persist tool-result
   user message → repeat.
3. `done` with usage + cost; conversation `total_cost_usd` updated best effort.

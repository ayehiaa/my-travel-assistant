# Tasks: My Assistant

## Build
- [x] T1 SDK upgrade `@anthropic-ai/sdk` 0.92.0 → 1.14.0 (exact pin; 0.92 lacked `fallbacks`); existing callers compile
- [x] T2 `aiModels.ts` role `assistant` (claude-opus-5-5, medium, 16000); `aiCost.ts` opus-5-5 price ($4/$20, cache read $0.20)
- [x] T3 Pure modules + tests: areas/gating, tool registry (Zod + JSON schema, eager streaming, sorted), loop decisions +
      fallback boundary + dangling tool calls, SSE encode/parse, follow-ups, titles, context block, rate-limit window,
      truncation, cost, history (rows → API / UI), markdown + link sanitiser, travel/expense shaping
- [x] T4 Migration `20261126_my_assistant.sql` + `supabase/apply_my_assistant.sql` (owner-only RLS, append-only trigger)
- [x] T5 Store (RLS client, tolerant of the missing migration) + tool executors (travel, expenses, lifestyle, trading)
- [x] T6 Streaming manual loop (`client.beta.messages.stream` + fallbacks, refusal / pause / max_tokens / 8-iteration cap,
      JSON-error retry ≤ 2, parallel tools, persistence after each turn, abort)
- [x] T7 API: `POST /api/assistant/chat` (SSE, nodejs, maxDuration 300, rate limit 40/h), conversations list / get /
      rename / delete
- [x] T8 UI: `/assistant` page (sidebar / mobile drawer, key card), slide-over "Ask" + ⌘K / Ctrl+K, nav item, safe
      Markdown, tool chips + "Used:" line, follow-up chips, stop / retry / copy / timestamps, jump to latest, composer
- [x] T9 Dev preview `/dev/assistant-preview` + middleware bypass (non-production); Playwright 375×812 + 1280×800
      screenshots in `screenshots/`; fixes: nav overflow at 1280, empty state auto-scrolled to the bottom, fixture
      hydration mismatch
- [x] T10 Quality gate: `npm run build`, `npm test`, `npm run lint`; CLAUDE.md pointer

## Not done / follow-ups
- No live API call was possible here (no `ANTHROPIC_API_KEY`): the loop is covered by pure decision tests only.
- Conversation search, export, and per-message regenerate are out of scope.

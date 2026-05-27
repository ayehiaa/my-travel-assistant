# Tasks: Synthesizer + Full Recommendation UI

**Issue**: #82 — [Portfolio] Synthesizer + full recommendation UI (action list + agent breakdown)
**Issue Dir**: `specs/015-portfolio-advisor/issues/82-synthesizer-full-recommendation-ui/`
**Module Dir**: `specs/015-portfolio-advisor/`

**Input**: spec.md (US15–21), plan.md (Slice 10), data-model.md, contracts/api.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story group this task belongs to (US1, US2, US3)

## Scope (Issue #82 — Slice 10 only)

- `computeActionList` pure function + unit tests
- `src/inngest/synthesizer.ts` — LLM synthesis call
- Update `portfolioAnalysis.ts` to call synthesizer + store results
- `GET /api/portfolio/recommendations/[id]`
- Components: `ActionList`, `AgentBreakdown`, `RecommendationDetail`
- Page: `/portfolio/recommendations/[id]`
- Update `/portfolio` overview to show latest recommendation card

---

## Phase 1: Setup

No setup required — project already initialised. All existing patterns
(`createAdminClient`, `logAudit`, Tailwind, Zod, Vitest) are in place.

---

## Phase 2: Foundational (Backend Core)

**Purpose**: Pure function, synthesizer, and orchestrator integration — all UI depends on this.

**⚠️ CRITICAL**: No UI or API work can begin until T001–T004 are complete.

- [ ] T001 Add `computeActionList` to `src/lib/portfolioCalculator.ts` — inputs: `holdings[]` (ticker, total_value_usd), `cash_usd`, `targetAllocation[]` ({ticker, target_pct}); output: `ActionItem[]` where `action` is `buy | sell | hold`, `current_usd`, `target_usd = target_pct/100 × (holdingsTotal + cash_usd)`, `delta_usd = target_usd - current_usd`; includes tickers present in target but absent from holdings (current_usd=0) and vice-versa (target_pct=0); classify as `hold` when `delta_usd === 0`

- [ ] T002 Add unit tests for `computeActionList` in `src/lib/portfolioCalculator.test.ts` — cover: buy classified correctly (delta > 0); sell classified correctly (delta < 0); hold classified correctly (no delta); correct $ amounts with multiple holdings + cash; allocation summing to 100% produces balanced action list; ticker in target but not in holdings is included as buy; ticker in holdings but not in target is included as sell at 0% target

- [ ] T003 Create `src/inngest/synthesizer.ts` — function `runSynthesizer(params: SynthesizerParams): Promise<SynthesizerOutput>` where `SynthesizerParams = { agentOutputs: Record<string, AgentOutput>, snapshot: PortfolioSnapshot, settings: PortfolioSettings, recentSummaries: string[] }` and `SynthesizerOutput = { target_allocation: TargetAllocationItem[], summary_text: string, conflict_notes: string }`; single `claude-sonnet-4-6` call via `@anthropic-ai/sdk`; system prompt includes risk profile, target return, portfolio snapshot; user prompt includes all 7 agent outputs (analysis + confidence + stance) + up to 5 recent summaries prepended (if `recentSummaries` is empty — expected until slice 11 ships — proceed without error); output parsed as JSON with Zod using `.refine()` that accepts sum of `target_pct` values between `99.5` and `100.5` (±0.5 pp tolerance for LLM floating-point); token budget directive: each section ≤ 500 tokens, total input < 12 000 tokens; throws on parse failure

- [ ] T004 Update `src/inngest/portfolioAnalysis.ts` — two changes: (1) in the existing `store-outputs` step, remove `status: 'complete'` from the `recommendations` update (agents finishing no longer marks the run complete — synthesis does); (2) add a new `step.run('synthesize')` AFTER `store-outputs`: (a) fetch up to 5 recent `recommendation_summaries` rows for this user ordered by `created_at DESC` (admin client; expect empty array until slice 11); (b) call `runSynthesizer` with all 7 agent outputs, snapshot, settings, and fetched summaries; (c) call `computeActionList` with snapshot holdings, `cash_usd`, and synthesizer `target_allocation`; (d) update `recommendations` row with `{ target_allocation, action_list, summary_text, conflict_notes, status: 'complete', updated_at: now }`; (e) emit Inngest event `portfolio/run.completed` with `{ run_id, user_id }`; wrap entire synthesizer step in try/catch — on error: `admin.from('recommendations').update({ status: 'error', error_message: sanitizeErrorMessage(err) })` then re-throw

**Checkpoint**: `npm test` green. `recommendations` row after a run contains non-null `target_allocation`, `action_list`, `summary_text`, `conflict_notes`.

---

## Phase 3: User Story 1 — API Route (US15–17: Target Allocation + Action List)

**Goal**: Expose the full recommendation detail over HTTP with auth + ownership check.

**Independent Test**: `GET /api/portfolio/recommendations/<id>` returns 200 with full `Recommendation` object for the owning `premium_plus` user; returns 404 for another user's recommendation; returns 401 when unauthenticated; returns 403 for non-`premium_plus` user.

- [ ] T005 [US1] Create `src/app/api/portfolio/recommendations/[id]/route.ts` — `GET` handler: validate `params.id` with `z.string().uuid().safeParse(id)` → 400 if invalid; `createClient()` → `supabase.auth.getUser()` → 401 if null; use `getAuthUser()` from `src/lib/auth.ts` for role — 403 if role !== `'premium_plus'`; select `recommendations` row `eq('id', id).eq('user_id', user.id)` → 404 if not found; return `{ recommendation: Recommendation }` with 200; no write operations (no `logAudit` needed)

**Checkpoint**: `GET /api/portfolio/recommendations/[id]` returns full recommendation with all JSONB fields expanded.

---

## Phase 4: User Story 2 — Recommendation Detail UI (US18–21: Summary, Breakdown, Conflict, Disclaimer)

**Goal**: Full `/portfolio/recommendations/[id]` page with summary, disclaimer, action list table, expandable agent breakdown, and conflict notes.

**Independent Test**: Navigate to `/portfolio/recommendations/<id>` — see disclaimer banner, summary paragraph, action list table with ticker/action/$current/$target/$delta columns, each agent expandable (shows analysis + confidence + stance), conflict notes section (shown when non-empty).

### Implementation for User Story 2

- [ ] T006 [P] [US2] Create `src/components/portfolio/ActionList.tsx` — `'use client'` component; props: `actionList: ActionItem[]`; render a table with columns: Ticker, Action (colour-coded chip: green=buy, red=sell, grey=hold), Current %, Target %, Current $, Target $, Delta $; use `formatUsd` from `portfolioCalculator.ts` for $ columns; Tailwind only

- [ ] T007 [P] [US2] Create `src/components/portfolio/AgentBreakdown.tsx` — `'use client'` component; props: `agentOutputs: Record<string, AgentOutput>`; render an accordion with one item per agent (exactly 7: macroeconomics, fed_rates, geopolitics, sentiment, fundamentals, technical_analysis, sector_analysis); each item header shows agent name (title-cased) + stance badge (bullish/bearish/neutral) + confidence badge; body shows `analysis` text; use HTML `<details><summary>` for toggle (no JS state needed); Tailwind only

- [ ] T008 [US2] Create `src/components/portfolio/RecommendationDetail.tsx` — server component; props: `recommendation: Recommendation`; layout: (1) persistent disclaimer banner at top — text from a `DISCLAIMER_TEXT` constant defined in this file — styled as a yellow/amber info banner; (2) summary paragraph (`summary_text`); (3) `ActionList` component with `action_list`; (4) `AgentBreakdown` component with `agent_outputs`; (5) conflict notes section — render only when `conflict_notes` is non-empty, with an "Agent disagreements" heading

- [ ] T009 [US2] Create `src/app/portfolio/recommendations/[id]/page.tsx` — async server component; `getAuthUser()` → redirect to `/login` if null; redirect to `/` if role !== `'premium_plus'`; fetch recommendation via `createClient()` supabase select with `eq('id', params.id).eq('user_id', user.id)`; redirect to `/portfolio` if not found; render `<RecommendationDetail recommendation={rec} />`; set `export const metadata` with title `Sojourn — Portfolio Recommendation`

**Checkpoint**: Full recommendation detail page renders without errors. Disclaimer always visible. Action list shows correct buy/sell/hold. Each agent section expands. Conflict notes appear when present.

---

## Phase 5: User Story 3 — Portfolio Overview Update (Latest Recommendation Card)

**Goal**: `/portfolio` overview shows a summary card for the most recent complete recommendation so users can see latest analysis at a glance.

**Independent Test**: Visit `/portfolio` with an existing complete recommendation — see a card showing run date, summary excerpt, and a link to the detail page. Visit with no recommendations — card is absent.

- [ ] T010 [US3] Update `src/app/portfolio/page.tsx` — add a third parallel query to the existing `Promise.all` fetching `recommendations` table: `select('id, run_at, summary_text').eq('user_id', user.id).eq('status', 'complete').order('run_at', { ascending: false }).limit(1).maybeSingle()`; pass result as `latestRecommendation` prop to `PortfolioOverview`

- [ ] T011 [US3] Update `src/components/portfolio/PortfolioOverview.tsx` — add optional prop `latestRecommendation?: { id: string; run_at: string; summary_text: string | null } | null`; when non-null, render a summary card below the holdings section: heading "Latest Analysis", run date formatted, summary excerpt (first 200 chars + "…" if longer), a link to `/portfolio/recommendations/${latestRecommendation.id}` labelled "View full recommendation"; when null, render nothing (no empty state card)

**Checkpoint**: Portfolio overview shows latest recommendation card after a completed run. No card shown on fresh portfolio.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T012 [P] Run `npm test` — all existing tests + new `computeActionList` tests pass
- [ ] T013 [P] Run `npm run build` — zero TypeScript errors, zero missing imports
- [ ] T014 [P] Run `npm run lint` — zero ESLint errors
- [ ] T015 Verify no `console.log` left in production code paths (`synthesizer.ts`, `portfolioAnalysis.ts`, route handlers, components)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Start immediately — pure function and Inngest work is independent of UI
- **API Route (Phase 3)**: Depends on T001–T004 complete (needs `target_allocation`/`action_list` in DB)
- **Detail UI (Phase 4)**: T006 and T007 can start in parallel after T005; T008 depends on T006+T007; T009 depends on T008
- **Overview Update (Phase 5)**: Independent of Phase 4 — can start after T004 (needs recommendation data in DB); T010 and T011 are sequential

### Within Phases

- T001 before T002 (tests reference the new function signature)
- T003 before T004 (synthesizer imported by portfolioAnalysis)
- T001 before T004 (computeActionList imported by portfolioAnalysis)
- T005 before T009 (page uses supabase directly, but route must exist for type consistency)
- T006 and T007 can run in parallel (different files)
- T008 depends on T006 + T007
- T010 before T011 (page passes new prop; component must accept it)

### Parallel Opportunities

```bash
# Phase 2 — start together (T001 and T003 touch different files):
Task T001: computeActionList in src/lib/portfolioCalculator.ts
Task T003: synthesizer.ts in src/inngest/synthesizer.ts

# After T001+T003 done — T002 and T004 can start in parallel:
Task T002: unit tests in src/lib/portfolioCalculator.test.ts
Task T004: portfolioAnalysis.ts integration (imports both T001 and T003)

# Phase 4 component work — fully parallel:
Task T006: ActionList.tsx
Task T007: AgentBreakdown.tsx
```

---

## Implementation Strategy

### MVP (US1 + backend — run produces a complete recommendation)

1. Complete T001–T004 (Phase 2) — backend produces `target_allocation` + `action_list`
2. Complete T005 (Phase 3) — API exposes the result
3. **Validate**: trigger a run, confirm recommendation row has all fields populated

### Full delivery

4. Complete T006–T009 (Phase 4) — detail page renders
5. Complete T010–T011 (Phase 5) — overview shows latest card
6. Complete T012–T015 (Phase 6) — all gates green

---

## Notes

- `computeActionList` is purely deterministic — no LLM, no network — ideal for Vitest
- Synthesizer token budget: 7 agents × ~500 tokens + portfolio + 5 summaries ≈ 5 600 tokens; stay under 12 000 total
- `status: 'complete'` is set by the synthesizer step (T004), NOT by `store-outputs`; T004 must remove the `status: 'complete'` from the existing `store-outputs` step so that a synthesis failure cannot leave a recommendation incorrectly marked complete
- Disclaimer text must be a server-side constant — never user-editable, never from DB
- `AgentBreakdown` uses `<details><summary>` — no client-side JS state, progressive enhancement friendly
- No `logAudit` call on the GET recommendation route (read-only)
- `conflict_notes` may be empty string or null from LLM — render section only when truthy

# Tasks: [Portfolio] Agent 4 — Sentiment/News (#78)

**Input**: `specs/015-portfolio-advisor/` (shared module artifacts)

**Issue scope**: Add `sentiment.ts` agent, extend `newsapi.ts` with a sentiment fetch function, and wire the agent into the `portfolioAnalysis.ts` 4-agent fan-out.

**Prerequisites**: Slice 5 (Geopolitics / NewsAPI connector) merged to `main` ✅

**No DB migration required.** The `run_progress` row for `sentiment` is already seeded by the run route (`AGENT_NAMES` array in `src/app/api/portfolio/run/route.ts` already contains `'sentiment'`).

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: US1 — Add Sentiment/News agent to fan-out

---

## Phase 1: Setup (Shared Infrastructure)

> Nothing to set up — Inngest, NewsAPI connector, and portfolioAnalysis.ts fan-out pattern all exist from Slice 3–5.

---

## Phase 2: Foundational (Blocking Prerequisites)

> No blocking prerequisites — `src/inngest/dataSources/newsapi.ts` and `src/inngest/portfolioAnalysis.ts` are already in place.

**Checkpoint**: Foundation ready — agent implementation can begin immediately.

---

## Phase 3: User Story 1 — Add Sentiment/News Agent (Priority: P1) 🎯

**Goal**: Sentiment/News agent runs in the fan-out and stores its output under the `sentiment` key in `recommendations.agent_outputs`. The `run_progress` row for `sentiment` transitions Pending → Running → Complete.

**Independent Test**: Trigger a portfolio run. Confirm `run_progress` row for `sentiment` reaches `complete`, and `recommendations.agent_outputs` contains a `sentiment` key with `{ analysis, confidence, stance }`.

### Implementation for User Story 1

- [ ] T001 [US1] Add `SENTIMENT_QUERY` constant and `fetchSentimentArticles()` function to `src/inngest/dataSources/newsapi.ts` — query: `"investor sentiment OR S&P 500 outlook OR earnings season OR market mood OR retail investor"`, same guard/error pattern as `fetchGeopoliticsArticles()`
- [ ] T002 [P] [US1] Extend `src/inngest/dataSources/newsapi.test.ts` with 4 parallel tests for `SENTIMENT_QUERY` (non-empty string, contains expected sentiment terms) and `fetchSentimentArticles` (exported function, returns `[]` when `NEWS_API_KEY` is not set)
- [ ] T003 [US1] Create `src/inngest/agents/sentiment.ts` — follow the exact shape of `geopolitics.ts`; system prompt focuses on retail/institutional sentiment signals, earnings expectations, S&P 500 risk appetite, and fear/greed indicators; calls `fetchSentimentArticles()`; returns `AgentOutput`
- [ ] T004 [US1] Update `src/inngest/portfolioAnalysis.ts`: import `runSentimentAgent`; add `'sentiment'` to the `.in()` filter in `mark-agents-running`; add `step.run('run-sentiment', ...)` to the `Promise.all`; include `sentiment: sentimentOutput` in `store-outputs` `agent_outputs`

**Checkpoint**: All 4 agents (macroeconomics, fed_rates, geopolitics, sentiment) run and complete. `recommendations.agent_outputs` contains all 4 keys.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T005 Verify `npm run build` passes with no type errors
- [ ] T006 Verify `npm test` passes — all existing tests green, 4 new newsapi sentiment tests pass
- [ ] T007 Verify `npm run lint` passes with no errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Already complete
- **User Story (Phase 3)**: T001 must complete before T003 (agent imports the new fetch function); T002 is parallel to T001/T003; T004 depends on T003
- **Polish (Phase 4)**: Depends on all Phase 3 tasks

### Within User Story 1

```
T001 (newsapi.ts: add SENTIMENT_QUERY + fetchSentimentArticles)
  ├── T002 [P] (newsapi.test.ts: add 4 sentiment tests)
  └── T003 (sentiment.ts: create agent — imports fetchSentimentArticles)
        └── T004 (portfolioAnalysis.ts: wire into fan-out)
```

### Parallel Opportunities

```bash
# T001 and T002 can start simultaneously (different concerns, same file for T002)
# Actually T002 tests the exports from T001, so T001 must be written first

# After T001:
# T002 (tests) and T003 (agent) can proceed in parallel — different files
```

---

## Implementation Strategy

### Single-story slice — no phasing needed

1. T001: Extend `newsapi.ts`
2. T002 + T003 in parallel: tests + new agent file
3. T004: Wire into orchestrator
4. T005–T007: Quality gate

---

## Notes

- `sentiment.ts` must follow `geopolitics.ts` exactly — same Zod schema, same fallback, same `claude-sonnet-4-6` call
- `sanitizeErrorMessage` in `portfolioAnalysis.ts` already redacts `NEWS_API_KEY` — no change needed
- The `mark-agents-running` comment was already updated to "all agents" — no further comment fixes needed
- `run_progress` row for `sentiment` is already seeded by the run route — T004 only needs to update the fan-out logic

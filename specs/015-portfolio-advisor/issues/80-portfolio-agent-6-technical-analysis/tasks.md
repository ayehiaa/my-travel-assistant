# Tasks: [Portfolio] Agent 6 — Technical Analysis (Polygon.io) (#80)

**Input**: `specs/015-portfolio-advisor/` (shared module artifacts)

**Issue scope**: Create the Polygon.io OHLCV data connector (`polygon.ts`), add the Technical Analysis agent (`technicalAnalysis.ts`), insert a price-data pre-fetch step into `portfolioAnalysis.ts`, and wire the agent into the 6-agent fan-out.

**Prerequisites**: Slice 3 (Run infrastructure / Inngest) merged ✅. `POLYGON_API_KEY` already set in Vercel (Production + Preview) from the ticker search feature.

**No DB migration required.** The `run_progress` row for `technical_analysis` is already seeded by the run route.

**Key architectural decision**: Polygon.io free tier is 5 calls/minute. Price history is fetched **once per run** in a dedicated `step.run('fetch-price-data')` inserted before the parallel agent step — not inside each agent. The fetched `PriceHistory` map is passed directly to `runTechnicalAnalysisAgent` as an input field. Sector Analysis (Slice 9) will reuse this same pre-fetched data.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: US1 — Add Technical Analysis agent to fan-out

---

## Phase 1: Setup

> Nothing to set up — Inngest and fan-out pattern exist. `POLYGON_API_KEY` is already configured.

---

## Phase 2: Foundational

> No blocking prerequisites beyond existing infrastructure.

---

## Phase 3: User Story 1 — Add Technical Analysis Agent (Priority: P1) 🎯

**Goal**: Technical Analysis agent runs in the fan-out, consumes pre-fetched Polygon.io 30-day OHLCV data, and stores its output under the `technical_analysis` key in `recommendations.agent_outputs`. Polygon.io is called exactly once per run.

**Independent Test**: Trigger a portfolio run. Confirm `run_progress` row for `technical_analysis` reaches `complete`, `recommendations.agent_outputs` contains a `technical_analysis` key, and Polygon.io was called only once (check Polygon.io usage dashboard or verify via a single run with multiple agents).

### Implementation for User Story 1

- [ ] T001 [US1] Create `src/inngest/dataSources/polygon.ts` — export `Candle` interface (`{ date: string, open: number, high: number, low: number, close: number, volume: number }`), `PriceHistory` type alias (`Record<string, Candle[]>`), and `fetchPriceHistory(tickers: string[]): Promise<PriceHistory>`; return `{}` immediately for empty tickers; guard on missing `POLYGON_API_KEY` (return `{}`); fetch each ticker sequentially via `https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?adjusted=true&sort=asc&limit=30&apiKey={key}` where `from` = 30 days ago (ISO date string `YYYY-MM-DD`) and `to` = today; add a `200ms` delay between requests (`await new Promise(r => setTimeout(r, 200))`); on HTTP error or JSON parse failure for any ticker, store `[]` for that ticker and continue; return the populated `PriceHistory` map
- [ ] T002 [P] [US1] Create pure-function tests in `src/inngest/dataSources/polygon.test.ts` — 4 tests: `fetchPriceHistory` is exported as a function; returns `{}` for empty tickers; returns `{}` when `POLYGON_API_KEY` is not set (delete + restore env var, same pattern as newsapi.test.ts); `Candle` interface shape is implied by testing the return type (use TypeScript type assertion in test)
- [ ] T003 [US1] Create `src/inngest/agents/technicalAnalysis.ts` — export `TechnicalAnalysisAgentInput` interface (`{ risk_profile: string, target_return_pct: number, holdings_tickers: string[], priceData: PriceHistory }`); export `runTechnicalAnalysisAgent(input: TechnicalAnalysisAgentInput): Promise<AgentOutput>`; format price data as `- TICKER: {N} days of data, latest close {price}, range {low}–{high}` lines (or `'No price data available.'` if map is empty); system prompt focuses on: 30-day trend direction (higher highs/lows vs lower), simple moving average relationship (is price above or below its 30-day average), momentum (recent days vs earlier days), and support/resistance at recent highs/lows; same `claude-sonnet-4-6` / `max_tokens: 800` / `AgentOutputSchema` / Zod fallback as other agents
- [ ] T004 [US1] Update `src/inngest/portfolioAnalysis.ts` — 5 changes: (1) add `import { fetchPriceHistory, type PriceHistory } from '@/inngest/dataSources/polygon'`; (2) add `import { runTechnicalAnalysisAgent } from '@/inngest/agents/technicalAnalysis'`; (3) insert a new `step.run('fetch-price-data', async (): Promise<PriceHistory> => fetchPriceHistory(tickers))` step between `fetch-portfolio` and `mark-agents-running`, capturing result as `priceData`; (4) add `'technical_analysis'` to `.in('agent_name', [...])` in both `mark-agents-running` and `store-outputs`; (5) add `step.run('run-technical-analysis', ...)` to `Promise.all` with `priceData` passed to `runTechnicalAnalysisAgent`, same error-handling shape as other agents; add `technical_analysis: technicalOutput` to `agent_outputs` in `store-outputs`

**Checkpoint**: 6 agents complete. `recommendations.agent_outputs` has all 6 keys. Polygon.io called once per run.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T005 Verify `npm run build` passes with no type errors
- [ ] T006 Verify `npm test` passes — all existing tests green, 4 new polygon tests pass
- [ ] T007 Verify `npm run lint` passes with no errors

---

## Dependencies & Execution Order

```
T001 (polygon.ts: connector)
  ├── T002 [P] (polygon.test.ts: 4 tests)
  └── T003 (technicalAnalysis.ts: agent — imports PriceHistory type from T001)
        └── T004 (portfolioAnalysis.ts: new step + 6-agent fan-out)
```

T002 and T003 can start in parallel once T001 is written.

---

## Implementation Notes

- **Date calculation**: `from` date = `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]`; `to` date = `new Date().toISOString().split('T')[0]`
- **Rate limit**: 200ms delay between tickers keeps the connector well under 5 calls/minute for portfolios with up to 10 holdings. For larger portfolios, the delay naturally scales (10 tickers = ~2s total fetch time — acceptable within Inngest's step timeout)
- **Missing key**: `fetchPriceHistory` returns `{}` when `POLYGON_API_KEY` is not set — agent runs with empty data and returns `confidence: 'low'` via Zod fallback, same pattern as other agents
- **`priceData` in `step.run('fetch-price-data')`**: Inngest memoizes step results as JSON — `PriceHistory` (Record<string, Candle[]>) is JSON-serializable, so this works correctly with Inngest's replay model
- **`sanitizeErrorMessage`** needs no change — `POLYGON_API_KEY` is NOT currently in the redaction list; T004 should add it to the `keys` array in `sanitizeErrorMessage`
- **`run_progress` row** for `technical_analysis` confirmed at run route line 14
- **Sector Analysis (Slice 9)** will consume the same `priceData` from `fetch-price-data` — no additional Polygon calls needed in that slice

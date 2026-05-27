# Tasks: [Portfolio] Agent 7: Sector Analysis — all 7 agents complete (#81)

**Input**: `specs/015-portfolio-advisor/` (shared module artifacts)

**Issue scope**: Add the Sector Analysis agent (`sectorAnalysis.ts`) and register it as the 7th parallel agent in `portfolioAnalysis.ts`. Reuses the pre-fetched OHLCV `priceData` from the existing `fetch-price-data` step (Slice 8). Adds `fetchTickerDetails` to `polygon.ts` for SIC/sector metadata via a new `fetch-ticker-details` step.

**Prerequisites**: Slice 8 (Technical Analysis / Polygon.io) merged ✅. `POLYGON_API_KEY` already set. `polygon.ts` (with `fetchPriceHistory`), `polygon.test.ts`, and the `fetch-price-data` step in `portfolioAnalysis.ts` all exist. The `sector_analysis` row is already seeded in `run_progress` by `src/app/api/portfolio/run/route.ts` (line 15 `AGENT_NAMES` constant) — no route change needed.

**No DB migration required.**

**Key architectural decisions**:
- The existing `fetch-price-data` step (Slice 8) is reused — `priceData` is passed through to `runSectorAnalysisAgent` at no extra Polygon.io cost.
- A new `fetch-ticker-details` step calls a new `fetchTickerDetails()` export in `polygon.ts` to get SIC metadata via `https://api.polygon.io/v3/reference/tickers/{ticker}`. This is the second and final Polygon.io call per run.
- Both fetches complete before the 7-agent `Promise.all`, preserving the "fetch once per run" invariant from the spec.
- Polygon.io free tier returns no direct GICS field — use `sic_description` (e.g. `"Electronic Computers"`) as the sector proxy for grouping holdings.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 — Add Sector Analysis agent to the 7-agent fan-out

---

## Phase 1: Setup

> Nothing to set up — Inngest, Polygon.io connector, and fan-out pattern all exist from Slices 3 and 8.

---

## Phase 2: Foundational

> No blocking prerequisites beyond the existing infrastructure from Slice 8.

---

## Phase 3: User Story 1 — Add Sector Analysis Agent (Priority: P1) 🎯

**Goal**: Sector Analysis agent runs as the 7th parallel agent in the fan-out, consuming the pre-fetched OHLCV `priceData` and newly fetched Polygon.io ticker details (SIC sector metadata). Its output is stored under the `sector_analysis` key in `recommendations.agent_outputs`. All 7 `run_progress` rows transition from `pending → running → complete`.

**Independent Test**: Trigger a portfolio run. Confirm: (1) `run_progress` has 7 rows, all eventually reaching `complete`; (2) `recommendations.agent_outputs` contains a `sector_analysis` key with `{ analysis, confidence, stance }`; (3) only two Polygon.io fetch steps appear in the Inngest run trace (`fetch-price-data` and `fetch-ticker-details`), not per-agent calls.

### Implementation for User Story 1

- [ ] T001 [US1] Add `TickerDetail` interface, `TickerDetailsMap` type alias, and `fetchTickerDetails(tickers: string[]): Promise<TickerDetailsMap>` export to `src/inngest/dataSources/polygon.ts` — `TickerDetail`: `{ ticker: string, name: string, sic_description: string | null, primary_exchange: string | null }`; `TickerDetailsMap = Record<string, TickerDetail>`; call `https://api.polygon.io/v3/reference/tickers/{ticker}?apiKey=${key}` sequentially for each ticker with a 200ms delay between requests (same rate-limit pattern as `fetchPriceHistory`); on HTTP error or `!json.results` store a fallback `{ ticker, name: ticker, sic_description: null, primary_exchange: null }` and continue; return `{}` immediately for empty tickers array or missing `POLYGON_API_KEY`; do NOT modify `fetchPriceHistory`, `Candle`, or `PriceHistory` — append only
- [ ] T002 [P] [US1] Add 3 new tests for `fetchTickerDetails` to `src/inngest/dataSources/polygon.test.ts` in a new `describe('fetchTickerDetails', () => {...})` block — test 1: `fetchTickerDetails` is exported as a function; test 2: returns `{}` for an empty tickers array; test 3: returns `{}` when `POLYGON_API_KEY` is not set (delete then restore env var, same pattern as the existing `fetchPriceHistory` test at line 14); do not remove or modify any existing `fetchPriceHistory` tests
- [ ] T003 [US1] Create `src/inngest/agents/sectorAnalysis.ts` — export `SectorAnalysisAgentInput` interface: `{ risk_profile: string, target_return_pct: number, holdings_tickers: string[], priceData: PriceHistory, tickerDetails: TickerDetailsMap }`; export `runSectorAnalysisAgent(input: SectorAnalysisAgentInput): Promise<AgentOutput>`; build a sector groups map: iterate `input.holdings_tickers`, look up `tickerDetails[ticker]?.sic_description ?? 'Unknown'` as the key, group tickers under their sector label; for each ticker include its latest close and 30-day return from `priceData` if available (compute return as `(latest - first) / first * 100`); format the user message as sector groupings with per-ticker price summaries, followed by portfolio context (risk profile, target return); system prompt: "You are a sector analysis specialist for US equity portfolios. Analyze the sector composition of the portfolio using the SIC industry classifications provided and assess sector concentration risk, sector rotation signals based on recent price action, and diversification recommendations aligned with the user's risk profile. Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: \"analysis\" (200–400 word string), \"confidence\" (\"low\" | \"medium\" | \"high\"), and \"stance\" (\"bullish\" | \"bearish\" | \"neutral\")."; same `claude-sonnet-4-6` / `max_tokens: 800` / `AgentOutputSchema` (`z.object({ analysis: z.string(), confidence: z.enum([...]), stance: z.enum([...]) })`) / `safeParse` Zod fallback as all other agents; imports: `Anthropic` from `'@anthropic-ai/sdk'`; `z` from `'zod'`; `AgentOutput` from `'@/types/database'`; `PriceHistory` and `TickerDetailsMap` from `'@/inngest/dataSources/polygon'`
- [ ] T004 [US1] Update `src/inngest/portfolioAnalysis.ts` — 6 targeted changes: (1) update the `polygon` import line to also import `fetchTickerDetails` and `TickerDetailsMap`: `import { fetchPriceHistory, fetchTickerDetails, type PriceHistory, type TickerDetailsMap } from '@/inngest/dataSources/polygon'`; (2) add `import { runSectorAnalysisAgent } from '@/inngest/agents/sectorAnalysis'`; (3) after the existing `const priceData = await step.run('fetch-price-data', ...)` block, insert: `const tickerDetails = await step.run('fetch-ticker-details', async (): Promise<TickerDetailsMap> => fetchTickerDetails(tickers))`; (4) add `'sector_analysis'` to the agent name array inside the `mark-agents-running` step's `.in('agent_name', [...])` call; (5) add `step.run('run-sector-analysis', async (): Promise<AgentOutput> => { try { return await runSectorAnalysisAgent({ risk_profile: settings.risk_profile, target_return_pct: settings.target_return_pct, holdings_tickers: tickers, priceData, tickerDetails }) } catch (err) { const errorMessage = sanitizeErrorMessage(err); const admin = createAdminClient(); await Promise.all([admin.from('run_progress').update({ status: 'error', error_message: errorMessage }).eq('run_id', run_id).eq('agent_name', 'sector_analysis'), admin.from('recommendations').update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() }).eq('id', run_id)]); throw err } })` to the `Promise.all` array alongside the other 6 agents, capturing result as `sectorOutput`; (6) in the `store-outputs` step add `sector_analysis: sectorOutput` to the `agent_outputs` object and add `'sector_analysis'` to `.in('agent_name', [...])` in both the `run_progress` update and the `recommendations` update

**Checkpoint**: 7 agents complete. `recommendations.agent_outputs` has all 7 keys: `macroeconomics`, `fed_rates`, `geopolitics`, `sentiment`, `fundamentals`, `technical_analysis`, `sector_analysis`. All `run_progress` rows transition to `complete`.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T005 Verify `npm run build` passes with no TypeScript errors — pay attention to: `TickerDetailsMap` imported and typed correctly in `portfolioAnalysis.ts`; `Promise.all` destructuring updated to include `sectorOutput`; return type of `step.run('run-sector-analysis')` matches `AgentOutput`
- [ ] T006 Verify `npm test` passes — all existing tests green, 3 new `fetchTickerDetails` tests pass
- [ ] T007 Verify `npm run lint` passes with no errors — no `console.log` in new files; no unused imports

---

## Dependencies & Execution Order

```
T001 (polygon.ts: fetchTickerDetails + TickerDetailsMap added)
  ├── T002 [P] (polygon.test.ts: 3 new fetchTickerDetails tests — different file, parallel safe)
  └── T003     (sectorAnalysis.ts: new agent — imports PriceHistory + TickerDetailsMap from T001)
        └── T004 (portfolioAnalysis.ts: fetch-ticker-details step + 7-agent fan-out wiring)
              ├── T005 (npm run build)
              ├── T006 (npm test)
              └── T007 (npm run lint)
```

T002 and T003 can run in parallel once T001 is complete (different files, no shared state).

---

## Parallel Example

```bash
# After T001 completes — launch both simultaneously:
Task T002: "Add 3 fetchTickerDetails tests to polygon.test.ts"
Task T003: "Create src/inngest/agents/sectorAnalysis.ts"

# After T002 + T003 complete:
Task T004: "Wire sectorAnalysis into portfolioAnalysis.ts"
```

---

## Implementation Notes

- **Polygon.io ticker details endpoint**: `GET https://api.polygon.io/v3/reference/tickers/{ticker}?apiKey={key}`. Response: `{ results: { ticker, name, sic_description, primary_exchange, ... } }`. Use `results.sic_description` as the sector proxy (e.g. `"Electronic Computers"`, `"Pharmaceutical Preparations"`). The free tier does not return a GICS sector field.
- **Rate limit**: Same 200ms inter-request delay as `fetchPriceHistory`. A 10-ticker portfolio: price fetch ≈ 2s, ticker-details fetch ≈ 2s — both well within Inngest's step timeouts. Total pre-fetch ≈ 4s sequential (two separate steps).
- **Inngest step memoisation**: `tickerDetails` (a `Record<string, TickerDetail>`) is fully JSON-serialisable. Inngest replays memoised step results correctly — same behaviour as `priceData`.
- **`priceData` reuse**: The sector agent receives the already-computed `priceData` from the `fetch-price-data` step via Inngest's step result caching. No new OHLCV calls are made.
- **`sector_analysis` in `run_progress`**: Already seeded at `src/app/api/portfolio/run/route.ts` line 15 in the `AGENT_NAMES` constant. No route change required.
- **`sanitizeErrorMessage`**: No change needed — `POLYGON_API_KEY` is already in the redaction `keys` array (added in Slice 8, T004 of issue #80).
- **Zod fallback in sectorAnalysis.ts**: If `JSON.parse` or `AgentOutputSchema.safeParse` fails, return `{ analysis: text, confidence: 'low', stance: 'neutral' }` — consistent with all other agents.
- **Empty portfolio edge case**: `fetchTickerDetails([])` returns `{}` immediately. The sector agent formats an empty sector map and still returns a low-confidence output via Zod fallback — run does not crash.

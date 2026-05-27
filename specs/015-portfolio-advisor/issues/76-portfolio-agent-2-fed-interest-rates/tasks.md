# Tasks: [Portfolio] Agent 2: Fed & Interest Rates

**Issue**: #76 | **Spec**: `specs/015-portfolio-advisor/spec.md` | **Plan**: `specs/015-portfolio-advisor/plan.md`

**Scope**: This tasks.md covers only issue #76. Adds the Fed & Interest Rates agent to the Inngest fan-out alongside the existing Macroeconomics agent. No new DB tables, no new API routes, no UI changes — the `run_progress` rows for `fed_rates` are already seeded by the run route from #75.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Exact file paths included in every task

---

## Phase 1: Foundational — Fed Rates FRED Config

**Purpose**: Add the FRED series config needed by the Fed Rates agent. No existing FRED series overlap with macroeconomics — the two agents use distinct series.

**⚠️ CRITICAL**: T001 must complete before T002 and T003.

- [ ] T001 Extend `src/inngest/dataSources/fred.ts`: add a second exported config array `FED_RATES_SERIES_CONFIG: FredSeriesConfig[]` containing four entries — `{ id: 'FEDFUNDS', title: 'Federal Funds Effective Rate', unit: 'Percent' }`, `{ id: 'FEDTARMD', title: 'Fed Funds Target Rate - Upper Limit', unit: 'Percent' }`, `{ id: 'DGS2', title: '2-Year Treasury Yield', unit: 'Percent' }`, `{ id: 'DGS30', title: '30-Year Treasury Yield', unit: 'Percent' }`. Also export a `fetchFedRatesData(): Promise<FredSeries[]>` function that calls `Promise.all(FED_RATES_SERIES_CONFIG.map(fetchOneSeries))` — the `fetchOneSeries` function is already private; make it a named export or duplicate the call pattern. Do not modify the existing `FRED_SERIES_CONFIG` or `fetchFredData` exports — macroeconomics agent must be unaffected.

**Checkpoint**: `fetchFedRatesData()` is importable and returns 4 FRED series. `fetchFredData()` still works unchanged.

---

## Phase 2: User Story — Fed & Interest Rates Agent

**Goal**: A completed run stores a `fed_rates` entry in `recommendations.agent_outputs` with `analysis`, `confidence`, and `stance`. The `run_progress` row for `fed_rates` transitions `pending → running → complete`.

**Independent Test**: Trigger a run via `/portfolio/run`. Watch the Agent Progress panel — `Fed & Rates` row transitions from Pending → Running → Complete. In Supabase, `recommendations.agent_outputs` contains a `fed_rates` key with `{ analysis, confidence, stance }`. `macroeconomics` key is also present and unaffected.

- [ ] T002 [P] [US1] Create `src/inngest/agents/fedRates.ts`: define and export `interface FedRatesAgentInput { risk_profile: string; target_return_pct: number; holdings_tickers: string[] }`. Import `fetchFedRatesData` from `@/inngest/dataSources/fred` and `Anthropic` from `@anthropic-ai/sdk`. Define `SYSTEM_PROMPT` — `'You are a fixed income and monetary policy analyst. Analyze the Federal Reserve interest rate data provided and assess the implications for a US stock portfolio. Focus on: current rate trajectory (hiking/cutting/pausing), yield curve shape (normal/flat/inverted), real vs nominal rates, and forward guidance signals. Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: "analysis" (200–400 word string), "confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'`. Export `async function runFedRatesAgent(input: FedRatesAgentInput): Promise<AgentOutput>` (import `AgentOutput` from `@/types/database`): call `fetchFedRatesData()`, build indicator lines (same pattern as macroeconomics agent — map series to `${s.title} (${s.unit}): latest ${s.latest_value ?? 'N/A'}`), append portfolio context block (risk_profile, target_return_pct, holdings_tickers), call `claude-sonnet-4-6` with max_tokens 800, parse JSON response, return `AgentOutput`; on parse error return `{ analysis: text, confidence: 'low', stance: 'neutral' }`.

- [ ] T003 [US1] Update `src/inngest/portfolioAnalysis.ts` to run both agents in parallel and store both outputs:
  1. Import `runFedRatesAgent` from `@/inngest/agents/fedRates`
  2. Replace the sequential `mark-macro-running` + `run-macroeconomics` steps with a parallel fan-out block:
     - `step.run('mark-agents-running', ...)` — update `run_progress` for BOTH `macroeconomics` AND `fed_rates` to `status = 'running'` in a single Supabase call using `.in('agent_name', ['macroeconomics', 'fed_rates'])`
     - `const [macroOutput, fedRatesOutput] = await Promise.all([step.run('run-macroeconomics', ...), step.run('run-fed-rates', ...)])` — each step wraps the agent call and its own error handler; on error, the step marks its own `run_progress` row and `recommendations` row to `'error'` and rethrows
  3. In `store-outputs` step: update `run_progress` for both agents to `complete` using `.in('agent_name', ['macroeconomics', 'fed_rates'])`, and write `agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput }` to the `recommendations` row
  4. Keep `FetchPortfolioResult`, `EventDataSchema`, `sanitizeErrorMessage`, and the `fetch-portfolio` step completely unchanged

**Checkpoint**: Both agents appear in the Agent Progress panel and both complete. `recommendations.agent_outputs` has two keys. Build, test, and lint all pass.

---

## Dependencies & Execution Order

- **T001** → must complete before T002 and T003
- **T002** (agent file) and **T001** (FRED config) → both must complete before T003
- **T003** (fan-out wiring) → final task; depends on T001 + T002

### Parallel Opportunities

- T001 and T002 can be worked in parallel if desired (T002 imports from T001 but the function signature can be stubbed first; however simplest to do T001 → T002 → T003 sequentially given the small scope)

---

## Implementation Notes

- **No new DB migration** — `run_progress` rows for `fed_rates` are already seeded in `src/app/api/portfolio/run/route.ts` via the `AGENT_NAMES` constant (from #75)
- **No UI changes** — `RunProgress.tsx` already has `fed_rates` mapped to label `'Fed & Rates'`
- **No new API routes** — all existing routes unchanged
- **Error isolation** — each agent's `step.run` has its own try/catch; a fed_rates error must not prevent macroeconomics from completing and vice versa (Inngest retries each step independently)
- **FRED rate limits** — FRED has no rate limits on the free tier; fetching 4 additional series in parallel is safe
- **`fetchOneSeries` visibility** — it's currently unexported and private in `fred.ts`; the cleanest fix is to export it, or alternatively duplicate the `fetchFedRatesData` implementation inline using the same fetch pattern

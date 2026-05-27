# Tasks: [Portfolio] Agent 5 — Fundamentals/Earnings (SEC EDGAR) (#79)

**Input**: `specs/015-portfolio-advisor/` (shared module artifacts)

**Issue scope**: Create the SEC EDGAR connector (`edgar.ts`), add the Fundamentals/Earnings agent (`fundamentals.ts`), and wire it into the `portfolioAnalysis.ts` 5-agent fan-out.

**Prerequisites**: Slice 3 (Run infrastructure / Inngest) merged to `main` ✅. No API key required — SEC EDGAR is public; only a `User-Agent` header is needed.

**No DB migration required.** The `run_progress` row for `fundamentals` is already seeded by the run route (`AGENT_NAMES` in `src/app/api/portfolio/run/route.ts` already contains `'fundamentals'`).

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: US1 — Add Fundamentals/Earnings agent to fan-out

---

## Phase 1: Setup (Shared Infrastructure)

> Nothing to set up — Inngest, agent pattern, and portfolioAnalysis fan-out all exist from earlier slices.

---

## Phase 2: Foundational (Blocking Prerequisites)

> No blocking prerequisites — all infrastructure is in place.

**Checkpoint**: Foundation ready — begin implementation immediately.

---

## Phase 3: User Story 1 — Add Fundamentals/Earnings Agent (Priority: P1) 🎯

**Goal**: The Fundamentals/Earnings agent runs in the fan-out, fetches real EDGAR filing data for each portfolio ticker, and stores its output under the `fundamentals` key in `recommendations.agent_outputs`. Unknown tickers produce an empty filing list rather than crashing.

**Independent Test**: Trigger a portfolio run. Confirm `run_progress` row for `fundamentals` reaches `complete`, and `recommendations.agent_outputs` contains a `fundamentals` key with `{ analysis, confidence, stance }`.

### Implementation for User Story 1

- [ ] T001 [US1] Create `src/inngest/dataSources/edgar.ts` — export `EDGAR_USER_AGENT` constant (`'Sojourn contact@sojourn.app'`), `EdgarFiling` interface (`{ ticker, companyName, formType, filingDate, accessionNumber }`), and `fetchEdgarFilings(tickers: string[]): Promise<EdgarFiling[]>`; for each ticker: (1) resolve CIK via `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={ticker}&type=10-K&dateb=&owner=include&count=1&search_text=&output=atom` with `User-Agent` header, parse CIK from Atom XML response; (2) if CIK found, fetch most recent 10-K and 10-Q from `https://data.sec.gov/submissions/CIK{padded-to-10-digits}.json` with `User-Agent` header, extract up to 2 most recent filings (form type, filing date, accession number); (3) if CIK not found or any fetch fails, skip ticker silently and continue; accumulate results across all tickers and return
- [ ] T002 [P] [US1] Create pure-function tests in `src/inngest/dataSources/edgar.test.ts` — 4 tests: `EDGAR_USER_AGENT` is a non-empty string; `EDGAR_USER_AGENT` contains `'Sojourn'`; `fetchEdgarFilings` is exported as a function; `fetchEdgarFilings` returns `[]` for an empty tickers array (no network call needed)
- [ ] T003 [US1] Create `src/inngest/agents/fundamentals.ts` — follow the exact shape of `sentiment.ts`; export `FundamentalsAgentInput` (same fields as other agents: `risk_profile`, `target_return_pct`, `holdings_tickers`) and `runFundamentalsAgent(input: FundamentalsAgentInput): Promise<AgentOutput>`; call `fetchEdgarFilings(input.holdings_tickers)` to get filing data; if zero filings returned format article content as `'No recent SEC filings found for portfolio holdings.'`; system prompt focuses on: revenue and earnings trajectory from recent 10-K/10-Q filings, balance sheet signals, earnings beat/miss patterns, guidance changes, and filing frequency as a health signal; same `claude-sonnet-4-6` / `max_tokens: 800` / Zod schema / fallback as other agents
- [ ] T004 [US1] Update `src/inngest/portfolioAnalysis.ts`: add `import { runFundamentalsAgent } from '@/inngest/agents/fundamentals'`; add `'fundamentals'` to the `.in('agent_name', [...])` array in `mark-agents-running`; add `fundamentalsOutput` as 5th destructure variable and `step.run('run-fundamentals', ...)` block to `Promise.all` with same error-handling shape; add `'fundamentals'` to `.in()` filter in `store-outputs` and `fundamentals: fundamentalsOutput` to `agent_outputs` object

**Checkpoint**: All 5 agents (macroeconomics, fed_rates, geopolitics, sentiment, fundamentals) run and complete. `recommendations.agent_outputs` contains all 5 keys.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T005 Verify `npm run build` passes with no type errors
- [ ] T006 Verify `npm test` passes — all existing tests green, 4 new edgar tests pass
- [ ] T007 Verify `npm run lint` passes with no errors

---

## Dependencies & Execution Order

### Task Dependencies

```
T001 (edgar.ts: connector)
  ├── T002 [P] (edgar.test.ts: 4 tests — empty-array case needs no network)
  └── T003 (fundamentals.ts: agent — imports fetchEdgarFilings from T001)
        └── T004 (portfolioAnalysis.ts: wire into 5-agent fan-out)
```

T002 and T003 can start in parallel once T001 is complete (different files, no shared state).

### Parallel Opportunities

```bash
# After T001 completes:
# T002 (edgar.test.ts) and T003 (fundamentals.ts) can be worked in parallel
```

---

## Implementation Notes

- **CIK padding**: SEC CIK must be zero-padded to 10 digits in the submissions URL (e.g. CIK 320193 → `CIK0000320193.json`)
- **Atom XML parsing**: The EDGAR browse endpoint returns Atom XML. Extract the CIK from the `<company-info><cik>` element or from the URI pattern in the feed entries. Use simple string extraction (no full XML parser dependency needed)
- **`User-Agent` header**: All SEC requests must include `User-Agent: Sojourn contact@sojourn.app` — requests without it are rate-limited/blocked by SEC
- **Graceful degradation**: Any ticker that fails CIK lookup or filing fetch is silently skipped — the agent runs with whatever data was successfully retrieved; if all tickers fail, the prompt receives the "no filings found" fallback message and returns `confidence: 'low'`
- **No new env vars**: EDGAR requires no API key — only the `User-Agent` header
- **`sanitizeErrorMessage`** in `portfolioAnalysis.ts` needs no change — no new secrets introduced
- **`run_progress` row** for `fundamentals` is already seeded by the run route at line 13

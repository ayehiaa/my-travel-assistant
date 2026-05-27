# Architect Notes — [Portfolio] Agent 7: Sector Analysis (#81)

## Backend Tasks

### T001 — Add `fetchTickerDetails` to `src/inngest/dataSources/polygon.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/polygon.ts`
**Action**: Append only — do not touch existing `Candle`, `PriceHistory`, `PolygonAggResponse`, or `fetchPriceHistory`.

**Types to append after the existing exports:**

```ts
export interface TickerDetail {
  ticker:           string
  name:             string
  sic_description:  string | null
  primary_exchange: string | null
}

export type TickerDetailsMap = Record<string, TickerDetail>
```

**Polygon.io response shape** — `GET /v3/reference/tickers/{ticker}?apiKey=...` returns:

```json
{
  "results": {
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "sic_description": "Electronic Computers",
    "primary_exchange": "XNAS"
  },
  "status": "OK"
}
```

The response body is `{ results?: { ticker, name, sic_description, primary_exchange, ... } }` — `results` is a **single object**, not an array. Define a private interface:

```ts
interface PolygonTickerDetailResponse {
  results?: {
    ticker:           string
    name:             string
    sic_description:  string | null
    primary_exchange: string | null
  }
}
```

**Function to append:**

```ts
export async function fetchTickerDetails(tickers: string[]): Promise<TickerDetailsMap> {
  if (tickers.length === 0) return {}
  if (!process.env.POLYGON_API_KEY) return {}

  const key    = process.env.POLYGON_API_KEY
  const result: TickerDetailsMap = {}

  for (let i = 0; i < tickers.length; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, 200))
    }

    const ticker = tickers[i]
    const url =
      `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}` +
      `?apiKey=${key}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
        continue
      }

      const json = await res.json() as PolygonTickerDetailResponse
      if (!json.results) {
        result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
        continue
      }

      result[ticker] = {
        ticker:           json.results.ticker,
        name:             json.results.name,
        sic_description:  json.results.sic_description ?? null,
        primary_exchange: json.results.primary_exchange ?? null,
      }
    } catch {
      // IMPORTANT: Do not log `url` or the error object — the URL contains POLYGON_API_KEY in plaintext.
      result[ticker] = { ticker, name: ticker, sic_description: null, primary_exchange: null }
    }
  }

  return result
}
```

**Security invariant**: The catch block must remain comment-only — no `console.error`, no `url` reference, no `err` logging. Mirror the exact same pattern already in `fetchPriceHistory` lines 56–59.

---

### T002 — Add tests to `src/inngest/dataSources/polygon.test.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/polygon.test.ts`
**Action**: Append a new `describe` block after the existing `fetchPriceHistory` block. Update the import line at the top to also import `fetchTickerDetails`:

```ts
import { fetchPriceHistory, fetchTickerDetails } from './polygon'
```

**Three test cases to add in a new `describe('fetchTickerDetails', ...` block:**

1. `'is exported as a function'` — `expect(typeof fetchTickerDetails).toBe('function')`
2. `'returns {} for empty tickers array'` — `await fetchTickerDetails([])` → `toEqual({})`
3. `'returns {} when POLYGON_API_KEY is not set'` — delete `process.env.POLYGON_API_KEY`, call with `['AAPL']`, expect `{}`, restore key

Follow the exact same pattern as the three analogous tests in the existing `fetchPriceHistory` describe block (lines 5–28).

---

### T003 — Create `src/inngest/agents/sectorAnalysis.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/agents/sectorAnalysis.ts`
**Action**: Create new file.

**Imports needed:**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import type { PriceHistory } from '@/inngest/dataSources/polygon'
import type { TickerDetailsMap } from '@/inngest/dataSources/polygon'
```

**Input interface:**

```ts
export interface SectorAnalysisAgentInput {
  risk_profile:      string
  target_return_pct: number
  holdings_tickers:  string[]
  priceData:         PriceHistory
  tickerDetails:     TickerDetailsMap
}
```

**AgentOutputSchema** — same as all other agents:

```ts
const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})
```

**Context-building logic:**

Group tickers by `tickerDetails[ticker].sic_description ?? 'Unknown'`. For each sector, list the tickers with their latest close price from `priceData` (same pattern as `technicalAnalysis.ts` lines 33–47). Example output format to aim for:

```
Sector: Electronic Computers
  - AAPL (Apple Inc.): latest close $189.50
  - MSFT (Microsoft Corp.): latest close $415.20

Sector: Unknown
  - XYZ: no price data
```

**System prompt focus areas**: sector concentration risk (over-weight vs. under-weight relative to S&P 500 sector weights), rotation signals (which sectors are showing relative strength vs. weakness based on price trends), diversification recommendations, and whether the current sector mix aligns with the user's risk profile. End with the standard JSON-only instruction:

```
Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: "analysis" (200–400 word string), "confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").
```

**Anthropic call** — identical to all other agents: `model: 'claude-sonnet-4-6'`, `max_tokens: 800`, `system: SYSTEM_PROMPT`, `messages: [{ role: 'user', content: userContent }]`.

**Zod safeParse fallback** — identical to `technicalAnalysis.ts` lines 70–75:

```ts
try {
  const result = AgentOutputSchema.safeParse(JSON.parse(text))
  return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' }
} catch {
  return { analysis: text, confidence: 'low', stance: 'neutral' }
}
```

---

### T004 — Update `src/inngest/portfolioAnalysis.ts` — 6 precise changes

**File**: `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`

**Change 1 — Update polygon import (line 9).**
Replace:
```ts
import { fetchPriceHistory, type PriceHistory } from '@/inngest/dataSources/polygon'
```
With:
```ts
import { fetchPriceHistory, fetchTickerDetails, type PriceHistory, type TickerDetailsMap } from '@/inngest/dataSources/polygon'
```

**Change 2 — Add sectorAnalysis agent import after line 10.**
Insert after the `runTechnicalAnalysisAgent` import:
```ts
import { runSectorAnalysisAgent } from '@/inngest/agents/sectorAnalysis'
```

**Change 3 — Insert `fetch-ticker-details` step after `fetch-price-data` (currently lines 102–105).**
After the `priceData` step.run block closes, insert:
```ts
// Step 3a: Pre-fetch Polygon.io ticker reference data (for sector groupings)
const tickerDetails = await step.run(
  'fetch-ticker-details',
  async (): Promise<TickerDetailsMap> => fetchTickerDetails(tickers),
)
```
The existing step numbering in comments (`Step 3`, `Step 4`, `Step 5`) shifts — update the comment labels accordingly (`Step 3` becomes `Step 4`, etc.) or simply renumber to avoid confusion.

**Change 4 — Update `mark-agents-running` (currently line 114).**
Replace:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis'])
```
With:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis', 'sector_analysis'])
```

**Change 5 — Update `Promise.all` destructuring and add 7th agent (currently lines 118–281).**

Update the destructuring on line 118 to add `sectorOutput` as the 7th element:
```ts
const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput, fundamentalsOutput, technicalOutput, sectorOutput] = await Promise.all([
```

Add the 7th `step.run` entry inside the `Promise.all` array, after the closing of `run-technical-analysis` and before the closing `]`. Use the exact same error-handling shape as all other agents — the `agent_name` value must be `'sector_analysis'`:

```ts
  step.run('run-sector-analysis', async (): Promise<AgentOutput> => {
    try {
      return await runSectorAnalysisAgent({
        risk_profile:      settings.risk_profile,
        target_return_pct: settings.target_return_pct,
        holdings_tickers:  tickers,
        priceData,
        tickerDetails,
      })
    } catch (err) {
      const errorMessage = sanitizeErrorMessage(err)
      const admin = createAdminClient()

      await Promise.all([
        admin
          .from('run_progress')
          .update({ status: 'error', error_message: errorMessage })
          .eq('run_id', run_id)
          .eq('agent_name', 'sector_analysis'),
        admin
          .from('recommendations')
          .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
          .eq('id', run_id),
      ])

      throw err
    }
  }),
```

**Change 6 — Update `store-outputs` step (currently lines 283–311). Two sub-changes:**

6a. Update `run_progress` `.in` filter (line 293) to include `'sector_analysis'`:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis', 'sector_analysis'])
```

6b. Add `sector_analysis: sectorOutput` to `agent_outputs` in the `recommendations` update (after `technical_analysis: technicalOutput`):
```ts
agent_outputs: {
  macroeconomics:     macroOutput,
  fed_rates:          fedRatesOutput,
  geopolitics:        geopoliticsOutput,
  sentiment:          sentimentOutput,
  fundamentals:       fundamentalsOutput,
  technical_analysis: technicalOutput,
  sector_analysis:    sectorOutput,
},
```

Note: the `recommendations` update uses `.eq('id', run_id)` — there is no agent filter on this table. Do not add one.

---

### T005–T007 — Verification

After all code changes are complete, run in order:

1. `npm run build` — must exit 0 with no TypeScript errors
2. `npm test` — all existing tests must pass, plus the 3 new `fetchTickerDetails` tests
3. `npm run lint` — must exit 0 with no ESLint errors

---

## Frontend Tasks

None — this issue is backend-only.

---

## Migration SQL (if any)

None. The `sector_analysis` row in `run_progress` is already seeded at run-trigger time via the `AGENT_NAMES` constant in the run route (mentioned in the issue: "The `sector_analysis` row is already seeded in `run_progress`"). No schema changes are required.

---

## Conflicts / Risks

**R1 — Polygon.io response shape mismatch (HIGH — must get right).**
The `/v3/reference/tickers/{ticker}` endpoint returns `results` as a **single object**, not an array. This is different from the aggregates endpoint (`/v2/aggs/...`) which returns `results` as an array. The `PolygonTickerDetailResponse` private interface must type `results` as a plain object. If mistakenly typed as an array, accessing `.sic_description` will fail silently or throw at runtime.

**R2 — API key in URL (SECURITY — do not log).**
The `/v3/reference/tickers/{ticker}?apiKey=${key}` URL contains `POLYGON_API_KEY` in plaintext as a query parameter. The catch block in `fetchTickerDetails` must contain only a comment and the fallback assignment — no `console.error(url)`, no `console.error(err)`. Mirror `fetchPriceHistory` lines 56–59 exactly.

**R3 — `Promise.all` destructuring position (CORRECTNESS).**
`sectorOutput` must be the 7th positional element in the destructuring — it must exactly match the 7th `step.run` in the `Promise.all` array. Misalignment will silently assign the wrong output to the wrong variable. Double-check array count after editing.

**R4 — `store-outputs` has two separate DB targets (CORRECTNESS).**
In the `store-outputs` step, `run_progress` uses `.in('agent_name', [...])` — `'sector_analysis'` must be added here. The `recommendations` table uses `.eq('id', run_id)` with no agent filter — do not change this filter, only add `sector_analysis: sectorOutput` to the `agent_outputs` object literal.

**R5 — Inngest step name must be stable (CORRECTNESS).**
The string `'fetch-ticker-details'` passed to `step.run(...)` becomes the durable step ID in Inngest. Once deployed it must not be renamed or existing in-flight runs will re-execute the step from scratch. Choose the name deliberately on first deploy.

**R6 — Rate limiting on ticker details fetch (LOW RISK).**
`fetchTickerDetails` calls the Polygon.io reference endpoint once per ticker with 200ms delay (same throttle as `fetchPriceHistory`). For a large portfolio (>50 tickers) this adds latency but no cap is applied. If needed, the `MAX_TICKERS = 50` constant from `fetchPriceHistory` could be reused, but the issue does not require it — leave uncapped for now to match the issue spec.

**R7 — `sic_description` field may be null or absent (LOW RISK — handled by fallback).**
Some Polygon.io ticker reference records omit `sic_description` (e.g., ETFs, non-operating holding companies). The grouping logic in `runSectorAnalysisAgent` must use `tickerDetails[ticker]?.sic_description ?? 'Unknown'` as the fallback sector label. If `tickerDetails[ticker]` itself is undefined (ticker not in map), also fall back to `'Unknown'`.

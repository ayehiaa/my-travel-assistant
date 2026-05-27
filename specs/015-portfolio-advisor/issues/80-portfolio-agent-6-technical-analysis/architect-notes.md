# Architect Notes — [Portfolio] Agent 6: Technical Analysis (Polygon.io) (#80)

## Backend Tasks

### T001 — Create `src/inngest/dataSources/polygon.ts`

**Action**: Create

Export the following from this file:

```ts
export interface Candle {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type PriceHistory = Record<string, Candle[]>

export async function fetchPriceHistory(tickers: string[]): Promise<PriceHistory>
```

Implementation rules:
- Return `{}` immediately if `tickers.length === 0` — no network call.
- Return `{}` immediately if `!process.env.POLYGON_API_KEY`.
- Date calculation (compute inside the function at call time):
  - `from`: `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]`
  - `to`: `new Date().toISOString().split('T')[0]`
- Fetch each ticker **sequentially** (not in parallel) using the URL pattern:
  ```
  https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?adjusted=true&sort=asc&limit=30&apiKey={key}
  ```
- Insert `await new Promise(r => setTimeout(r, 200))` between successive ticker fetches (not before the first, not after the last). A clean pattern: iterate with a for-loop; on every iteration after the first, delay first then fetch.
- On `!res.ok` or any `JSON.parse` error for a given ticker, store `[]` for that ticker and `continue` — never let a single ticker failure abort the whole map.
- The Polygon.io OHLCV response shape (for the connector's internal type only — do not export):
  ```ts
  interface PolygonAggResponse {
    results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>
  }
  ```
  Map each result bar: `date` = `new Date(bar.t).toISOString().split('T')[0]`, then `open/high/low/close/volume` from `bar.o/h/l/c/v`.
- IMPORTANT security note: do NOT log `url` or raw error objects inside the catch block — the URL contains `POLYGON_API_KEY` in plaintext. Match the comment pattern from `newsapi.ts`:
  ```ts
  // IMPORTANT: Do not log `url` or error here — the URL contains POLYGON_API_KEY in plaintext.
  ```

---

### T002 — Create `src/inngest/dataSources/polygon.test.ts`

**Action**: Create

Exactly 4 tests inside a single `describe('fetchPriceHistory', ...)` block. Pattern mirrors `newsapi.test.ts`.

```ts
import { describe, it, expect } from 'vitest'
import { fetchPriceHistory } from './polygon'

describe('fetchPriceHistory', () => {
  it('is exported as a function', () => {
    expect(typeof fetchPriceHistory).toBe('function')
  })

  it('returns {} for empty tickers array', async () => {
    const result = await fetchPriceHistory([])
    expect(result).toEqual({})
  })

  it('returns {} when POLYGON_API_KEY is not set', async () => {
    const original = process.env.POLYGON_API_KEY
    delete process.env.POLYGON_API_KEY
    const result = await fetchPriceHistory(['AAPL'])
    expect(result).toEqual({})
    process.env.POLYGON_API_KEY = original
  })

  it('returns a plain object, not an array', async () => {
    // No network call — empty tickers hits the early-return guard
    const result = await fetchPriceHistory([])
    expect(typeof result).toBe('object')
    expect(Array.isArray(result)).toBe(false)
  })
})
```

Note: tests 3 and 4 both exercise guard paths that require no network. The "plain object" assertion is a deliberate type-shape guard distinct from the `toEqual({})` check.

---

### T003 — Create `src/inngest/agents/technicalAnalysis.ts`

**Action**: Create

Mirror the exact structure of `src/inngest/agents/sentiment.ts`.

```ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import type { PriceHistory } from '@/inngest/dataSources/polygon'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface TechnicalAnalysisAgentInput {
  risk_profile:      string
  target_return_pct: number
  holdings_tickers:  string[]
  priceData:         PriceHistory   // extra field vs other agents
}

export async function runTechnicalAnalysisAgent(
  input: TechnicalAnalysisAgentInput
): Promise<AgentOutput>
```

**System prompt focus areas** (include all four):
1. 30-day trend direction: whether the stock is making higher highs and higher lows (uptrend) or lower highs and lower lows (downtrend).
2. Simple moving average relationship: whether the latest close is above or below the 30-day average close.
3. Momentum: compare average close of the most recent 5 days vs the earliest 5 days.
4. Support and resistance: recent 30-day high/low as reference levels.

End the system prompt with the same JSON-only instruction:
```
Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields:
"analysis" (200–400 word string), "confidence" ("low" | "medium" | "high"),
and "stance" ("bullish" | "bearish" | "neutral").
```

**Price data formatting** (construct as `priceContext` string, injected into user message):

```ts
const tickersWithData = input.holdings_tickers.filter(
  ticker => (input.priceData[ticker]?.length ?? 0) > 0
)

const priceContext = tickersWithData.length === 0
  ? 'No price data available for portfolio holdings.'
  : tickersWithData
      .map(ticker => {
        const candles = input.priceData[ticker]
        const latest  = candles[candles.length - 1]
        const low30   = Math.min(...candles.map(c => c.low))
        const high30  = Math.max(...candles.map(c => c.high))
        return `- ${ticker}: ${candles.length} candles, latest close $${latest.close.toFixed(2)}, 30-day range $${low30.toFixed(2)}–$${high30.toFixed(2)}`
      })
      .join('\n')
```

User message structure (same shape as `sentiment.ts`):
```
30-day OHLCV price data for portfolio holdings:
{priceContext}

Portfolio context:
Risk profile: {risk_profile}
Target return: {target_return_pct}%
Holdings: {holdings_tickers.join(', ')}
```

Model/token/Zod fallback: identical to all other agents — `claude-sonnet-4-6`, `max_tokens: 800`, same `try/catch` Zod fallback returning `{ analysis: text, confidence: 'low', stance: 'neutral' }`.

---

### T004 — Modify `src/inngest/portfolioAnalysis.ts`

**Action**: Modify — 5 discrete changes described below.

**Change 1 — Add import for `fetchPriceHistory` and `PriceHistory`** (insert after the existing `@/inngest/agents/fundamentals` import line):
```ts
import { fetchPriceHistory, type PriceHistory } from '@/inngest/dataSources/polygon'
import { runTechnicalAnalysisAgent } from '@/inngest/agents/technicalAnalysis'
```

**Change 2 — Add `POLYGON_API_KEY` to `sanitizeErrorMessage`** (security requirement — the key appears in OHLCV URLs):

Current line 18:
```ts
const keys = [process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.NEWS_API_KEY].filter(Boolean) as string[]
```
Replace with:
```ts
const keys = [process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.NEWS_API_KEY, process.env.POLYGON_API_KEY].filter(Boolean) as string[]
```

**Change 3 — Insert `fetch-price-data` step between `fetch-portfolio` and `mark-agents-running`** (after line 97, before line 99):
```ts
// Step 2: Pre-fetch Polygon.io OHLCV data (once per run — rate-limit safe)
const priceData = await step.run(
  'fetch-price-data',
  async (): Promise<PriceHistory> => fetchPriceHistory(tickers),
)
```
The existing step 2 (`mark-agents-running`) and step 3 (`Promise.all`) comments must be renumbered to Step 3 and Step 4 respectively. The `store-outputs` step becomes Step 5.

**Change 4 — Add `'technical_analysis'` to the `.in('agent_name', [...])` arrays** in two places:

In `mark-agents-running` (currently line 106):
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis'])
```

In `store-outputs` (currently line 257):
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis'])
```

**Change 5 — Add `run-technical-analysis` to the `Promise.all` fan-out** and update the destructured result binding and `agent_outputs` object.

Destructure binding change (line 110):
```ts
const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput, fundamentalsOutput, technicalOutput] = await Promise.all([
```

Add as the sixth element in the `Promise.all` array (after the closing of `run-fundamentals`):
```ts
step.run('run-technical-analysis', async (): Promise<AgentOutput> => {
  try {
    return await runTechnicalAnalysisAgent({
      risk_profile:      settings.risk_profile,
      target_return_pct: settings.target_return_pct,
      holdings_tickers:  tickers,
      priceData,
    })
  } catch (err) {
    const errorMessage = sanitizeErrorMessage(err)
    const admin = createAdminClient()

    await Promise.all([
      admin
        .from('run_progress')
        .update({ status: 'error', error_message: errorMessage })
        .eq('run_id', run_id)
        .eq('agent_name', 'technical_analysis'),
      admin
        .from('recommendations')
        .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
        .eq('id', run_id),
    ])

    throw err
  }
}),
```

Update `agent_outputs` in `store-outputs` (line 261):
```ts
agent_outputs: {
  macroeconomics: macroOutput,
  fed_rates:      fedRatesOutput,
  geopolitics:    geopoliticsOutput,
  sentiment:      sentimentOutput,
  fundamentals:   fundamentalsOutput,
  technical_analysis: technicalOutput,
},
```

---

## Frontend Tasks

None. This issue is backend-only. No UI components, no API routes, no page changes.

---

## Migration SQL (if any)

None required. The `run_progress` row for `technical_analysis` is confirmed as already seeded by the run route (noted in tasks.md line 9). No new tables or columns.

---

## Conflicts / Risks

**Risk 1 — `sanitizeErrorMessage` key array order matters for test determinism.**
The `POLYGON_API_KEY` must be appended to the existing array (not inserted in the middle). The order only affects which key is redacted first if two keys share a substring — unlikely in practice, but the convention is append-only.

**Risk 2 — Inngest step memoization of `PriceHistory`.**
`PriceHistory` is `Record<string, Candle[]>` where all values are primitives — fully JSON-serializable. This is safe for Inngest's replay model. However, if a future change introduces a `Date` object inside `Candle`, memoization will break silently. Keep `date` as an ISO string, not a `Date` instance.

**Risk 3 — Polygon.io free tier rate limit (5 calls/minute).**
The 200ms sequential delay allows up to 5 tickers in 1 second — within the 5 calls/minute limit only if a run happens no more than once per minute per user. Because `fetch-price-data` is an Inngest step, Inngest will memoize its result on replay, so retries do not re-fetch. The risk is concurrent runs for different users all hitting Polygon simultaneously. At current scale this is acceptable; document for Slice 9 (Sector Analysis) that it must reuse the same `priceData` step result rather than adding a new Polygon step.

**Risk 4 — `priceData` const captured before `mark-agents-running`.**
The step ordering is: `fetch-portfolio` → `fetch-price-data` → `mark-agents-running` → `Promise.all`. This means the `priceData` const is in scope when the `Promise.all` fan-out runs. Ensure the backend-dev agent does not accidentally move `fetch-price-data` after `mark-agents-running` — the `tickers` array used as its argument must come from the completed `fetch-portfolio` step.

**Risk 5 — Empty `priceData` does not fail the agent.**
When `POLYGON_API_KEY` is absent or all ticker fetches fail, `fetchPriceHistory` returns `{}`. `runTechnicalAnalysisAgent` must handle this gracefully via the `tickersWithData.length === 0` branch, emitting `"No price data available for portfolio holdings."` to Claude. Claude will return a low-confidence response, which the Zod fallback preserves. This is the intended degraded-mode behaviour — do not throw.

**Risk 6 — `technical_analysis` agent name must match exactly.**
The `run_progress` seed uses `technical_analysis` (snake_case with underscore). The `.in('agent_name', [...])` arrays and the `agent_outputs` key must use exactly `'technical_analysis'` — not `'technical-analysis'` or `'technicalAnalysis'`. Verify against the run route seed before shipping.

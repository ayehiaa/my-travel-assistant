# Architect Notes — [Portfolio] Agent 5: Fundamentals/Earnings (SEC EDGAR) (#79)

## Backend Tasks

### T001 — Create `src/inngest/dataSources/edgar.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/edgar.ts`
**Action**: Create

Export the following in this order:

**Constant**:
```ts
export const EDGAR_USER_AGENT = 'Sojourn contact@sojourn.app'
```

**Interface**:
```ts
export interface EdgarFiling {
  ticker:          string
  companyName:     string
  formType:        string   // '10-K' or '10-Q'
  filingDate:      string   // ISO date string e.g. '2024-11-01'
  accessionNumber: string   // e.g. '0000320193-24-000123'
}
```

**Internal interface** (not exported — used only inside edgar.ts):
```ts
interface SubmissionsJson {
  name:   string
  filings: {
    recent: {
      form:            string[]
      filingDate:      string[]
      accessionNumber: string[]
    }
  }
}
```

**CIK resolution — Step 1: browse-edgar Atom feed**

URL pattern (one per ticker):
```
https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={TICKER}&type=10-K&dateb=&owner=include&count=1&search_text=&output=atom
```

Make a `GET` request with header `User-Agent: Sojourn contact@sojourn.app`. Read the response as text. Extract the CIK with:
```ts
const match = responseText.match(/CIK=(\d+)/i)
const cik = match?.[1] ?? null
```
If `match` is null, or the fetch throws, skip this ticker (return nothing for it).

**Filing fetch — Step 2: submissions endpoint**

URL pattern (once per resolved CIK):
```
https://data.sec.gov/submissions/CIK{padded}.json
```
where `padded` is the CIK zero-padded to 10 digits:
```ts
const padded = cik.padStart(10, '0')
```
Full URL: `https://data.sec.gov/submissions/CIK${padded}.json`

Make a `GET` request with the same `User-Agent` header. Parse the response as `SubmissionsJson`. From `json.filings.recent`, iterate `form[]` to find the first occurrence of `'10-K'` and the first occurrence of `'10-Q'`. For each match, create an `EdgarFiling` object using the corresponding `filingDate[i]` and `accessionNumber[i]`. Collect up to 2 filings (at most one 10-K and one 10-Q) per ticker.

**Exported function signature**:
```ts
export async function fetchEdgarFilings(tickers: string[]): Promise<EdgarFiling[]>
```

**Full control flow inside `fetchEdgarFilings`**:
1. If `tickers.length === 0` return `[]` immediately (no network calls).
2. For each ticker, run a `try/catch` block that:
   a. Fetches the browse-edgar Atom feed URL.
   b. If `!res.ok`, continues (skip ticker).
   c. Reads body as text, extracts CIK via regex. If no CIK, continues.
   d. Fetches the submissions JSON URL.
   e. If `!res.ok`, continues.
   f. Parses JSON as `SubmissionsJson`.
   g. Scans `filings.recent.form` array for the first `'10-K'` index and first `'10-Q'` index.
   h. Pushes an `EdgarFiling` for each found form type.
   i. On any thrown error, continues (skip ticker silently).
3. Process tickers sequentially (not `Promise.all`) to respect SEC rate limits — the SEC recommends no more than 10 requests per second; sequential per-ticker processing (2 requests each) is safe without added delay.
4. Return accumulated `EdgarFiling[]`.

**No env-var guard needed** — EDGAR has no API key. The `User-Agent` header is the only credential.

---

### T002 — Create `src/inngest/dataSources/edgar.test.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/edgar.test.ts`
**Action**: Create

Follow the exact structure of `/workspaces/my-travel-assistant/src/inngest/dataSources/newsapi.test.ts`.

Four tests — all pure, no mocking, no network:

```ts
import { describe, it, expect } from 'vitest'
import { EDGAR_USER_AGENT, fetchEdgarFilings } from './edgar'

describe('EDGAR_USER_AGENT', () => {
  it('is a non-empty string', () => {
    expect(typeof EDGAR_USER_AGENT).toBe('string')
    expect(EDGAR_USER_AGENT.length).toBeGreaterThan(0)
  })

  it('contains "Sojourn"', () => {
    expect(EDGAR_USER_AGENT).toContain('Sojourn')
  })
})

describe('fetchEdgarFilings', () => {
  it('is exported as a function', () => {
    expect(typeof fetchEdgarFilings).toBe('function')
  })

  it('returns empty array for empty tickers input without making network calls', async () => {
    const result = await fetchEdgarFilings([])
    expect(result).toEqual([])
  })
})
```

No test for live network behaviour — the empty-array early-return is the only pure-function case available without mocking.

---

### T003 — Create `src/inngest/agents/fundamentals.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/agents/fundamentals.ts`
**Action**: Create

Follow the exact shape of `/workspaces/my-travel-assistant/src/inngest/agents/sentiment.ts`. Differences are in the data source import, input interface name, system prompt, and content formatting.

**Imports** (same pattern as sentiment.ts):
```ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchEdgarFilings } from '@/inngest/dataSources/edgar'
```

**Schema** (identical to all other agents — copy verbatim):
```ts
const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})
```

**Exported input interface**:
```ts
export interface FundamentalsAgentInput {
  risk_profile:      string
  target_return_pct: number
  holdings_tickers:  string[]
}
```

**System prompt** (assign to `const SYSTEM_PROMPT`):
```ts
const SYSTEM_PROMPT =
  'You are a fundamental equity analyst specializing in SEC filing analysis for US public companies. ' +
  'Analyze the SEC filing data provided and assess the fundamental health and earnings trajectory of the portfolio holdings. ' +
  'Focus on: revenue and earnings trends indicated by recent 10-K annual and 10-Q quarterly filings, ' +
  'balance sheet signals (debt levels, cash position changes visible from filing frequency and dates), ' +
  'recency of filings as a governance and transparency signal, ' +
  'companies with missing or delayed filings as a risk flag, ' +
  'and whether the overall fundamental picture supports or contradicts a bullish portfolio stance. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'
```

**Exported function**:
```ts
export async function runFundamentalsAgent(input: FundamentalsAgentInput): Promise<AgentOutput>
```

**Inside `runFundamentalsAgent`**:

1. Call `fetchEdgarFilings(input.holdings_tickers)` and await the result.
2. Build `articleContent`:
   - If `filings.length === 0`: `'No recent SEC filings found for portfolio holdings.'`
   - Otherwise: format each filing as:
     ```ts
     filings
       .map(f => `- ${f.ticker} (${f.companyName}): ${f.formType} filed ${f.filingDate}, accession ${f.accessionNumber}`)
       .join('\n')
     ```
3. Build `portfolioContext` (identical pattern to all other agents):
   ```ts
   const portfolioContext =
     `\nPortfolio context:\n` +
     `Risk profile: ${input.risk_profile}\n` +
     `Target return: ${input.target_return_pct}%\n` +
     `Holdings: ${input.holdings_tickers.join(', ')}`
   ```
4. Build `userContent`:
   ```ts
   const userContent = `Recent SEC filings:\n${articleContent}${portfolioContext}`
   ```
5. Construct Anthropic client and call (identical to all other agents):
   ```ts
   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
   const response = await client.messages.create({
     model:      'claude-sonnet-4-6',
     max_tokens: 800,
     system:     SYSTEM_PROMPT,
     messages:   [{ role: 'user', content: userContent }],
   })
   ```
6. Parse and return (identical fallback pattern to all other agents):
   ```ts
   const block = response.content[0]
   const text = block.type === 'text' ? block.text : ''
   try {
     const result = AgentOutputSchema.safeParse(JSON.parse(text))
     return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' }
   } catch {
     return { analysis: text, confidence: 'low', stance: 'neutral' }
   }
   ```

---

### T004 — Update `src/inngest/portfolioAnalysis.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`
**Action**: Modify

Four discrete changes (all additive, no existing lines removed):

**Change 1 — Add import after the existing sentiment import (line 7):**
```ts
import { runFundamentalsAgent } from '@/inngest/agents/fundamentals'
```
Resulting import block (lines 4–8):
```ts
import { runMacroeconomicsAgent } from '@/inngest/agents/macroeconomics'
import { runFedRatesAgent } from '@/inngest/agents/fedRates'
import { runGeopoliticsAgent } from '@/inngest/agents/geopolitics'
import { runSentimentAgent } from '@/inngest/agents/sentiment'
import { runFundamentalsAgent } from '@/inngest/agents/fundamentals'
```

**Change 2 — Extend the `mark-agents-running` `.in()` array (line 105):**

Old:
```ts
        .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment'])
```
New:
```ts
        .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals'])
```

**Change 3 — Add `fundamentalsOutput` as the 5th element in the `Promise.all` destructure and add the `step.run('run-fundamentals', ...)` block.**

Old destructure (line 109):
```ts
    const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput] = await Promise.all([
```
New destructure:
```ts
    const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput, fundamentalsOutput] = await Promise.all([
```

Add the following `step.run` block inside the `Promise.all([...])` array, after the closing `]),` of `run-sentiment` and before the final `])` of `Promise.all`:

```ts
      step.run('run-fundamentals', async (): Promise<AgentOutput> => {
        try {
          return await runFundamentalsAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'fundamentals'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),
```

**Change 4 — Update `store-outputs` step (lines 229 and 233):**

Old `.in()` filter:
```ts
          .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment']),
```
New:
```ts
          .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals']),
```

Old `agent_outputs` object:
```ts
            agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput, sentiment: sentimentOutput },
```
New:
```ts
            agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput, sentiment: sentimentOutput, fundamentals: fundamentalsOutput },
```

---

## Frontend Tasks

None — pure backend slice.

---

## Migration SQL (if any)

None. The `run_progress` row for `fundamentals` is already seeded by the run route. The `agent_outputs` column in `recommendations` is `Record<string, AgentOutput>` (JSONB), so adding a new key requires no schema change.

---

## Conflicts / Risks

1. **SEC rate limiting**: The EDGAR fair-access policy caps automated requests at 10 per second per IP. Sequential ticker processing (2 HTTP requests per ticker) is safe for typical portfolio sizes (under 20 tickers = at most 40 requests). Do not switch to `Promise.all` across tickers in `fetchEdgarFilings` without adding a rate-limiter.

2. **Atom feed vs. direct CIK lookup**: The browse-edgar `output=atom` endpoint is used for CIK discovery by ticker symbol. A cleaner alternative (`https://efts.sec.gov/LATEST/search-index?q=%22TICKER%22&dateRange=custom&...`) exists but has different stability characteristics. The Atom feed CIK regex approach (`/CIK=(\d+)/i`) is specified in the issue and is the correct approach — the CIK always appears in the feed's `<id>` URI element.

3. **CIK collision risk**: Searching by ticker in the `company` parameter of browse-edgar can return results for companies whose name contains the ticker string (not an exact match). The `count=1` parameter returns the closest match. For extremely ambiguous tickers this may return the wrong CIK and thus wrong filings. The graceful-degradation path (skip on failure) mitigates downstream impact — wrong filings produce a low-quality analysis rather than a crash.

4. **`sanitizeErrorMessage` in `portfolioAnalysis.ts`**: No change needed. EDGAR has no API key in URLs; no new secret needs redaction.

5. **`run_progress` seeding**: Confirmed in tasks.md line 9 — the `AGENT_NAMES` array in `src/app/api/portfolio/run/route.ts` already contains `'fundamentals'`, so the row is pre-seeded before the Inngest function fires. No change to the run route is required.

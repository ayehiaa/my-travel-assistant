# Architect Notes — [Portfolio] Agent 4: Sentiment/News (#78)

## Backend Tasks

### T001 — Extend `src/inngest/dataSources/newsapi.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/newsapi.ts`
**Action**: Modify — append below the existing `fetchGeopoliticsArticles` export.

Add the following constant and function. The guard/error pattern must be identical to `fetchGeopoliticsArticles()` — same early return on missing key, same silent `return []` in the catch block, same URL construction.

```ts
export const SENTIMENT_QUERY =
  'investor sentiment OR S&P 500 outlook OR earnings season OR market mood OR retail investor'

export async function fetchSentimentArticles(): Promise<NewsArticle[]> {
  if (!process.env.NEWS_API_KEY) return []

  try {
    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(SENTIMENT_QUERY)}` +
      `&language=en` +
      `&pageSize=10` +
      `&sortBy=publishedAt` +
      `&apiKey=${process.env.NEWS_API_KEY}`

    const res = await fetch(url)
    if (!res.ok) return []

    const json = await res.json() as NewsApiResponse
    return (json.articles ?? []).map(a => ({
      title:       a.title,
      description: a.description ?? null,
    }))
  } catch {
    // IMPORTANT: Do not log `url` or error here — the URL contains NEWS_API_KEY in plaintext.
    return []
  }
}
```

Note: `NewsApiResponse` is the existing unexported interface on line 7 of `newsapi.ts`. No change needed — the new function is in the same file and shares it.

---

### T002 — Extend `src/inngest/dataSources/newsapi.test.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/dataSources/newsapi.test.ts`
**Action**: Modify — add two new `describe` blocks after the existing `fetchGeopoliticsArticles` block. Follow the exact same pattern as the existing four tests.

```ts
import { GEOPOLITICS_QUERY, fetchGeopoliticsArticles, SENTIMENT_QUERY, fetchSentimentArticles } from './newsapi'

// ... existing tests unchanged ...

describe('SENTIMENT_QUERY', () => {
  it('is a non-empty string', () => {
    expect(typeof SENTIMENT_QUERY).toBe('string')
    expect(SENTIMENT_QUERY.length).toBeGreaterThan(0)
  })

  it('contains expected sentiment terms', () => {
    const lower = SENTIMENT_QUERY.toLowerCase()
    const hasAtLeastOne = ['investor sentiment', 's&p 500', 'earnings season', 'market mood'].some(t => lower.includes(t))
    expect(hasAtLeastOne).toBe(true)
  })
})

describe('fetchSentimentArticles', () => {
  it('is exported as a function', () => {
    expect(typeof fetchSentimentArticles).toBe('function')
  })

  it('returns empty array when NEWS_API_KEY is not set', async () => {
    const original = process.env.NEWS_API_KEY
    delete process.env.NEWS_API_KEY
    const result = await fetchSentimentArticles()
    expect(result).toEqual([])
    process.env.NEWS_API_KEY = original
  })
})
```

The import line at the top of the file must be updated to include `SENTIMENT_QUERY` and `fetchSentimentArticles`.

---

### T003 — Create `src/inngest/agents/sentiment.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/agents/sentiment.ts`
**Action**: Create — mirror `geopolitics.ts` exactly. Copy the file structure verbatim; change only the imports, interface name, constant name, system prompt text, function name, and the fetch call.

**Exact function signature**:
```ts
export async function runSentimentAgent(input: SentimentAgentInput): Promise<AgentOutput>
```

**Interface**:
```ts
export interface SentimentAgentInput {
  risk_profile: string
  target_return_pct: number
  holdings_tickers: string[]
}
```

**Import line** (replaces the geopolitics import):
```ts
import { fetchSentimentArticles } from '@/inngest/dataSources/newsapi'
```

**`SYSTEM_PROMPT` constant** — replace the geopolitics prompt with:
```ts
const SYSTEM_PROMPT =
  'You are a market sentiment analyst specializing in retail and institutional investor behavior. ' +
  'Analyze the news headlines provided and assess the current market mood and its implications for a US stock portfolio. ' +
  'Focus on: the CNN Fear & Greed index direction and what headlines imply about it, ' +
  'retail investor positioning signals (meme activity, put/call ratios, AAII survey sentiment), ' +
  'institutional flows (hedge fund positioning, fund flows into/out of equities), ' +
  'earnings season expectations versus reality (beats, misses, guidance cuts), ' +
  'and S&P 500 risk appetite (whether the market is in risk-on or risk-off mode). ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'
```

**Body of `runSentimentAgent`** — copy `runGeopoliticsAgent` verbatim, replacing:
- `fetchGeopoliticsArticles()` → `fetchSentimentArticles()`
- `'No recent geopolitical news articles found.'` → `'No recent market sentiment news articles found.'`
- `'Recent geopolitical headlines:\n'` → `'Recent market sentiment headlines:\n'`

Everything else (Zod schema, `AgentOutputSchema`, Anthropic client instantiation, `claude-sonnet-4-6`, `max_tokens: 800`, fallback `{ analysis: text, confidence: 'low', stance: 'neutral' }`) stays identical to `geopolitics.ts`.

---

### T004 — Update `src/inngest/portfolioAnalysis.ts`

**File**: `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`
**Action**: Modify — four targeted changes.

**Change 1 — Add import** (after the existing `runGeopoliticsAgent` import on line 6):
```ts
import { runSentimentAgent } from '@/inngest/agents/sentiment'
```

**Change 2 — `mark-agents-running` step** (line 104 currently):

Old `.in()` call:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics'])
```
New:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment'])
```

**Change 3 — `Promise.all` destructure and array** (line 108 currently):

Old destructure:
```ts
const [macroOutput, fedRatesOutput, geopoliticsOutput] = await Promise.all([
```
New:
```ts
const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput] = await Promise.all([
```

Then add a fourth `step.run` entry inside the `Promise.all` array, after the closing of the `run-geopolitics` block (after line 188):

```ts
step.run('run-sentiment', async (): Promise<AgentOutput> => {
  try {
    return await runSentimentAgent({
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
        .eq('agent_name', 'sentiment'),
      admin
        .from('recommendations')
        .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
        .eq('id', run_id),
    ])

    throw err
  }
}),
```

**Change 4 — `store-outputs` step**:

Old `.in()` call (line 201 currently):
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics']),
```
New:
```ts
.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment']),
```

Old `agent_outputs` object (line 205 currently):
```ts
agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput },
```
New:
```ts
agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput, sentiment: sentimentOutput },
```

---

### T005–T007 — Quality Gate

- Run `npm run build` — must pass with no type errors
- Run `npm test` — all existing tests green; 4 new sentiment tests in `newsapi.test.ts` pass
- Run `npm run lint` — no errors

---

## Frontend Tasks

None — this is a pure backend slice.

---

## Migration SQL (if any)

None — no DB changes required. The `run_progress` row for `sentiment` is already seeded by the run route (`AGENT_NAMES` array in `src/app/api/portfolio/run/route.ts` already contains `'sentiment'`).

---

## Conflicts / Risks

**No conflicts found.**

Specific checks performed:

1. **`sanitizeErrorMessage` in `portfolioAnalysis.ts` (line 16)** already includes `process.env.NEWS_API_KEY` in the keys array. No change needed — sentiment calls the same NewsAPI and the key is already redacted.

2. **`NewsApiResponse` interface in `newsapi.ts` (line 7)** is unexported but is in the same file as `fetchSentimentArticles`. The new function can use it directly without any changes to the interface.

3. **`AGENT_NAMES` in the run route** — tasks.md states that `'sentiment'` is already present in the seed array. Confirm before merging by reading `src/app/api/portfolio/run/route.ts`. If it is missing, add `'sentiment'` to the `AGENT_NAMES` array there. This is a pre-flight check, not a code change in this slice.

4. **Parallel `Promise.all` growth** — the fan-out now has 4 concurrent Claude API calls. All four share the same `ANTHROPIC_API_KEY`. No rate-limit risk is expected for a small user base, but this is worth noting for future slices 7–9 which will add three more agents.

5. **Token budget** — the plan.md synthesizer token budget note estimates 7 agents × 500 tokens ≈ 3,500 tokens of agent output. Adding agent 4 brings the running total to 4 × ~500 = 2,000 tokens, still well within the 12,000-token synthesizer budget.

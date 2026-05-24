# Research: Portfolio Advisor Module

## Inngest Integration with Next.js App Router

**Decision**: Single serve route at `src/app/api/inngest/route.ts` using `serve()` from `inngest/next`. Fan-out within the orchestrator uses `Promise.all` wrapped in a `step.run()` call — not separate child functions — to keep all agent results in one execution context and simplify result aggregation.

**Pattern**:
```ts
// src/inngest/client.ts
import { Inngest } from 'inngest'
export const inngest = new Inngest({ id: 'sojourn' })

// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { portfolioAnalysis } from '@/inngest/portfolioAnalysis'
// ...
export const { GET, POST, PUT } = serve({ client: inngest, functions: [portfolioAnalysis, ...] })
```

**Fan-out pattern** (all 7 agents in parallel):
```ts
const agentResults = await step.run('run-agents', async () => {
  return Promise.all([
    runMacroAgent(portfolio, data),
    runFedAgent(portfolio, data),
    // ...
  ])
})
```

**Rationale**: `step.run` is retried as a unit on failure. Using `Promise.all` inside one step means the step either succeeds with all 7 results or retries entirely — no partial state. This is simpler than 7 separate Inngest functions with event coordination.

**Alternatives considered**: `step.invoke` for true child function fan-out — rejected because it requires each agent to be a named Inngest function, adds event routing boilerplate, and makes result collection more complex. The agents are fast enough (< 30s each) to run within a single step.

---

## Polygon.io Free Tier API

**Decision**: Use Polygon.io free tier for ticker autocomplete and as a data source for Technical Analysis and Sector Analysis agents.

**Ticker autocomplete endpoint**:
```
GET https://api.polygon.io/v3/reference/tickers
  ?search={query}&active=true&market=stocks&limit=10&apiKey={POLYGON_API_KEY}
```
Response: `{ results: [{ ticker, name, primary_exchange, ... }] }`

**Aggregate (OHLCV) data for agents**:
```
GET https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}
  ?adjusted=true&sort=desc&limit=30&apiKey={POLYGON_API_KEY}
```

**Rate limit**: 5 API calls/minute on free tier. **Mitigation**: fetch all Polygon data once at run start, cache in a `runData` object passed to all agents — not fetched per agent.

**Rationale**: Already the most practical free-tier source for US market data, ticker search, and basic fundamentals.

---

## FRED API (Federal Reserve Economic Data)

**Decision**: Use FRED for Macroeconomics and Fed & Interest Rates agents.

**Key series**:
- `GDP` — Gross Domestic Product (quarterly)
- `CPIAUCSL` — CPI (monthly)
- `UNRATE` — Unemployment rate (monthly)
- `FEDFUNDS` — Federal Funds Rate (monthly)
- `DGS10` — 10-Year Treasury Yield (daily)
- `T10YIE` — 10-Year Breakeven Inflation Rate
- `DCOILWTICO` — WTI Crude Oil Price

**Endpoint**:
```
GET https://api.stlouisfed.org/fred/series/observations
  ?series_id={SERIES}&limit=12&sort_order=desc&api_key={FRED_API_KEY}&file_type=json
```

**Authentication**: API key required but free. Register at fred.stlouisfed.org. No rate limit concerns for our usage (< 20 calls per run).

**Rationale**: FRED is the authoritative source for US macroeconomic indicators. Free, reliable, well-documented.

---

## NewsAPI

**Decision**: Use NewsAPI for Geopolitics and Sentiment/News agents.

**Endpoint**:
```
GET https://newsapi.org/v2/everything
  ?q={query}&language=en&sortBy=publishedAt&pageSize=10&apiKey={NEWS_API_KEY}
```

**Free tier limits**: 100 requests/day, articles up to 1 month old. Sufficient for 2 agents × 1 call per run.

**Query strategy**:
- Geopolitics agent: `q=geopolitics OR trade war OR sanctions OR election`
- Sentiment agent: `q=stock market OR S&P 500 OR investor sentiment OR earnings`

**Rationale**: NewsAPI provides recent news articles with titles, descriptions, and sources. Sufficient for headline-level geopolitics and sentiment signals without scraping.

---

## SEC EDGAR API

**Decision**: Use SEC EDGAR for Fundamentals/Earnings agent.

**Company facts endpoint** (no auth required):
```
GET https://data.sec.gov/api/xbrl/companyfacts/{CIK}.json
```

**Full-text search** (find recent 10-K/10-Q filings):
```
GET https://efts.sec.gov/LATEST/search-index?q={ticker}&dateRange=custom
  &startdt={90 days ago}&enddt={today}&forms=10-K,10-Q
```

**CIK lookup by ticker**:
```
GET https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company={ticker}&type=10-K&dateb=&owner=include&count=5&search_text=&output=atom
```

**Authentication**: None required. User-Agent header required by SEC: `User-Agent: Sojourn contact@sojourn.app`.

**Rationale**: Free, authoritative source for US public company earnings and filings. No API key needed.

**Limitation**: CIK resolution is needed to query company facts. Cache CIK lookups per ticker in run data to avoid repeated calls.

---

## Token Budget

**Agent outputs** (targeted 400–600 tokens each):
- 7 agents × 500 tokens avg = 3,500 tokens

**Portfolio context** (holdings + settings):
- ~30 holdings × ~10 tokens = ~300 tokens + settings ~50 tokens = ~350 tokens

**Historical summaries** (up to 5 × 250 tokens avg):
- ~1,250 tokens

**Synthesizer system prompt + instructions**:
- ~500 tokens

**Total synthesizer input**: ~5,600 tokens — well within the 12,000 token budget. Leaves ~6,400 tokens for synthesis output (target: 1,000–2,000 tokens for target allocation + rationale + action list).

**Haiku summarization** (per run): full recommendation input targeted at < 1,500 tokens, output at 200–300 tokens.

---

## Cooldown Enforcement

Manual run cooldown of 24 hours is enforced by comparing `portfolio_settings.last_run_at` against `now() - interval '24 hours'` server-side. The API returns `429` with a `Retry-After` header indicating seconds until cooldown expires.

---

## Investing.com

**Decision**: Dropped. No official API exists; scraping is fragile and violates ToS. Polygon.io free tier covers the same technical/fundamentals data needs for this use case.

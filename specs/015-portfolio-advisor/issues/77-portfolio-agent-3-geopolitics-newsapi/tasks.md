# Tasks: [Portfolio] Agent 3: Geopolitics (NewsAPI)

**Issue**: #77 | **Spec**: `specs/015-portfolio-advisor/spec.md` | **Plan**: `specs/015-portfolio-advisor/plan.md`

**Scope**: This tasks.md covers only issue #77. Adds the NewsAPI data source connector and the Geopolitics agent to the Inngest fan-out alongside the existing Macroeconomics and Fed Rates agents. No new DB tables, no new API routes, no UI changes — the `run_progress` row for `geopolitics` is already seeded by the run route from #75, and `RunProgress.tsx` already maps `geopolitics` to `'Geopolitics'`.

**New env var required**: `NEWS_API_KEY` — must be added to `.env.local` before testing locally and to Vercel project env vars before deploying.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- Exact file paths included in every task

---

## Phase 1: Foundational — NewsAPI Data Source

**Purpose**: Create the NewsAPI connector that the Geopolitics agent (and future Sentiment agent) will use. Must complete before T002 and T003.

**⚠️ CRITICAL**: T001 must complete before T002 and T003.

- [ ] T001 Create `src/inngest/dataSources/newsapi.ts` — new file (no existing file to modify):
  - Export `interface NewsArticle { title: string; description: string | null }`
  - Export `const GEOPOLITICS_QUERY = 'geopolitical tensions OR sanctions OR trade policy OR elections'`
  - Export `async function fetchGeopoliticsArticles(): Promise<NewsArticle[]>`:
    - Guard: if `!process.env.NEWS_API_KEY` return `[]` immediately (allows CI/build to pass without the key)
    - Build URL: `https://newsapi.org/v2/everything?q=${encodeURIComponent(GEOPOLITICS_QUERY)}&language=en&pageSize=10&sortBy=publishedAt&apiKey=${process.env.NEWS_API_KEY}`
    - `const res = await fetch(url)` — if `!res.ok` return `[]`
    - Parse `json.articles` (NewsAPI top-level field): `return (json.articles ?? []).map((a: { title: string; description?: string | null }) => ({ title: a.title, description: a.description ?? null }))`
    - Wrap entire function body in `try/catch` returning `[]` on error — **do not log `url` or `err.message` if it might contain the API key**
  - **Checkpoint**: `fetchGeopoliticsArticles()` is importable, returns `NewsArticle[]`, returns `[]` gracefully when the key is missing or the API returns non-200.

---

## Phase 2: User Story — Geopolitics Agent + Fan-out

**Goal**: A completed run stores a `geopolitics` entry in `recommendations.agent_outputs` with `analysis`, `confidence`, and `stance`. The `run_progress` row for `geopolitics` transitions `pending → running → complete`.

**Independent Test**: Trigger a run via `/portfolio/run`. In the Agent Progress panel, the `Geopolitics` row transitions Pending → Running → Complete. In Supabase, `recommendations.agent_outputs` contains a `geopolitics` key with `{ analysis, confidence, stance }`. `macroeconomics` and `fed_rates` keys are present and unaffected.

- [ ] T002 [P] [US1] Create `src/inngest/agents/geopolitics.ts` — new file, following the exact shape of `fedRates.ts`:
  - Import: `Anthropic` from `@anthropic-ai/sdk`, `z` from `zod`, `AgentOutput` from `@/types/database`, `fetchGeopoliticsArticles` from `@/inngest/dataSources/newsapi`
  - `const AgentOutputSchema = z.object({ analysis: z.string(), confidence: z.enum(['low', 'medium', 'high']), stance: z.enum(['bullish', 'bearish', 'neutral']) })`
  - Export `interface GeopoliticsAgentInput { risk_profile: string; target_return_pct: number; holdings_tickers: string[] }`
  - `const SYSTEM_PROMPT`: `'You are a geopolitical risk analyst specializing in the impact of global events on US equities. Analyze the news headlines provided and assess the implications for a US stock portfolio. Focus on: trade policy shifts (tariffs, sanctions, export controls), election outcomes and political transitions, regional conflicts and their supply chain / energy effects, and central bank coordination signals. Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: "analysis" (200–400 word string), "confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'`
  - Export `async function runGeopoliticsAgent(input: GeopoliticsAgentInput): Promise<AgentOutput>`:
    1. `const articles = await fetchGeopoliticsArticles()`
    2. Build `articleContent`: if `articles.length === 0`, use `'No recent geopolitical news articles found.'`; otherwise map each article to `- ${a.title}: ${a.description ?? 'No description.'}` and join with `'\n'`
    3. Build `portfolioContext`: same pattern as existing agents — `\nPortfolio context:\nRisk profile: ${input.risk_profile}\nTarget return: ${input.target_return_pct}%\nHoldings: ${input.holdings_tickers.join(', ')}`
    4. `const userContent = \`Recent geopolitical headlines:\n${articleContent}${portfolioContext}\``
    5. Call `claude-sonnet-4-6` with `max_tokens: 800`, `system: SYSTEM_PROMPT`, `messages: [{ role: 'user', content: userContent }]`
    6. Extract `text` from `response.content[0]` (guard `block.type === 'text'`)
    7. `try { const result = AgentOutputSchema.safeParse(JSON.parse(text)); return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' } } catch { return { analysis: text, confidence: 'low', stance: 'neutral' } }`

- [ ] T003 [US1] Update `src/inngest/portfolioAnalysis.ts` to add geopolitics to the parallel fan-out:
  1. **Import**: add `import { runGeopoliticsAgent } from '@/inngest/agents/geopolitics'` alongside the existing agent imports
  2. **`sanitizeErrorMessage`**: add `process.env.NEWS_API_KEY` to the `keys` array — change `[process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY]` to `[process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.NEWS_API_KEY]` so API keys in error messages are redacted
  3. **`mark-agents-running`** step: change `.in('agent_name', ['macroeconomics', 'fed_rates'])` → `.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics'])`
  4. **Parallel fan-out**: change `const [macroOutput, fedRatesOutput] = await Promise.all([...])` to `const [macroOutput, fedRatesOutput, geopoliticsOutput] = await Promise.all([..., step.run('run-geopolitics', async (): Promise<AgentOutput> => { try { return await runGeopoliticsAgent({ risk_profile: settings.risk_profile, target_return_pct: settings.target_return_pct, holdings_tickers: tickers }) } catch (err) { const errorMessage = sanitizeErrorMessage(err); const admin = createAdminClient(); await Promise.all([admin.from('run_progress').update({ status: 'error', error_message: errorMessage }).eq('run_id', run_id).eq('agent_name', 'geopolitics'), admin.from('recommendations').update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() }).eq('id', run_id)]); throw err } })])`
  5. **`store-outputs`** step:
     - Update `.in('agent_name', ['macroeconomics', 'fed_rates'])` → `.in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics'])`
     - Add `geopolitics: geopoliticsOutput` to the `agent_outputs` object: `{ macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput }`
  6. Keep `FetchPortfolioResult`, `EventDataSchema`, `fetch-portfolio` step completely unchanged

**Checkpoint**: All three agents appear in the Agent Progress panel and all complete. `recommendations.agent_outputs` has three keys. Build, test, and lint all pass.

---

## Dependencies & Execution Order

- **T001** → must complete before T002 and T003
- **T002** (agent file) can be started alongside T001 but imports `fetchGeopoliticsArticles` from T001 — verify T001 is done before running type-check
- **T003** (fan-out wiring) → final task; depends on T001 + T002

### Parallel Opportunities

- T001 and T002 can be drafted in parallel (T002 imports T001, but the file structure can be scaffolded first); simplest to do T001 → T002 → T003 sequentially given the small scope

---

## Implementation Notes

- **No new DB migration** — `run_progress` row for `geopolitics` is already seeded in `src/app/api/portfolio/run/route.ts` via `AGENT_NAMES` (from #75)
- **No UI changes** — `RunProgress.tsx` already maps `geopolitics` → `'Geopolitics'`
- **No new API routes** — all existing routes unchanged
- **Error isolation** — each agent's `step.run` has its own try/catch; a geopolitics error must not prevent macroeconomics or fed_rates from completing (Inngest retries each step independently)
- **NewsAPI free tier** — 100 requests/day; the connector is called once per run, so this limit is not a concern at expected usage
- **Empty articles handling** — when no articles are returned (API key missing, rate limit, network error), the agent still runs and returns a low-confidence neutral output rather than crashing the run. This satisfies the "handles empty results gracefully without crashing the run" acceptance criterion
- **`NEWS_API_KEY` env var** — add to `.env.local` for local testing; add to Vercel project env vars (Production + Preview) before deploying. Key is available at newsapi.org
- **API key security** — the `NEWS_API_KEY` is server-side only (not `NEXT_PUBLIC_`). The URL constructed in `newsapi.ts` contains the key in plaintext — never log `url` or unredacted error messages
- **Future re-use** — `newsapi.ts` will also be used by issue #78 (Sentiment agent); keep `GEOPOLITICS_QUERY` as a named export so the Sentiment agent can import its own query constant from the same file

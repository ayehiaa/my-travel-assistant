# Architect Notes — [Portfolio] Agent 3: Geopolitics (NewsAPI)

## Backend Tasks

### T001 — Create `/workspaces/my-travel-assistant/src/inngest/dataSources/newsapi.ts` (new file)

Implement the NewsAPI connector following the same shape as `/workspaces/my-travel-assistant/src/inngest/dataSources/fred.ts`.

- Export `interface NewsArticle { title: string; description: string | null }`
- Export `const GEOPOLITICS_QUERY = 'geopolitical tensions OR sanctions OR trade policy OR elections'` as a named constant so the future Sentiment agent (issue #78) can import its own query from the same file without hardcoding
- Export `async function fetchGeopoliticsArticles(): Promise<NewsArticle[]>`:
  - First guard: `if (!process.env.NEWS_API_KEY) return []` — allows `npm run build` and `npm test` to pass in CI without the key
  - Build URL: `https://newsapi.org/v2/everything?q=${encodeURIComponent(GEOPOLITICS_QUERY)}&language=en&pageSize=10&sortBy=publishedAt&apiKey=${process.env.NEWS_API_KEY}`
  - `const res = await fetch(url)` — if `!res.ok` return `[]`
  - Type the raw API response as a local interface `NewsApiResponse { articles: Array<{ title: string; description?: string | null }> }` and cast via `as NewsApiResponse` (same approach as `FredApiResponse` in fred.ts)
  - Map: `return (json.articles ?? []).map(a => ({ title: a.title, description: a.description ?? null }))`
  - Wrap the entire function body (excluding the env-key guard) in `try/catch` returning `[]` — **never log `url` or the raw error message** because both may contain `NEWS_API_KEY` in plaintext (same security comment pattern used in fred.ts)
- Co-located test file `/workspaces/my-travel-assistant/src/inngest/dataSources/newsapi.test.ts` (see Test Tasks below)

### T002 — Create `/workspaces/my-travel-assistant/src/inngest/agents/geopolitics.ts` (new file)

Implement the agent following the exact structure of `/workspaces/my-travel-assistant/src/inngest/agents/fedRates.ts`.

- Imports: `Anthropic` from `@anthropic-ai/sdk`, `z` from `zod`, `AgentOutput` from `@/types/database`, `fetchGeopoliticsArticles` from `@/inngest/dataSources/newsapi`
- `const AgentOutputSchema = z.object({ analysis: z.string(), confidence: z.enum(['low', 'medium', 'high']), stance: z.enum(['bullish', 'bearish', 'neutral']) })`
- Export `interface GeopoliticsAgentInput { risk_profile: string; target_return_pct: number; holdings_tickers: string[] }`
- `const SYSTEM_PROMPT`: geopolitical risk analyst persona focused on trade policy shifts, elections, regional conflicts and supply chain effects, and central bank coordination signals. Must end with the standard instruction: `Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: "analysis" (200–400 word string), "confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").`
- Export `async function runGeopoliticsAgent(input: GeopoliticsAgentInput): Promise<AgentOutput>`:
  1. `const articles = await fetchGeopoliticsArticles()`
  2. Build `articleContent`: if `articles.length === 0` use the literal string `'No recent geopolitical news articles found.'`; otherwise map each article to `- ${a.title}: ${a.description ?? 'No description.'}` joined with `'\n'`
  3. Build `portfolioContext` using the same template as macroeconomics.ts and fedRates.ts
  4. `const userContent = \`Recent geopolitical headlines:\n${articleContent}${portfolioContext}\``
  5. Instantiate `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` and call `client.messages.create` with `model: 'claude-sonnet-4-6'`, `max_tokens: 800`, `system: SYSTEM_PROMPT`, `messages: [{ role: 'user', content: userContent }]`
  6. Extract `text` from `response.content[0]` with the `block.type === 'text'` guard (same pattern as fedRates.ts)
  7. `try { const result = AgentOutputSchema.safeParse(JSON.parse(text)); return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' } } catch { return { analysis: text, confidence: 'low', stance: 'neutral' } }`

The empty-articles path (step 2) ensures the agent always produces output and never throws when NewsAPI returns nothing, satisfying the acceptance criterion about graceful empty-result handling.

### T003 — Modify `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`

Four targeted edits — do not touch `EventDataSchema`, `FetchPortfolioResult`, or the `fetch-portfolio` step.

1. **Add import** at the top alongside the existing agent imports:
   ```ts
   import { runGeopoliticsAgent } from '@/inngest/agents/geopolitics'
   ```

2. **Extend `sanitizeErrorMessage`** — add `NEWS_API_KEY` to the keys array so the URL-embedded key is never surfaced in error messages stored to the DB:
   ```ts
   const keys = [process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.NEWS_API_KEY].filter(Boolean) as string[]
   ```

3. **`mark-agents-running` step** — extend the `in` filter:
   ```ts
   .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics'])
   ```

4. **Parallel fan-out** — destructure three outputs and add the third `step.run` call inside `Promise.all`. The new step must follow the same try/catch error-isolation pattern as the existing two steps: on error, update `run_progress` for `geopolitics` to `error` and update `recommendations` to `error`, then re-throw:
   ```ts
   const [macroOutput, fedRatesOutput, geopoliticsOutput] = await Promise.all([
     // existing run-macroeconomics step (unchanged)
     // existing run-fed-rates step (unchanged)
     step.run('run-geopolitics', async (): Promise<AgentOutput> => {
       try {
         return await runGeopoliticsAgent({
           risk_profile:      settings.risk_profile,
           target_return_pct: settings.target_return_pct,
           holdings_tickers:  tickers,
         })
       } catch (err) {
         const errorMessage = sanitizeErrorMessage(err)
         const admin = createAdminClient()
         await Promise.all([
           admin.from('run_progress').update({ status: 'error', error_message: errorMessage }).eq('run_id', run_id).eq('agent_name', 'geopolitics'),
           admin.from('recommendations').update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() }).eq('id', run_id),
         ])
         throw err
       }
     }),
   ])
   ```

5. **`store-outputs` step** — extend both the `in` filter and the `agent_outputs` object:
   ```ts
   .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics'])
   // ...
   agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, geopolitics: geopoliticsOutput },
   ```

## Frontend Tasks

None — this slice is backend-only.

The `run_progress` seeding row for `geopolitics` is already present in `/workspaces/my-travel-assistant/src/app/api/portfolio/run/route.ts` (AGENT_NAMES array from issue #75). The `RunProgress.tsx` label mapping `geopolitics` → `'Geopolitics'` is already in place at `/workspaces/my-travel-assistant/src/components/portfolio/RunProgress.tsx`. No UI changes are required.

## Migration SQL (if any)

None. The `run_progress` row for `geopolitics` is already seeded at runtime by the existing `POST /api/portfolio/run` route. No new tables or columns are needed.

## Conflicts / Risks

1. **`sanitizeErrorMessage` keys array** — the current implementation in portfolioAnalysis.ts only redacts `FRED_API_KEY` and `ANTHROPIC_API_KEY`. Without adding `NEWS_API_KEY` in T003 step 2, any network error returned by NewsAPI that echoes the URL could store the raw API key into `recommendations.error_message` or `run_progress.error_message` in the database. T003 must include this change.

2. **NewsAPI free-tier rate limit** — the free tier allows 100 requests/day. The connector is called once per run, so this is not a concern at expected usage volumes, but it is a risk if the run route is spammed. The existing 24-hour cooldown in `POST /api/portfolio/run` (checked against `last_run_at`) acts as a natural rate limiter per user.

3. **`NEWS_API_KEY` env var** — must be added to Vercel project environment variables (Production and Preview) before deployment. The env-key guard at the top of `fetchGeopoliticsArticles` ensures the build and tests pass without the key, so CI will not break, but any deployed run without the key will silently produce a low-confidence neutral geopolitics output.

4. **Type safety on `agent_outputs`** — `Recommendation.agent_outputs` is typed as `Record<string, AgentOutput> | null` in `/workspaces/my-travel-assistant/src/types/database.ts`. This is permissive enough to accept any string key, so adding `geopolitics` requires no type changes. However, if a future PR tightens this to a discriminated type listing allowed keys, `geopolitics` must be included at that point.

5. **Inngest step isolation** — each agent step has its own try/catch. A geopolitics failure must not prevent macroeconomics or fed_rates from completing. The existing fan-out pattern handles this correctly because `Promise.all` in Inngest executes steps independently. The re-throw after the error DB writes causes only the geopolitics step to be retried, not the whole function.

6. **Future Sentiment agent (issue #78)** — `GEOPOLITICS_QUERY` is exported from `newsapi.ts` as a named constant. The Sentiment agent should export its own query constant from the same file rather than duplicating the fetch function. This is a forward-compatibility concern, not a blocker for this issue.

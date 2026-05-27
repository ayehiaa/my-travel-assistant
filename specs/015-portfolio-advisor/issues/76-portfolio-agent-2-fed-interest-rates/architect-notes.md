# Architect Notes — [Portfolio] Agent 2: Fed & Interest Rates

## Backend Tasks

### T001 — Extend `src/inngest/dataSources/fred.ts`

**The `fetchOneSeries` visibility problem**: `fetchOneSeries` is currently a private `async function` declaration. The cleanest fix is to export it directly — this avoids duplicating the fetch URL-building and error-handling logic, which is the real risk in a "duplicate" approach. The `fetchFredData()` naming convention already implies series-group specificity, so exporting `fetchOneSeries` as a named export does not pollute the public surface in a harmful way. Do NOT rename or modify the existing exports (`FRED_SERIES_CONFIG`, `FredSeries`, `fetchFredData`) — macroeconomics.ts imports `fetchFredData` and must be unaffected.

**Exact diff for `fred.ts`**:

Change:
```ts
async function fetchOneSeries(config: FredSeriesConfig): Promise<FredSeries> {
```
To:
```ts
export async function fetchOneSeries(config: FredSeriesConfig): Promise<FredSeries> {
```

Then append after the closing brace of `fetchFredData`:
```ts
export const FED_RATES_SERIES_CONFIG: FredSeriesConfig[] = [
  { id: 'FEDFUNDS', title: 'Federal Funds Effective Rate',         unit: 'Percent' },
  { id: 'FEDTARMD', title: 'Fed Funds Target Rate - Upper Limit',  unit: 'Percent' },
  { id: 'DGS2',     title: '2-Year Treasury Yield',                unit: 'Percent' },
  { id: 'DGS30',    title: '30-Year Treasury Yield',               unit: 'Percent' },
]

export async function fetchFedRatesData(): Promise<FredSeries[]> {
  return Promise.all(FED_RATES_SERIES_CONFIG.map(fetchOneSeries))
}
```

Note: `FredSeriesConfig` is currently a non-exported `interface`. It does not need to be exported for this task — both config arrays live in the same file. If a future agent needs to extend it from outside the file, export it then.

**Checkpoint**: `fetchFedRatesData` is importable and returns 4 `FredSeries` objects. `fetchFredData` still resolves 5 series unchanged.

---

### T002 — Create `src/inngest/agents/fedRates.ts`

This file follows the `macroeconomics.ts` pattern exactly. The only differences are: the import (`fetchFedRatesData` instead of `fetchFredData`), the input interface name, the system prompt content, and the function name.

**Complete file**:
```ts
import Anthropic from '@anthropic-ai/sdk'
import type { AgentOutput } from '@/types/database'
import { fetchFedRatesData } from '@/inngest/dataSources/fred'

export interface FedRatesAgentInput {
  risk_profile: string
  target_return_pct: number
  holdings_tickers: string[]
}

const SYSTEM_PROMPT =
  'You are a fixed income and monetary policy analyst specializing in US interest rate dynamics. ' +
  'Analyze the Federal Reserve interest rate data provided and assess the implications ' +
  'for a US stock portfolio. Focus on: current rate trajectory (hiking / cutting / pausing cycle), ' +
  'yield curve shape derived from the 2-year vs 10-year vs 30-year spread (normal / flat / inverted), ' +
  'real vs nominal rates (compare FEDFUNDS to breakeven inflation if available), ' +
  'and any forward guidance signals embedded in the spread between the Fed target rate and the effective rate. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runFedRatesAgent(input: FedRatesAgentInput): Promise<AgentOutput> {
  const seriesData = await fetchFedRatesData()

  const indicatorLines = seriesData
    .map(s => `${s.title} (${s.unit}): latest ${s.latest_value !== null ? s.latest_value : 'N/A'}`)
    .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}%\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Interest rate indicators:\n${indicatorLines}${portfolioContext}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userContent }],
  })

  const block = response.content[0]
  const text = block.type === 'text' ? block.text : ''

  try {
    const parsed = JSON.parse(text) as AgentOutput
    return parsed
  } catch {
    return { analysis: text, confidence: 'low', stance: 'neutral' }
  }
}
```

Note on the system prompt: the data sent does NOT include DGS10 (that lives in the macroeconomics agent's FRED config). The prompt mentions yield curve shape derived from 2Y vs 30Y — the model should infer the shape from those two data points. If DGS10 is needed for a more complete curve, it would have to be added to `FED_RATES_SERIES_CONFIG`; however that is not in scope for this issue and would duplicate a series already fetched by the macroeconomics agent. Leave it out for now and note this as a future enhancement.

---

### T003 — Update `src/inngest/portfolioAnalysis.ts`

Four changes are required. The `fetch-portfolio` step (Step 1) and all surrounding scaffolding (`EventDataSchema`, `sanitizeErrorMessage`, `FetchPortfolioResult`, `PortfolioHoldingRow`, the function registration) are untouched.

**Change 1 — Add import at top of file**:
```ts
import { runFedRatesAgent } from '@/inngest/agents/fedRates'
```

**Change 2 — Replace Step 2 (`mark-macro-running`) with a combined status update**:

Before:
```ts
// Step 2: Mark macroeconomics agent as running
await step.run('mark-macro-running', async (): Promise<void> => {
  const admin = createAdminClient()
  await admin
    .from('run_progress')
    .update({ status: 'running' })
    .eq('run_id', run_id)
    .eq('agent_name', 'macroeconomics')
})
```

After:
```ts
// Step 2: Mark both agents as running
await step.run('mark-agents-running', async (): Promise<void> => {
  const admin = createAdminClient()
  await admin
    .from('run_progress')
    .update({ status: 'running' })
    .eq('run_id', run_id)
    .in('agent_name', ['macroeconomics', 'fed_rates'])
})
```

**Change 3 — Replace Step 3 (sequential `run-macroeconomics`) with a parallel fan-out**:

Before:
```ts
// Step 3: Run macroeconomics agent
const macroOutput = await step.run(
  'run-macroeconomics',
  async (): Promise<AgentOutput> => {
    try {
      return await runMacroeconomicsAgent({
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
          .eq('agent_name', 'macroeconomics'),
        admin
          .from('recommendations')
          .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
          .eq('id', run_id),
      ])

      throw err
    }
  },
)
```

After:
```ts
// Step 3: Run macroeconomics and fed rates agents in parallel
const [macroOutput, fedRatesOutput] = await Promise.all([
  step.run('run-macroeconomics', async (): Promise<AgentOutput> => {
    try {
      return await runMacroeconomicsAgent({
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
          .eq('agent_name', 'macroeconomics'),
        admin
          .from('recommendations')
          .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
          .eq('id', run_id),
      ])

      throw err
    }
  }),

  step.run('run-fed-rates', async (): Promise<AgentOutput> => {
    try {
      return await runFedRatesAgent({
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
          .eq('agent_name', 'fed_rates'),
        admin
          .from('recommendations')
          .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
          .eq('id', run_id),
      ])

      throw err
    }
  }),
])
```

**Change 4 — Update `store-outputs` step (Step 4)**:

Before:
```ts
// Step 4: Store outputs
await step.run('store-outputs', async (): Promise<void> => {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  await Promise.all([
    admin
      .from('run_progress')
      .update({ status: 'complete', completed_at: now })
      .eq('run_id', run_id)
      .eq('agent_name', 'macroeconomics'),
    admin
      .from('recommendations')
      .update({
        agent_outputs:      { macroeconomics: macroOutput },
        portfolio_snapshot: snapshot,
        status:             'complete',
        updated_at:         now,
      })
      .eq('id', run_id),
  ])
})
```

After:
```ts
// Step 4: Store outputs
await step.run('store-outputs', async (): Promise<void> => {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  await Promise.all([
    admin
      .from('run_progress')
      .update({ status: 'complete', completed_at: now })
      .eq('run_id', run_id)
      .in('agent_name', ['macroeconomics', 'fed_rates']),
    admin
      .from('recommendations')
      .update({
        agent_outputs:      { macroeconomics: macroOutput, fed_rates: fedRatesOutput },
        portfolio_snapshot: snapshot,
        status:             'complete',
        updated_at:         now,
      })
      .eq('id', run_id),
  ])
})
```

---

## Frontend Tasks

None — all work for this issue is backend only.

The `run_progress` rows for `fed_rates` are already seeded by `src/app/api/portfolio/run/route.ts` (the `AGENT_NAMES` constant already includes `'fed_rates'`). The `RunProgress.tsx` component already maps `fed_rates` to the label `'Fed & Rates'`. No UI files require changes.

---

## Migration SQL

None — no DB changes in this issue.

The `run_progress` and `recommendations` tables already have the schema needed. The `fed_rates` agent name is already seeded into `run_progress` at run-trigger time by the existing API route.

---

## Conflicts / Risks

**Risk 1 — Inngest v4.4.0 `Promise.all` parallel step behaviour (HIGH, requires verification)**

Inngest's step model works by replaying the function from scratch on each step completion. When two `step.run()` calls are wrapped in `Promise.all`, Inngest v3+ supports this pattern as parallel fan-out — both steps are scheduled in the same execution plan and each is independently retried. However, this behaviour must be confirmed against the specific installed version (^4.4.0).

The documented pattern from Inngest's parallel steps documentation is:
```ts
const [a, b] = await Promise.all([step.run('a', fn), step.run('b', fn)])
```
This is the canonical fan-out form and is supported from Inngest v3.0.0 onwards. v4.4.0 is well within this window. The risk is LOW in practice, but the implementer should verify with a local Inngest dev server (`npx inngest-cli@latest dev`) that both steps appear as parallel branches in the function graph, not sequential.

**Risk 2 — `recommendations` error state race condition (MEDIUM)**

Both agent error handlers write `status: 'error'` to the `recommendations` row. If both agents fail simultaneously, both will attempt to write to the same row. Because both writes are identical (`status: 'error'`, sanitized error message), this is idempotent in effect but not in timing — the last write wins for `error_message`. This is acceptable for the current single-row pattern: the run is already failed, and which agent's error message surfaces is not critical. Do not add locking or conditional logic here — it would introduce complexity that is disproportionate to the risk.

**Risk 3 — `store-outputs` writes `status: 'complete'` even when one agent errored (LOW)**

If `run-macroeconomics` succeeds but `run-fed-rates` throws, the `Promise.all` at the fan-out level will reject before reaching `store-outputs`. Inngest will mark the function run as failed and retry the entire function from the last completed step checkpoint (`mark-agents-running`). On retry, Inngest will skip `run-macroeconomics` (it already has a result for that step ID) and re-run only `run-fed-rates`. This is the correct behaviour — no special handling is needed. The `store-outputs` step only executes after both steps resolve successfully.

**Risk 4 — `FredSeriesConfig` type is unexported (LOW)**

`FredSeriesConfig` is a private `interface` in `fred.ts`. The new `FED_RATES_SERIES_CONFIG` array lives in the same file, so it does not need the type exported. TypeScript will infer the array element type from the literal. No change to `FredSeriesConfig` visibility is needed for this issue.

**Risk 5 — DGS10 absent from fed_rates series (LOW, accepted)**

The yield curve prompt mentions 2Y vs 10Y vs 30Y spread, but `DGS10` is only in the macroeconomics agent's config. The fed_rates agent receives only FEDFUNDS, FEDTARMD, DGS2, and DGS30. The system prompt in T002 above has been written to reference only data the agent will actually receive (2Y vs 30Y spread). The implementer must not copy the prompt verbatim from tasks.md without adjusting the "2-year vs 10-year vs 30-year" language — the notes above already reflect the corrected wording.

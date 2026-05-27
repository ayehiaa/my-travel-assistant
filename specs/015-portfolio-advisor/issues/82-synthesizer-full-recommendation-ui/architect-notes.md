# Architect Notes — Synthesizer + Full Recommendation UI (#82)

## Backend Tasks

### T001 — Add `computeActionList` to `src/lib/portfolioCalculator.ts`

**Action**: modify (append named export to existing file)

**Implementation details**:
- All required types (`ActionItem`, `TargetAllocationItem`) already exist in `src/types/database.ts` — import from `@/types/database`
- Function signature:
  ```ts
  export function computeActionList(
    holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>,
    cash_usd: number,
    targetAllocation: Array<{ ticker: string; target_pct: number }>
  ): ActionItem[]
  ```
- Algorithm:
  1. Compute `grand_total = holdings.reduce((s, h) => s + h.total_value_usd, 0) + cash_usd`
  2. Build union of all tickers from both `holdings` and `targetAllocation` (use a `Set`)
  3. For each ticker in the union set:
     - `current_usd` = holding's `total_value_usd`, or `0` if ticker absent from holdings
     - `target_pct` = allocation's `target_pct`, or `0` if ticker absent from targetAllocation
     - `target_usd` = `(target_pct / 100) * grand_total`
     - `delta_usd` = `target_usd - current_usd`
     - `action`: `'buy'` if `delta_usd > 0`, `'sell'` if `delta_usd < 0`, `'hold'` if `delta_usd === 0`
     - `current_pct` = `grand_total > 0 ? Math.round((current_usd / grand_total) * 10000) / 100 : 0`
- Return the resulting `ActionItem[]`
- No network calls — pure deterministic function, safe for Vitest

---

### T002 — Add unit tests to `src/lib/portfolioCalculator.test.ts`

**Action**: modify (append new `describe` block)

**Implementation details**:
- Import `computeActionList` alongside existing imports
- Test cases required:
  - `delta > 0` produces `action: 'buy'`
  - `delta < 0` produces `action: 'sell'`
  - `delta === 0` produces `action: 'hold'`
  - Correct `current_usd`, `target_usd`, `delta_usd` with multiple holdings + cash
  - Allocation that sums to 100% produces balanced action list (total buys ≈ total sells when cash = 0)
  - Ticker present in `targetAllocation` but absent from `holdings` → included with `current_usd: 0` and `action: 'buy'`
  - Ticker present in `holdings` but absent from `targetAllocation` → included with `target_pct: 0`, `target_usd: 0`, and `action: 'sell'`
  - `grand_total = 0` edge case → all `current_pct: 0`, all `target_usd: 0`

---

### T003 — Create `src/inngest/synthesizer.ts`

**Action**: create

**Implementation details**:
- Imports: `Anthropic` from `@anthropic-ai/sdk`; `z` from `zod`; `AgentOutput`, `PortfolioSnapshot`, `PortfolioSettings`, `TargetAllocationItem` from `@/types/database`
- Export the types used by the orchestrator:
  ```ts
  export interface SynthesizerParams {
    agentOutputs: Record<string, AgentOutput>
    snapshot: PortfolioSnapshot
    settings: PortfolioSettings
    recentSummaries: string[]  // may be empty — handle gracefully
  }

  export interface SynthesizerOutput {
    target_allocation: TargetAllocationItem[]
    summary_text: string
    conflict_notes: string
  }
  ```
- Zod schema for the expected LLM JSON:
  ```ts
  const SynthesisSchema = z.object({
    target_allocation: z.array(z.object({
      ticker:     z.string(),
      target_pct: z.number(),
      rationale:  z.string(),
    })).refine(
      items => { const sum = items.reduce((s, i) => s + i.target_pct, 0); return sum >= 99.5 && sum <= 100.5 },
      { message: 'Allocation must sum to 100%' }
    ),
    summary_text:   z.string(),
    conflict_notes: z.string(),
  })
  ```
- System prompt order: (1) role + instruction to return raw JSON only; (2) risk profile + target return from `settings`; (3) portfolio snapshot (tickers + values + `cash_usd`); (4) output format instructions specifying the three JSON keys
- User prompt order: (1) prepend up to 5 recent summaries as `[PAST CONTEXT]\n${summary}\n` blocks — skip section entirely when `recentSummaries` is empty; (2) each agent formatted as `[AGENT: ${agentKey}]\nStance: ${output.stance} | Confidence: ${output.confidence}\nAnalysis: ${output.analysis}`
- Single `claude-sonnet-4-6` call with `max_tokens: 1200`
- Parse: `JSON.parse(text)` then `SynthesisSchema.parse(parsed)` — let Zod throw on failure (caller catches in T004)
- Export as `export async function runSynthesizer(params: SynthesizerParams): Promise<SynthesizerOutput>`
- Pattern to follow: `src/inngest/agents/macroeconomics.ts` — same SDK usage, same `Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` construction

---

### T004 — Update `src/inngest/portfolioAnalysis.ts`

**Action**: modify

**CRITICAL change 1 — remove `status: 'complete'` from `store-outputs` step (lines 332–347)**:

The existing `store-outputs` step at lines 320–348 currently updates `recommendations` with `status: 'complete'`. This must be changed so `store-outputs` only stores the agent data. The corrected update object should be:
```ts
{
  agent_outputs: { macroeconomics: macroOutput, fed_rates: fedRatesOutput, ... },
  portfolio_snapshot: snapshot,
  updated_at: now,
  // NO status field here
}
```
Without this change, a subsequent synthesizer failure would leave the row incorrectly marked `complete`.

**Change 2 — add imports** at the top of the file:
```ts
import { runSynthesizer } from '@/inngest/synthesizer'
import { computeActionList } from '@/lib/portfolioCalculator'
```

**Change 3 — add `fetch-summaries` step** immediately after `store-outputs`:
```ts
const recentSummaries = await step.run('fetch-summaries', async (): Promise<string[]> => {
  const admin = createAdminClient()
  const { data } = await admin
    .from('recommendation_summaries')
    .select('summary_text')
    .eq('user_id', user_id)      // NOTE: requires joining via recommendations — see conflict note below
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []).map(r => r.summary_text)
})
```
**CONFLICT NOTE**: `recommendation_summaries` has no `user_id` column — it links via `recommendation_id` to `recommendations`. The query must join: either use a DB view/RPC, or query `recommendations` first for the user's IDs then filter summaries by those IDs. The simplest safe approach: fetch the user's last 5 recommendation IDs first, then fetch their summaries. Alternatively, use the admin client with a subquery pattern via PostgREST embedded select. Recommend: two sequential admin queries — first `select('id').from('recommendations').eq('user_id', user_id).order('run_at', {ascending: false}).limit(5)`, then `select('summary_text').from('recommendation_summaries').in('recommendation_id', ids).order('created_at', {ascending: false})`. If no IDs returned, skip second query and return `[]`.

**Change 4 — add `synthesize` step** immediately after `fetch-summaries`:
```ts
await step.run('synthesize', async (): Promise<void> => {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  try {
    const agentOutputs = {
      macroeconomics: macroOutput, fed_rates: fedRatesOutput,
      geopolitics: geopoliticsOutput, sentiment: sentimentOutput,
      fundamentals: fundamentalsOutput, technical_analysis: technicalOutput,
      sector_analysis: sectorOutput,
    }
    const synthResult = await runSynthesizer({
      agentOutputs, snapshot, settings, recentSummaries,
    })
    const actionList = computeActionList(
      snapshot.holdings, snapshot.cash_usd, synthResult.target_allocation
    )
    await admin.from('recommendations').update({
      target_allocation:  synthResult.target_allocation,
      action_list:        actionList,
      summary_text:       synthResult.summary_text,
      conflict_notes:     synthResult.conflict_notes,
      status:             'complete',
      updated_at:         now,
    }).eq('id', run_id)
    await inngest.send({ name: 'portfolio/run.completed', data: { run_id, user_id } })
  } catch (err) {
    await admin.from('recommendations').update({
      status:        'error',
      error_message: sanitizeErrorMessage(err),
      updated_at:    now,
    }).eq('id', run_id)
    throw err
  }
})
```
- `sanitizeErrorMessage` is already defined in `portfolioAnalysis.ts` at line 19 — use it directly (same file scope)
- `inngest.send` is available via the `inngest` import already at the top of the file

---

### T005 — Create `src/app/api/portfolio/recommendations/[id]/route.ts`

**Action**: create (new nested directory `recommendations/[id]/` inside existing `src/app/api/portfolio/`)

**Implementation details**:
- `getAuthUser()` returns `AuthUser | null` where `AuthUser = { id, email, role, displayName }` — use `user.id` and `user.role`
- No separate `supabase.auth.getUser()` call needed — `getAuthUser()` internally calls `createClient()` and `supabase.auth.getUser()`; just call `getAuthUser()` once
- However, a separate `createClient()` call is still needed for the recommendations query (to use the cookie-scoped client)
- Handler structure:
  ```ts
  export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const { id } = await params  // Next.js 16: params is a Promise
    const idParse = z.string().uuid().safeParse(id)
    if (!idParse.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const authUser = await getAuthUser()
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (authUser.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()
    const { data } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', id)
      .eq('user_id', authUser.id)
      .single()

    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ recommendation: data })
  }
  ```
- No `logAudit()` — read-only route
- Import: `getAuthUser` from `@/lib/auth`; `createClient` from `@/lib/supabase/server`; `z` from `zod`; `NextRequest`, `NextResponse` from `next/server`

---

## Frontend Tasks

### T006 — Create `src/components/portfolio/ActionList.tsx`

**Action**: create

**Implementation details**:
- The tasks.md marks this `'use client'` but there is no interactivity — it is a pure display table. It CAN be a server component. However, `RecommendationDetail` (T008) is also a server component and will import it. Keep it as a server component (no `'use client'` directive) unless T008 needs to pass it a client-only prop.
- Props: `{ actionList: ActionItem[] }`
- Import `ActionItem` from `@/types/database`; `formatUsd` from `@/lib/portfolioCalculator`
- Table columns: Ticker | Action | Current % | Target % | Current $ | Target $ | Delta $
- Action chip implementation (Tailwind classes, no inline styles to match project conventions, but note existing components use inline styles — follow the existing `PortfolioOverview.tsx` inline style pattern for consistency):
  - `buy`: green background, e.g. `background: '#dcfce7', color: '#16a34a'`
  - `sell`: red background, e.g. `background: '#fee2e2', color: '#dc2626'`
  - `hold`: gray background, e.g. `background: '#f3f4f6', color: '#6b7280'`
- Delta $ cell: positive value = green text (`color: '#16a34a'`), negative = red text (`color: '#dc2626'`), zero = default ink
- `%` values: `{value.toFixed(2)}%`
- `$` values: `{formatUsd(value)}`
- Empty state: render a `<p>` "No actions" when `actionList.length === 0`

---

### T007 — Create `src/components/portfolio/AgentBreakdown.tsx`

**Action**: create

**Implementation details**:
- Server component (no `'use client'` — `<details>/<summary>` is native HTML with no JS state needed)
- Props: `{ agentOutputs: Record<string, AgentOutput> }`
- Import `AgentOutput` from `@/types/database`
- Agent display name map (define as a `const` inside the file):
  ```ts
  const AGENT_DISPLAY_NAMES: Record<string, string> = {
    macroeconomics:    'Macroeconomics',
    fed_rates:         'Fed & Interest Rates',
    geopolitics:       'Geopolitics',
    sentiment:         'Sentiment / News',
    fundamentals:      'Fundamentals & Earnings',
    technical_analysis:'Technical Analysis',
    sector_analysis:   'Sector Analysis',
  }
  ```
- Render exactly 7 agents in the above order (use `Object.keys(AGENT_DISPLAY_NAMES)` to iterate, not `Object.entries(agentOutputs)`, so order is deterministic and missing agents degrade gracefully)
- Each `<details>` element:
  - `<summary>`: display name + stance badge + confidence badge
  - Body: `<p>` with `output.analysis` text
  - Skip rendering (or show placeholder) when the agent key is absent from `agentOutputs`
- Badge colours (inline style, consistent with existing component patterns):
  - Stance: `bullish` → green (`#dcfce7`/`#16a34a`); `bearish` → red (`#fee2e2`/`#dc2626`); `neutral` → gray (`#f3f4f6`/`#6b7280`)
  - Confidence: `low` → yellow (`#fef9c3`/`#ca8a04`); `medium` → blue (`#dbeafe`/`#2563eb`); `high` → green (`#dcfce7`/`#16a34a`)

---

### T008 — Create `src/components/portfolio/RecommendationDetail.tsx`

**Action**: create

**Implementation details**:
- Server component (no `'use client'`)
- Props: `{ recommendation: Recommendation }`
- Import `Recommendation` from `@/types/database`; `ActionList` from `./ActionList`; `AgentBreakdown` from `./AgentBreakdown`
- Define at module level:
  ```ts
  const DISCLAIMER_TEXT =
    'This analysis is generated by AI and is for informational purposes only. ' +
    'It does not constitute regulated financial advice. ' +
    'Always consult a qualified financial adviser before making investment decisions.'
  ```
- Layout order (top to bottom):
  1. Disclaimer banner — amber/yellow `<div>` styled as a warning panel; always rendered; text = `DISCLAIMER_TEXT`
  2. Summary paragraph — `<p>` with `recommendation.summary_text`; show placeholder "Summary not available." when null
  3. Action list section — heading "Recommended Actions" + `<ActionList actionList={recommendation.action_list ?? []} />`
  4. Agent breakdown section — heading "Agent Analysis" + `<AgentBreakdown agentOutputs={recommendation.agent_outputs ?? {}} />`
  5. Conflict notes section — render `<section>` with heading "Agent Disagreements" only when `recommendation.conflict_notes` is truthy (non-empty, non-null)

---

### T009 — Create `src/app/portfolio/recommendations/[id]/page.tsx`

**Action**: create (new nested directory `recommendations/[id]/` inside existing `src/app/portfolio/`)

**Implementation details**:
- `params` is a Promise in Next.js 16 — must `await params` before accessing `.id`
- `getAuthUser()` returns `AuthUser | null` (confirmed from `src/lib/auth.ts`) — check `authUser.role`
- Pattern follows `src/app/portfolio/page.tsx` closely (same auth + role check pattern)
- Structure:
  ```ts
  export const metadata = { title: 'Sojourn — Portfolio Recommendation' }

  export default async function RecommendationDetailPage({
    params,
  }: {
    params: Promise<{ id: string }>
  }) {
    const { id } = await params

    const authUser = await getAuthUser()
    if (!authUser) redirect('/login')
    if (authUser.role !== 'premium_plus') redirect('/')

    const supabase = await createClient()
    const { data: rec } = await supabase
      .from('recommendations')
      .select('*')
      .eq('id', id)
      .eq('user_id', authUser.id)
      .single()

    if (!rec) redirect('/portfolio')

    return <RecommendationDetail recommendation={rec as Recommendation} />
  }
  ```
- Import: `getAuthUser` from `@/lib/auth`; `createClient` from `@/lib/supabase/server`; `redirect` from `next/navigation`; `RecommendationDetail` from `@/components/portfolio/RecommendationDetail`; `Recommendation` from `@/types/database`
- No skeleton needed — SSR page blocks until data is available; redirect handles not-found
- Note: `export const metadata` is a static export — use `generateMetadata` instead if title needs to be dynamic, but static is sufficient per spec

---

### T010 — Update `src/app/portfolio/page.tsx`

**Action**: modify

**Implementation details**:
- The existing `Promise.all` at line 29 fetches `[holdingsRes, settingsRes]`
- Add a third element to the destructured array and to the `Promise.all` call:
  ```ts
  const [holdingsRes, settingsRes, recRes] = await Promise.all([
    supabase.from('portfolio_holdings').select('*').eq('user_id', user.id).order('total_value_usd', { ascending: false }),
    supabase.from('portfolio_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('recommendations')
      .select('id, run_at, summary_text')
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  ```
- Pass new prop to `<PortfolioOverview>`:
  ```tsx
  <PortfolioOverview
    initialHoldings={holdings}
    initialSettings={settings ?? defaultSettings}
    latestRecommendation={recRes.data ?? null}
  />
  ```
- `user` in this page is already obtained via `getAuthUser()` on line 13 (returns `AuthUser` with `.id`)
- The `supabase` variable is already created via `createClient()` on line 17

---

### T011 — Update `src/components/portfolio/PortfolioOverview.tsx`

**Action**: modify

**CRITICAL: this is a `'use client'` component** (confirmed — line 1 is `'use client'`). This means:
- The new prop `latestRecommendation` must be plain serialisable data — it is (`{ id, run_at, summary_text }` are all strings/null), so no issue
- Using Next.js `<Link>` is fine in client components
- Server-only imports are forbidden — do not import server utilities here

**Implementation details**:
- Extend the `Props` interface:
  ```ts
  interface Props {
    initialHoldings: PortfolioHolding[]
    initialSettings: PortfolioSettings
    latestRecommendation?: { id: string; run_at: string; summary_text: string | null } | null
  }
  ```
- Add `latestRecommendation` to destructured props in the component function signature
- Add import `Link` from `'next/link'` (already imported at line 4, no change needed)
- Render the card after the totals section (`</div>` closing the totals section at approx line 319) and before the modal block, when `latestRecommendation` is non-null:
  - Heading: "Latest Analysis"
  - Date: `new Date(latestRecommendation.run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })`
  - Summary excerpt: `latestRecommendation.summary_text ? latestRecommendation.summary_text.slice(0, 200) + (latestRecommendation.summary_text.length > 200 ? '…' : '') : ''`
  - Link: `<Link href={'/portfolio/recommendations/' + latestRecommendation.id}>View full recommendation</Link>`
  - When `latestRecommendation` is `null` or `undefined`, render nothing (no empty state)
- Follow the existing inline style pattern used throughout the file (no Tailwind class strings — the rest of the component uses CSS custom properties via inline styles)

---

## Migration SQL

None — all tables already exist from earlier slices.

Tables in scope (`recommendations`, `recommendation_summaries`, `portfolio_holdings`, `portfolio_settings`, `run_progress`) were all created in slices 1–9. No schema changes are required for this issue.

---

## Conflicts / Risks

### CONFLICT 1 — CRITICAL: `status: 'complete'` in `store-outputs` step

**File**: `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`, lines 332–347

The existing `recommendations` update inside `store-outputs` currently includes `status: 'complete'` in the update payload. T004 **must** remove this field. If it is not removed, a subsequent synthesizer failure (network error, Zod parse failure, Claude API outage) will still leave the `recommendations` row with `status: 'complete'` and null `target_allocation`/`action_list`/`summary_text` — producing a broken recommendation that the detail page would render as empty.

The exact lines to change are 333–347. After the fix, the `recommendations.update(...)` inside `store-outputs` should contain only `{ agent_outputs, portfolio_snapshot, updated_at }`.

---

### CONFLICT 2 — `recommendation_summaries` has no `user_id` column

**File**: `/workspaces/my-travel-assistant/specs/015-portfolio-advisor/data-model.md`

The `recommendation_summaries` table schema shows columns `(id, recommendation_id, summary_text, created_at)` — there is no `user_id`. The `fetch-summaries` step in T004 cannot do `.eq('user_id', user_id)` directly. The correct approach is a two-query sequence using the admin client:

```ts
const { data: recIds } = await admin
  .from('recommendations')
  .select('id')
  .eq('user_id', user_id)
  .order('run_at', { ascending: false })
  .limit(5)

if (!recIds || recIds.length === 0) return []

const ids = recIds.map(r => r.id)
const { data: summaries } = await admin
  .from('recommendation_summaries')
  .select('summary_text')
  .in('recommendation_id', ids)
  .order('created_at', { ascending: false })

return (summaries ?? []).map(s => s.summary_text)
```

If this is not handled correctly, the step will fail with a PostgREST column-not-found error.

---

### CONFLICT 3 — Next.js 16 `params` is a Promise in route handlers and page components

**Files**: `src/app/api/portfolio/recommendations/[id]/route.ts` (T005) and `src/app/portfolio/recommendations/[id]/page.tsx` (T009)

Both the API route and the page must `await params` before accessing `params.id`. The existing route handler pattern in `src/app/api/portfolio/run/` should be checked to confirm the project's current convention, but Next.js 16 App Router requires `await params` in dynamic segments. Failure to do so produces a TypeScript type error in strict mode.

---

### CONFLICT 4 — `PortfolioOverview.tsx` is `'use client'`

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/PortfolioOverview.tsx`, line 1

The `'use client'` directive at line 1 means T011 must not import any server-only modules (e.g. `createClient` from `@/lib/supabase/server`, `getAuthUser`). The new `latestRecommendation` prop is plain serialisable data passed from the server page (T010) — this is the correct pattern and introduces no conflict. However, `ActionList` and `AgentBreakdown` are NOT imported in `PortfolioOverview` — they belong in `RecommendationDetail` (T008). Confirm no cross-import confusion.

---

### CONFLICT 5 — `PortfolioOverview.tsx` uses inline styles, not Tailwind utility classes

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/PortfolioOverview.tsx`

The entire component uses inline styles with CSS custom properties (`var(--ink)`, `var(--r)`, etc.), not Tailwind utility classes. The new latest-recommendation card in T011 must follow the same inline style pattern — do not introduce Tailwind class strings into this file. Similarly, `ActionList.tsx` and `AgentBreakdown.tsx` should follow whichever convention is chosen (either is acceptable as new files, but inline styles match the broader portfolio component pattern).

---

### RISK — `RecommendationSummary` type not exported from `src/types/database.ts`

**File**: `/workspaces/my-travel-assistant/src/types/database.ts`

Confirmed: `RecommendationSummary` interface IS present in `database.ts` (lines visible in data-model.md specify it, and it was confirmed present). However, the `fetch-summaries` step only needs `summary_text: string` from the query result — no full type import is required there.

---

### RISK — `inngest.send` availability in synthesize step

**File**: `/workspaces/my-travel-assistant/src/inngest/portfolioAnalysis.ts`

The `portfolio/run.completed` event emission in the synthesize step uses `inngest.send(...)`. The `inngest` object is already imported at line 2 (`import { inngest } from '@/inngest/client'`). However, inside an Inngest `step.run` callback, prefer `step.sendEvent` over `inngest.send` if available in the Inngest SDK version in use — `step.sendEvent` is idempotent across retries whereas `inngest.send` inside a step will re-emit on step retry. Check the Inngest SDK version (`package.json`) and use `step.sendEvent('emit-completed', { name: 'portfolio/run.completed', data: { run_id, user_id } })` if available.

---

### RISK — Missing `recommendations` route directory

**Confirmed absent**: `src/app/api/portfolio/recommendations/` directory does not yet exist (only `holdings`, `run`, `settings`, `tickers`, `tos-accept` are present). T005 must create the full nested path `recommendations/[id]/route.ts`. Likewise, `src/app/portfolio/recommendations/` directory does not exist — T009 must create `recommendations/[id]/page.tsx`.

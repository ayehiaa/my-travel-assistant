# Architect Notes — Issue #74: Portfolio Holdings + Settings

## Backend Tasks

### 1. DB Migration — `supabase/migrations/015_portfolio_holdings_settings.sql`
Create two new tables with RLS. File must be created from scratch.

```sql
-- portfolio_holdings: one row per stock holding per user
CREATE TABLE IF NOT EXISTS public.portfolio_holdings (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker           text           NOT NULL,
  company_name     text           NOT NULL,
  total_value_usd  numeric(12,2)  NOT NULL CHECK (total_value_usd > 0),
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

ALTER TABLE public.portfolio_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings_select_own"
  ON public.portfolio_holdings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "holdings_insert_own"
  ON public.portfolio_holdings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "holdings_update_own"
  ON public.portfolio_holdings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "holdings_delete_own"
  ON public.portfolio_holdings FOR DELETE
  USING (user_id = auth.uid());

-- portfolio_settings: one row per user — config + scheduling state
CREATE TABLE IF NOT EXISTS public.portfolio_settings (
  user_id              uuid           PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_usd             numeric(12,2)  NOT NULL DEFAULT 0 CHECK (cash_usd >= 0),
  target_return_pct    numeric(5,2)   NOT NULL DEFAULT 10 CHECK (target_return_pct > 0),
  risk_profile         text           NOT NULL DEFAULT 'moderate'
    CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
  run_interval_days    integer        NOT NULL DEFAULT 30
    CHECK (run_interval_days IN (7, 14, 30)),
  last_run_at          timestamptz    NULL,
  next_run_at          timestamptz    NULL,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_own"
  ON public.portfolio_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "settings_insert_own"
  ON public.portfolio_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "settings_update_own"
  ON public.portfolio_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

---

### 2. TypeScript Types — `src/types/database.ts` (modify)

Append the following to the existing file. Do NOT remove or change existing types.

- Add `RiskProfile = 'conservative' | 'moderate' | 'aggressive'`
- Extend `AuditAction` union with four new string literals:
  `'holding_created' | 'holding_updated' | 'holding_deleted' | 'portfolio_settings_updated'`
- Add interface `PortfolioHolding`:
  ```ts
  export interface PortfolioHolding {
    id: string
    user_id: string
    ticker: string
    company_name: string
    total_value_usd: number
    created_at: string
    updated_at: string
  }
  ```
- Add interface `PortfolioSettings`:
  ```ts
  export interface PortfolioSettings {
    user_id: string
    cash_usd: number
    target_return_pct: number
    risk_profile: RiskProfile
    run_interval_days: 7 | 14 | 30
    last_run_at: string | null
    next_run_at: string | null
    created_at: string
    updated_at: string
  }
  ```

---

### 3. Holdings GET + POST — `src/app/api/portfolio/holdings/route.ts` (create)

Auth pattern (used in all portfolio routes):
```ts
const user = await getAuthUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
const supabase = await createClient()
```

**GET handler** — `export async function GET()`:
- Auth + role check (see above).
- Query: `supabase.from('portfolio_holdings').select('*').eq('user_id', user.id).order('total_value_usd', { ascending: false })`
- Compute `total_holdings_usd` by summing `holding.total_value_usd` across all rows (keep as `number`).
- Return `NextResponse.json({ holdings: data ?? [], total_holdings_usd })`.
- On DB error return 500.

**Zod schema** (module-level const):
```ts
const HoldingInsertSchema = z.object({
  ticker:          z.string().min(1).max(10).transform(v => v.toUpperCase()),
  company_name:    z.string().min(1).max(100),
  total_value_usd: z.number().positive(),
})
```

**POST handler** — `export async function POST(request: NextRequest)`:
- Auth + role check.
- Parse body; return 400 on JSON error or Zod failure.
- Insert: `supabase.from('portfolio_holdings').insert({ user_id: user.id, ...parsed.data }).select().single()`
- If Supabase error code is `'23505'` (unique violation), return 409 `{ error: 'Ticker already exists in portfolio' }`.
- On other DB error return 500.
- Call `await logAudit({ performedBy: user.id, action: 'holding_created', tripId: null })`.
- Return `NextResponse.json({ holding: data }, { status: 201 })`.

Imports needed: `NextRequest`, `NextResponse` from `next/server`; `z` from `zod`; `getAuthUser` from `@/lib/auth`; `createClient` from `@/lib/supabase/server`; `logAudit` from `@/lib/auditLogger`.

---

### 4. Holdings PUT + DELETE — `src/app/api/portfolio/holdings/[id]/route.ts` (create)

**Zod schema**:
```ts
const HoldingUpdateSchema = z.object({
  total_value_usd: z.number().positive(),
})
```

**PUT handler** — `export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> })`:
- Auth + role check.
- `const { id } = await params`
- Ownership check: `.from('portfolio_holdings').select('id').eq('id', id).eq('user_id', user.id).single()` — return 404 if not found.
- Parse body; return 400 on JSON error or Zod failure.
- Update: `.from('portfolio_holdings').update({ total_value_usd: parsed.data.total_value_usd, updated_at: new Date().toISOString() }).eq('id', id).select().single()`
- On DB error return 500.
- Call `await logAudit({ performedBy: user.id, action: 'holding_updated', tripId: null })`.
- Return `NextResponse.json({ holding: data })`.

**DELETE handler** — `export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> })`:
- Auth + role check.
- `const { id } = await params`
- Ownership check: `.from('portfolio_holdings').select('id').eq('id', id).eq('user_id', user.id).single()` — return 404 if not found.
- Delete: `.from('portfolio_holdings').delete().eq('id', id)`
- On DB error return 500.
- Call `await logAudit({ performedBy: user.id, action: 'holding_deleted', tripId: null })`.
- Return `new NextResponse(null, { status: 204 })`.

---

### 5. Ticker Autocomplete Proxy — `src/app/api/portfolio/tickers/search/route.ts` (create)

**GET handler** — `export async function GET(request: NextRequest)`:
- Auth + role check.
- Read `q` from `request.nextUrl.searchParams.get('q')`.
- If `q` is null or empty string return 400 `{ error: 'Missing q parameter' }`.
- Fetch from Polygon:
  ```
  https://api.polygon.io/v3/reference/tickers?search={q}&active=true&market=stocks&limit=10&apiKey=${process.env.POLYGON_API_KEY}
  ```
- If fetch fails or non-2xx response from Polygon, return 502 `{ error: 'Ticker search unavailable' }`.
- Parse JSON; map `results` array to `{ ticker: r.ticker, name: r.name, primary_exchange: r.primary_exchange }`.
- Return `NextResponse.json({ results: mapped })`.
- No logAudit needed (read-only proxy, no side effects).

Note: `POLYGON_API_KEY` is a server-side env var only (no `NEXT_PUBLIC_` prefix). Backend dev must add it to `.env.local` and Vercel env.

---

### 6. Settings GET + PUT — `src/app/api/portfolio/settings/route.ts` (create)

**Zod schema**:
```ts
const SettingsUpdateSchema = z.object({
  cash_usd:          z.number().nonnegative().optional(),
  target_return_pct: z.number().positive().optional(),
  risk_profile:      z.enum(['conservative', 'moderate', 'aggressive']).optional(),
  run_interval_days: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
})
```

**GET handler** — `export async function GET()`:
- Auth + role check.
- Query: `.from('portfolio_settings').select('*').eq('user_id', user.id).maybeSingle()`
- If `data` is null, upsert defaults: `.from('portfolio_settings').insert({ user_id: user.id }).select().single()` — this creates the row with all DB-column defaults.
- Return `NextResponse.json({ settings: data })`.
- On DB error return 500.

**PUT handler** — `export async function PUT(request: NextRequest)`:
- Auth + role check.
- Parse body; return 400 on JSON error or Zod failure.
- Upsert: `.from('portfolio_settings').upsert({ user_id: user.id, ...parsed.data, updated_at: new Date().toISOString() }).select().single()`
- On DB error return 500.
- Call `await logAudit({ performedBy: user.id, action: 'portfolio_settings_updated', tripId: null })`.
- Return `NextResponse.json({ settings: data })`.

---

### 7. Pure Function — `src/lib/portfolioCalculator.ts` (create)

Export these pure functions (no Supabase, no fetch):

```ts
export interface HoldingSummary {
  ticker: string
  company_name: string
  total_value_usd: number
  pct_of_portfolio: number  // 0–100, rounded to 2 decimal places
}

export interface PortfolioTotals {
  holdings_usd: number
  cash_usd: number
  grand_total_usd: number
}

/**
 * Given an array of holdings and a cash amount, compute per-holding
 * percentage of the grand total (holdings + cash).
 * If grand_total is 0, all pct_of_portfolio values are 0.
 */
export function computeHoldingSummaries(
  holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>,
  cash_usd: number
): { summaries: HoldingSummary[]; totals: PortfolioTotals }

/**
 * Format a USD number as a locale string: "$12,345.67"
 * Uses en-US locale, minimumFractionDigits: 2, maximumFractionDigits: 2.
 */
export function formatUsd(value: number): string
```

Implementation notes:
- `grand_total_usd = holdings_usd + cash_usd`
- `pct_of_portfolio = grand_total_usd > 0 ? Math.round((h.total_value_usd / grand_total_usd) * 10000) / 100 : 0`
- `holdings_usd = holdings.reduce((sum, h) => sum + h.total_value_usd, 0)`
- Return `summaries` in the same order as input `holdings`.

---

## Frontend Tasks

### 1. TickerAutocomplete Component — `src/components/portfolio/TickerAutocomplete.tsx` (create)

`'use client'`

```ts
interface TickerResult {
  ticker: string
  name: string
  primary_exchange: string
}

interface Props {
  onSelect: (result: TickerResult) => void
  disabled?: boolean
}
```

Implementation:
- Internal state: `query: string`, `results: TickerResult[]`, `loading: boolean`, `open: boolean`.
- Debounce: use `useEffect` with `setTimeout(300ms)` cleanup. Only fire fetch when `query.trim().length >= 2`.
- Fetch: `GET /api/portfolio/tickers/search?q=${encodeURIComponent(query)}` on debounced query change.
- On fetch error call `useToast()` with `'Ticker search failed'` and `'error'`.
- Render: text input + absolute-positioned dropdown list beneath it when `open && results.length > 0`.
- Each dropdown item shows `{ticker} — {name}` on click, calls `onSelect(result)`, clears query, closes dropdown.
- When `results` returns empty for a non-empty query, show a "No results" item (not selectable).
- Close dropdown on Escape key (`onKeyDown` on the input).
- No external UI library — inline styles matching the `inputStyle` pattern from `AddExpenseModal.tsx` (`border: '1.5px solid var(--rule)'`, `borderRadius: 10`, etc.).
- Dropdown container: `position: absolute`, `zIndex: 50`, `background: white`, `border: '1px solid var(--rule)'`, `borderRadius: 8`, `boxShadow: 'var(--shadow-lg)'`, `maxHeight: 240`, `overflowY: auto`.
- Skeleton: while `loading`, show 3 skeleton rows (use `<Skeleton>` from `src/components/ui/Skeleton.tsx` — check the import path).

---

### 2. HoldingForm Modal — `src/components/portfolio/HoldingForm.tsx` (create)

`'use client'`

```ts
interface Props {
  holdingToEdit: PortfolioHolding | null
  onClose: () => void
  onSaved: (holding: PortfolioHolding) => void
}
```

Mirror the structural pattern of `AddExpenseModal.tsx`:
- Outer shell component exports default `HoldingForm` and renders an inner `HoldingFormBody` with a `key` prop: `key={holdingToEdit?.id ?? 'new'}` to force remount on identity change.
- Inner component `HoldingFormBody` holds all state.
- State: `ticker: string`, `companyName: string`, `valueStr: string` (string for input binding), `saving: boolean`.
- In edit mode: initialise state from `holdingToEdit` (ticker read-only — disable the input).
- In add mode: ticker and company name come from `TickerAutocomplete.onSelect` — when user selects a result, set `ticker` and `companyName`; then focus the value input.
- Validation: `isValid = ticker.trim() !== '' && companyName.trim() !== '' && parseFloat(valueStr) > 0`.
- Save:
  - Add mode: `POST /api/portfolio/holdings` with `{ ticker, company_name: companyName, total_value_usd: parseFloat(valueStr) }`.
  - Edit mode: `PUT /api/portfolio/holdings/${holdingToEdit.id}` with `{ total_value_usd: parseFloat(valueStr) }`.
  - On non-ok: read `data.error`; if `data.error === 'Ticker already exists in portfolio'` show `useToast('This ticker is already in your portfolio', 'error')`; otherwise show the generic error message.
  - On success: call `onSaved(data.holding)` then `onClose()`.
- Modal chrome: fixed overlay, white card, header with title ("Add holding" / "Edit holding"), close button (×), body with fields, footer with Cancel + Save buttons.
- Field layout:
  - In add mode: `TickerAutocomplete` component as the first field (label "Ticker"); when a ticker is selected, show the selected ticker + company name as read-only text below and set `ticker`/`companyName` state.
  - In edit mode: display ticker and company name as static read-only text (not inputs).
  - "Value (USD)" numeric input, `min="0.01"`, `step="0.01"`, placeholder `"0.00"`.
- Use the same `inputStyle`, `focusHandlers`, and `labelStyle` patterns from `AddExpenseModal.tsx`.

---

### 3. PortfolioOverview Component — `src/components/portfolio/PortfolioOverview.tsx` (create)

`'use client'`

```ts
interface Props {
  initialHoldings: PortfolioHolding[]
  initialSettings: PortfolioSettings
}
```

Imports: `PortfolioHolding`, `PortfolioSettings` from `@/types/database`; `computeHoldingSummaries`, `formatUsd` from `@/lib/portfolioCalculator`; `HoldingForm` from `./HoldingForm`; `useToast` from `@/context/ToastContext`; `useRouter` from `next/navigation`.

State: `holdings: PortfolioHolding[]` (initialised from props), `settings: PortfolioSettings` (initialised from props), `showAddModal: boolean`, `editingHolding: PortfolioHolding | null`.

Derived: call `computeHoldingSummaries(holdings, settings.cash_usd)` on every render to get `{ summaries, totals }`.

Holdings table (render when `holdings.length > 0`):
- Columns: Ticker | Company | Value (USD) | % of Portfolio | Actions
- Each row: ticker in monospace bold, company name, `formatUsd(h.total_value_usd)`, `{summary.pct_of_portfolio}%`, Edit button + Delete button.
- Delete button: calls `DELETE /api/portfolio/holdings/{id}`; on success filters holding from state and calls `router.refresh()`; on error calls `useToast('Failed to delete holding', 'error')`.
- Edit button: sets `editingHolding` to the holding.

Totals section (render below table):
- "Holdings total": `formatUsd(totals.holdings_usd)`
- "Cash": `formatUsd(totals.cash_usd)`
- "Grand total": `formatUsd(totals.grand_total_usd)` — visually emphasised (larger font, bold).

Empty state (when `holdings.length === 0`): dashed border box, text "No holdings yet — add your first position."

"+ Add holding" button: sets `showAddModal = true`. Style matches `+ Add expense` button from `ExpenseList.tsx`.

Modal: render `HoldingForm` when `showAddModal || editingHolding !== null`:
```tsx
<HoldingForm
  holdingToEdit={editingHolding}
  onClose={handleCloseModal}
  onSaved={handleSaved}
/>
```

Handlers:
- `handleSaved(saved)`: if `editingHolding`, map-replace in array; else prepend. Reset modal state. Call `router.refresh()`.
- `handleCloseModal()`: reset `showAddModal` and `editingHolding`.

---

### 4. Portfolio Page Upgrade — `src/app/portfolio/page.tsx` (modify)

This is a server component. The existing file already handles the auth guard (`redirect` to `/login` if no user, `redirect` to `/` if not `premium_plus`) and the T&C gate (`PortfolioTosGate`). Do not remove those.

Replace the placeholder `<main>` block (the one with "Your portfolio dashboard is coming soon.") with:

```tsx
// After the tos gate check, fetch holdings and settings in parallel:
const [holdingsRes, settingsRes] = await Promise.all([
  supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('user_id', user.id)
    .order('total_value_usd', { ascending: false }),
  supabase
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle(),
])

const holdings = holdingsRes.data ?? []

let settings = settingsRes.data as PortfolioSettings | null
if (!settings) {
  // First visit: insert default row; API GET will also do this but SSR should too
  const { data: inserted } = await supabase
    .from('portfolio_settings')
    .insert({ user_id: user.id })
    .select()
    .single()
  settings = inserted
}
```

Then render:
```tsx
import PortfolioOverview from '@/components/portfolio/PortfolioOverview'

return (
  <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
    <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 32, marginBottom: 8, color: 'var(--ink)' }}>
      Portfolio
    </h1>
    <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 32 }}>
      Manage your US stock holdings and cash position.
    </p>
    <PortfolioOverview
      initialHoldings={holdings}
      initialSettings={settings ?? { user_id: user.id, cash_usd: 0, target_return_pct: 10, risk_profile: 'moderate', run_interval_days: 30, last_run_at: null, next_run_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }}
    />
  </main>
)
```

Add imports at the top: `PortfolioHolding`, `PortfolioSettings` from `@/types/database`; `PortfolioOverview` from `@/components/portfolio/PortfolioOverview`.

---

### 5. PortfolioSettingsForm Component — `src/components/portfolio/PortfolioSettingsForm.tsx` (create)

`'use client'`

```ts
interface Props {
  initialSettings: PortfolioSettings
}
```

State: `cashStr: string`, `targetReturnStr: string`, `riskProfile: RiskProfile`, `runIntervalDays: 7 | 14 | 30`, `saving: boolean`.

Initialise all from `initialSettings`.

Validation: `isValid = parseFloat(cashStr) >= 0 && parseFloat(targetReturnStr) > 0`.

Save handler `handleSave`:
- `PUT /api/portfolio/settings` with body `{ cash_usd: parseFloat(cashStr), target_return_pct: parseFloat(targetReturnStr), risk_profile: riskProfile, run_interval_days: runIntervalDays }`.
- On error: `useToast('Failed to save settings', 'error')`.
- On success: `useToast('Settings saved', 'success')`.

Fields (use same `inputStyle`, `focusHandlers`, `labelStyle` constants as in `AddExpenseModal.tsx`):
- "Cash (USD)": number input, `min="0"`, `step="0.01"`, bound to `cashStr`.
- "Target Return (%)": number input, `min="0.01"`, `step="0.1"`, bound to `targetReturnStr`.
- "Risk Profile": `<select>` with options `conservative`, `moderate`, `aggressive` (capitalised labels).
- "Analysis Schedule": `<select>` with options `7` (Weekly), `14` (Fortnightly), `30` (Monthly).
- Save button: disabled when `!isValid || saving`; text "Save settings" / "Saving…".

Render as a card (not a modal): white background, `borderRadius: 'var(--r-xl)'`, `border: '1px solid var(--rule)'`, `padding: '28px'`, `maxWidth: 480`.

---

### 6. Portfolio Settings Page — `src/app/portfolio/settings/page.tsx` (create)

Server component.

```ts
export const metadata = { title: 'Sojourn — Portfolio Settings' }
```

Auth pattern (mirrors `src/app/portfolio/page.tsx`):
- `const user = await getAuthUser()` — redirect to `/login` if null.
- If `user.role !== 'premium_plus'` redirect to `/`.
- Check `user_profiles.portfolio_tos_accepted_at` — if not accepted, redirect to `/portfolio` (T&C gate will render there).

Fetch settings:
```ts
const { data: settingsRow } = await supabase
  .from('portfolio_settings')
  .select('*')
  .eq('user_id', user.id)
  .maybeSingle()
```

If `settingsRow` is null, insert default row same as in the portfolio page.

Render:
```tsx
import PortfolioSettingsForm from '@/components/portfolio/PortfolioSettingsForm'

return (
  <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
    <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, marginBottom: 8, color: 'var(--ink)' }}>
      Portfolio Settings
    </h1>
    <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 32 }}>
      Configure your risk preferences and analysis schedule.
    </p>
    <PortfolioSettingsForm initialSettings={settings} />
  </main>
)
```

Imports: `getAuthUser` from `@/lib/auth`; `createClient` from `@/lib/supabase/server`; `PortfolioSettings` from `@/types/database`; `PortfolioSettingsForm` from `@/components/portfolio/PortfolioSettingsForm`; `redirect` from `next/navigation`.

---

## Migration SQL

**Filename**: `supabase/migrations/015_portfolio_holdings_settings.sql`

The full SQL is listed under Backend Task 1 above. No changes to existing tables. The `user_profiles` table and `premium_plus` role were added in migrations 013 and 014 (already merged) — do not re-create them.

---

## Conflicts / Risks

1. **`AuditAction` type is imported by `auditLogger.ts`** — adding new literals to the union in `src/types/database.ts` is a safe, non-breaking extension. The `logAudit` call sites in existing routes remain valid.

2. **`POLYGON_API_KEY` env var** — this key does not exist in `.env.local` yet. The backend dev must add it. Without it, the ticker search route will throw at runtime. The route should handle a missing key gracefully: if `!process.env.POLYGON_API_KEY` return 503 `{ error: 'Ticker search not configured' }`.

3. **`portfolio_settings` default row on first visit** — both the SSR page and the GET API route attempt to insert a default row. Use `upsert` or `INSERT ... ON CONFLICT DO NOTHING` in the API route so concurrent first-visit requests do not race. Recommended: in the API GET handler, use `.upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true })` before re-fetching.

4. **`PortfolioSettings` type for the `settings` prop fallback** — the SSR page must not pass `null` to `PortfolioOverview`. If both the `maybeSingle` and the insert fail (e.g. network error), return a safe in-memory default object typed as `PortfolioSettings` rather than crashing.

5. **No `getActiveMainAccountId` for portfolio routes** — unlike expenses (which use account delegation), portfolio data is strictly personal. Use `user.id` directly as the filter key. Do not call `getActiveMainAccountId`.

6. **Skeleton import path** — verify that `src/components/ui/Skeleton.tsx` exports a `<Skeleton>` component before using it in `TickerAutocomplete.tsx`. If the component has a different API (e.g. requires `width`/`height` props), match accordingly.

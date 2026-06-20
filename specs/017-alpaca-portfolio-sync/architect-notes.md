# Architect Notes — Alpaca Portfolio Sync (017)

## Backend Tasks

### B1 — DB Migration
**File**: `supabase/migrations/20260620_alpaca_portfolio_sync.sql` (create)

Add two nullable columns. No backfill required; existing rows carry NULL and the UI renders "—" for NULL qty.

See Migration SQL section below for the exact SQL.

---

### B2 — Type updates
**File**: `src/types/database.ts` (modify)

1. Add `qty: number | null` to `PortfolioHolding` after `total_value_usd`.
2. Add `last_synced_at: string | null` to `PortfolioSettings` after `next_run_at`.
3. Add `'alpaca_synced'` to the `AuditAction` union (used by the sync route's `logAudit` call).
4. Update the `defaultSettings` object literal in `src/app/portfolio/page.tsx` to include `last_synced_at: null` — TypeScript strict mode will flag this as a compile error once the interface is updated.

---

### B3 — Core sync library function
**File**: `src/lib/alpacaPortfolioSync.ts` (create)

Export one function:

```ts
export async function syncAlpacaPositions(
  userId: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{ ok: true; lastSyncedAt: string } | { ok: false; error: string }>
```

**Implementation steps inside the function:**

1. Fetch all positions from Alpaca:
   ```ts
   const base = getAlpacaBaseUrl(isPaper)  // import from alpacaClient.ts
   const res = await fetch(`${base}/v2/positions`, { headers: alpacaHeaders(keyId, secret) })
   ```
   Return `{ ok: false, error: 'Alpaca unreachable' }` on non-2xx.

   Parse as `AlpacaPosition[]` (see Alpaca Position Response Shape section).

2. Load existing DB holdings for the user using `createAdminClient()`:
   ```ts
   const admin = createAdminClient()
   const { data: dbHoldings } = await admin
     .from('portfolio_holdings')
     .select('id, ticker, qty')
     .eq('user_id', userId)
   ```

3. Build a `Map<string, string>` of `ticker → db_row_id` from `dbHoldings`.

4. Reconcile — for each Alpaca position:
   - `market_value` from the Alpaca response becomes `total_value_usd`.
   - `qty` from the Alpaca response (a decimal string — parse with `parseFloat`) becomes the DB `qty`.
   - If ticker exists in DB map: build an **update** record `{ total_value_usd, qty, updated_at: now() }`.
   - If ticker is not in DB map: look up company name (see Company Name Resolution section), then build an **insert** record `{ user_id, ticker, company_name, total_value_usd, qty }`.
   - Tickers in DB only (no Alpaca position): leave untouched — do NOT delete them.

5. Execute DB writes using `createAdminClient()` so RLS does not block server-side writes:
   - Updates: batch via `.update()` per ticker, or use a single `.upsert()` on `(user_id, ticker)` with `ignoreDuplicates: false`.
   - Recommended pattern: single `admin.from('portfolio_holdings').upsert(rows, { onConflict: 'user_id,ticker' })` covering both update and insert cases. Pass the full row shape for inserts and the partial shape for updates.
   - **Important**: the `upsert` must only touch tickers that appeared in the Alpaca response. Do not upsert DB-only rows (that would overwrite manual holdings).

6. Update `portfolio_settings.last_synced_at`:
   ```ts
   const now = new Date().toISOString()
   await admin
     .from('portfolio_settings')
     .upsert({ user_id: userId, last_synced_at: now }, { onConflict: 'user_id' })
   ```

7. Return `{ ok: true, lastSyncedAt: now }`.

**Helper**: `alpacaHeaders` is not exported from `alpacaClient.ts` — it is a private function. Options:
- Option A (preferred): export a new `fetchAllPositions(keyId, secret, isPaper): Promise<AlpacaPosition[]>` function from `alpacaClient.ts` (keeps HTTP details in one place).
- Option B: duplicate the header construction in `alpacaPortfolioSync.ts`.

**Recommendation**: choose Option A. Add `fetchAllPositions` to `src/lib/alpacaClient.ts`.

---

### B4 — Sync API route
**File**: `src/app/api/portfolio/alpaca/sync/route.ts` (create)

```ts
export async function POST(_request: NextRequest): Promise<NextResponse>
```

No request body is needed (sync is always for the authenticated user's own credentials).

Steps:
1. `const user = await getAuthUser()` — return 401 if null.
2. Check `user.role !== 'premium_plus'` — return 403.
3. Load credentials via `createAdminClient()` from `alpaca_credentials` where `user_id = user.id`. Return 400 `{ error: 'No Alpaca credentials connected' }` if null.
4. Decrypt with `decryptCredential`.
5. Call `syncAlpacaPositions(user.id, keyId, secret, cred.is_paper)`.
6. If `result.ok === false`: return 502 `{ error: result.error }`.
7. Re-query `portfolio_holdings` from `createClient()` (auth-aware, confirms RLS is fine) and return the fresh holdings in the response alongside `last_synced_at`.
8. Call `logAudit({ performedBy: user.id, action: 'alpaca_synced', tripId: null })`.
9. Return 200 `{ holdings, last_synced_at: result.lastSyncedAt }`.

**Zod schema**: no body to validate; skip schema. The route is POST with no body.

---

### B5 — Portfolio page server component update
**File**: `src/app/portfolio/page.tsx` (modify)

After the existing parallel fetch block (holdings + settings + recommendation), add a sync step:

1. Check if Alpaca credentials exist — query `alpaca_credentials` via `createAdminClient()`:
   ```ts
   const admin = createAdminClient()
   const { data: cred } = await admin
     .from('alpaca_credentials')
     .select('encrypted_key_id, key_id_iv, encrypted_secret, secret_iv, is_paper')
     .eq('user_id', user.id)
     .maybeSingle()
   const hasAlpaca = cred !== null
   ```

2. If `hasAlpaca`, attempt sync:
   ```ts
   let syncError = false
   let lastSyncedAt: string | null = null

   if (hasAlpaca) {
     const keyId = decryptCredential(cred.encrypted_key_id, cred.key_id_iv)
     const secret = decryptCredential(cred.encrypted_secret, cred.secret_iv)
     const syncResult = await syncAlpacaPositions(user.id, keyId, secret, cred.is_paper)
     if (syncResult.ok) {
       lastSyncedAt = syncResult.lastSyncedAt
     } else {
       syncError = true
       // Fall through — re-query holdings from DB (stale but safe)
       lastSyncedAt = settings?.last_synced_at ?? null
     }
   }
   ```

3. Re-query `portfolio_holdings` after sync (FR-015 — do not trust raw Alpaca response):
   ```ts
   const { data: freshHoldings } = await supabase
     .from('portfolio_holdings')
     .select('*')
     .eq('user_id', user.id)
     .order('total_value_usd', { ascending: false })
   const holdings = (freshHoldings ?? []) as PortfolioHolding[]
   ```
   Move the original holdings fetch to before the sync block (needed to have DB state for reconciliation) and replace the final render with the re-queried result. Alternatively, simply re-query after sync if Alpaca is connected, and use the original result if not. Either approach satisfies FR-015.

4. Update the `defaultSettings` object to include `last_synced_at: null`.

5. Pass new props to `PortfolioOverview`:
   ```tsx
   <PortfolioOverview
     initialHoldings={holdings}
     initialSettings={settings ?? defaultSettings}
     latestRecommendation={recRes.data ?? null}
     lastSyncedAt={lastSyncedAt}
     syncError={syncError}
     hasAlpaca={hasAlpaca}
   />
   ```

---

## Frontend Tasks

### F1 — PortfolioOverview: new props + Shares column
**File**: `src/components/portfolio/PortfolioOverview.tsx` (modify)

1. Extend the `Props` interface:
   ```ts
   interface Props {
     initialHoldings: PortfolioHolding[]
     initialSettings: PortfolioSettings
     latestRecommendation?: { id: string; run_at: string; summary_text: string | null } | null
     lastSyncedAt: string | null      // new
     syncError: boolean               // new
     hasAlpaca: boolean               // new
   }
   ```

2. Destructure the three new props from the function signature.

3. Add a `Shares` column to the holdings table:
   - In the `thead`, insert `'Shares'` between `'Value (USD)'` and `'% of Portfolio'` in the columns array.
   - In the `tbody`, add a corresponding `<td>` that renders:
     ```tsx
     {holding.qty != null ? holding.qty.toFixed(2) : '—'}
     ```
     Style consistently with the Value column (`fontFamily: 'var(--mono)'`).

   **Note**: the `summaries` array from `computeHoldingSummaries` does not carry `qty`. The `qty` value must be read from `holdings[i]` directly (the original `PortfolioHolding` array), which is already available in the row-render loop as `const holding = holdings[i]`.

---

### F2 — Sync status line
**File**: `src/components/portfolio/PortfolioOverview.tsx` (modify, continuation of F1)

Add sync state and handler:

```ts
const [isSyncing, setIsSyncing] = useState(false)
const [localLastSynced, setLocalLastSynced] = useState<string | null>(lastSyncedAt)
const [localSyncError, setLocalSyncError] = useState(syncError)
```

Add a `handleSync` function:
```ts
async function handleSync() {
  setIsSyncing(true)
  try {
    const res = await fetch('/api/portfolio/alpaca/sync', { method: 'POST' })
    if (!res.ok) {
      toast('Could not sync with Alpaca', 'error')
      setLocalSyncError(true)
    } else {
      const body = await res.json() as { holdings: PortfolioHolding[]; last_synced_at: string }
      setHoldings(body.holdings)
      setLocalLastSynced(body.last_synced_at)
      setLocalSyncError(false)
      router.refresh()
    }
  } catch {
    toast('Could not sync with Alpaca', 'error')
    setLocalSyncError(true)
  } finally {
    setIsSyncing(false)
  }
}
```

Render sync status line immediately above the toolbar (or below it — place consistently). Only render when `hasAlpaca`:

```tsx
{hasAlpaca && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13, color: 'var(--ink-3)' }}>
    <span>
      {localLastSynced
        ? `Synced ${formatRelativeTime(localLastSynced)}`
        : 'Never synced'}
    </span>
    <span style={{ color: 'var(--rule)' }}>·</span>
    <button
      onClick={handleSync}
      disabled={isSyncing}
      style={{ ... /* inline text-style button, no background */ }}
    >
      {isSyncing ? 'Syncing…' : 'Sync now'}
    </button>
  </div>
)}
```

Add a `formatRelativeTime(iso: string): string` helper — pure function, co-locate in the component file or extract to `src/lib/formatRelativeTime.ts` if reuse is anticipated. It should return strings like `"2 minutes ago"`, `"just now"`, `"3 hours ago"`. Use `Date.now() - new Date(iso).getTime()` arithmetic. No external library needed.

---

### F3 — Amber error banner
**File**: `src/components/portfolio/PortfolioOverview.tsx` (modify, continuation of F2)

Add a dismissible amber banner that renders when `localSyncError && hasAlpaca`. Place it at the top of the returned JSX, before the toolbar:

```tsx
{localSyncError && hasAlpaca && (
  <div
    role="alert"
    style={{
      background: '#fffbeb',
      border: '1.5px solid #f59e0b',
      borderRadius: 'var(--r)',
      padding: '12px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: 14,
      color: '#92400e',
    }}
  >
    <span>Portfolio may be out of date — could not reach Alpaca.</span>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button onClick={handleSync} disabled={isSyncing} style={{ fontWeight: 600, color: '#92400e', background: 'none', border: 'none', cursor: 'pointer' }}>
        {isSyncing ? 'Syncing…' : 'Retry sync'}
      </button>
      <button
        onClick={() => setLocalSyncError(false)}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 16 }}
      >
        x
      </button>
    </div>
  </div>
)}
```

The dismiss button only hides the banner in this render — on next page load the server will re-attempt sync and the prop will be accurate again.

---

## Migration SQL

```sql
-- 20260620_alpaca_portfolio_sync.sql

-- Add qty column to portfolio_holdings (nullable — manual holdings have no qty)
ALTER TABLE public.portfolio_holdings
  ADD COLUMN IF NOT EXISTS qty numeric(12,6) NULL;

-- Add last_synced_at column to portfolio_settings (nullable — unsynced users have NULL)
ALTER TABLE public.portfolio_settings
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL;
```

**No RLS changes needed.** The existing `holdings_update_own` policy covers the `qty` column automatically (column-level RLS is not used here). The sync function uses `createAdminClient()` which bypasses RLS — this is the established pattern for server-side batch writes in this codebase (see `execute/route.ts` line 62).

**Migration filename note**: the last migration file is `20260619_alpaca_trade_execution.sql`. Use `20260620_alpaca_portfolio_sync.sql` to maintain date-based ordering. The numbered files (`001_` … `018_`) appear to predate the date-based naming switch; the new file correctly continues the date convention.

---

## Alpaca Position Response Shape

`GET /v2/positions` returns a JSON array. Each element:

```ts
interface AlpacaPosition {
  asset_id:              string   // UUID
  symbol:                string   // e.g. "AAPL"
  exchange:              string   // e.g. "NASDAQ"
  asset_class:           string   // e.g. "us_equity"
  avg_entry_price:       string   // decimal string
  qty:                   string   // decimal string, e.g. "10.5"
  qty_available:         string   // decimal string (excludes open orders)
  side:                  'long' | 'short'
  market_value:          string   // decimal string — current market value in USD
  cost_basis:            string   // decimal string
  unrealized_pl:         string   // decimal string
  unrealized_plpc:       string   // decimal string
  unrealized_intraday_pl:   string
  unrealized_intraday_plpc: string
  current_price:         string   // decimal string
  lastday_price:         string   // decimal string
  change_today:          string   // decimal string
}
```

Fields used by the sync function:
- `symbol` → `ticker` (uppercase, matches DB constraint `^[A-Za-z0-9.]{1,10}$`)
- `market_value` → `total_value_usd` (parse with `parseFloat`)
- `qty` → `qty` column (parse with `parseFloat`)

All numeric fields from Alpaca are **decimal strings**, not numbers. Always parse before writing to DB.

Define this interface in `src/lib/alpacaPortfolioSync.ts` (not in `src/types/database.ts` — it is an external API shape, not a DB entity).

---

## Company Name Resolution

When an Alpaca position ticker is not found in `portfolio_holdings` (FR-004 — insert new row), a `company_name` must be supplied. The DB column has `NOT NULL` constraint.

**Available mechanism**: `GET /api/portfolio/tickers/search?q=<ticker>` calls Polygon.io's `/v3/reference/tickers` endpoint and returns `{ results: Array<{ ticker, name, primary_exchange }> }`. This requires `POLYGON_API_KEY` to be set.

**Approach for server-side use in `syncAlpacaPositions`**: call the Polygon API directly (do not go through the internal Next.js route — that would be a loopback HTTP call from the server, which is fragile and incurs extra latency).

Extract a shared helper:

```ts
// src/lib/alpacaPortfolioSync.ts (or a separate src/lib/polygonClient.ts)

async function lookupCompanyName(ticker: string): Promise<string> {
  const key = process.env.POLYGON_API_KEY
  if (!key) return ticker  // fallback: use ticker as company_name

  try {
    const res = await fetch(
      `https://api.polygon.io/v3/reference/tickers?ticker=${encodeURIComponent(ticker)}&active=true&market=stocks&limit=1&apiKey=${key}`
    )
    if (!res.ok) return ticker
    const json = await res.json() as { results?: Array<{ name: string }> }
    return json.results?.[0]?.name ?? ticker
  } catch {
    return ticker  // fallback: use ticker symbol as name
  }
}
```

**Notes**:
- Use `?ticker=AAPL` (exact match) not `?search=AAPL` (fuzzy). The tickers/search route uses `?search=` for the autocomplete UI, but for an exact lookup `?ticker=` is more precise.
- The fallback is `ticker` itself (the symbol string). This ensures the `NOT NULL` constraint is always satisfied even when Polygon is unavailable or `POLYGON_API_KEY` is not set.
- Call `lookupCompanyName` only for tickers that are NOT already in the DB. Do not call it for update-only rows.
- If multiple new tickers appear in a single sync, call `Promise.all(newTickers.map(lookupCompanyName))` to parallelise lookups rather than sequential awaits.

---

## Conflicts / Risks

### 1. `alpacaHeaders` is private in `alpacaClient.ts`
The header construction function is not exported. `alpacaPortfolioSync.ts` needs it to call `GET /v2/positions`. **Resolution**: add `export async function fetchAllPositions(keyId, secret, isPaper): Promise<AlpacaPosition[]>` to `src/lib/alpacaClient.ts`. This follows the existing pattern of that file (all Alpaca HTTP calls are centralised there).

### 2. `PortfolioSettings` `defaultSettings` literal in `page.tsx`
Once `last_synced_at: string | null` is added to the `PortfolioSettings` interface (B2), the `defaultSettings` object literal at line 63 of `src/app/portfolio/page.tsx` will fail TypeScript strict mode because it does not include `last_synced_at`. **Resolution**: add `last_synced_at: null` to that object in B5 as explicitly called out above.

### 3. `portfolio_holdings` upsert requires admin client
RLS `holdings_update_own` policy uses `auth.uid()`, which resolves to NULL in a service-role/admin client context. The policy still passes for admin client because admin bypasses RLS entirely. However: the existing `POST /api/portfolio/holdings/route.ts` uses the user `createClient()` for inserts. The sync function must use `createAdminClient()` to perform upserts server-side without a user session cookie. This is the same pattern as `execute/route.ts` lines 62–73.

### 4. `total_value_usd` constraint is `CHECK (total_value_usd > 0)`
The column has a positive-value check constraint (migration `015_portfolio_holdings_settings.sql` line 7). Alpaca can return `market_value` as `"0.00"` or a very small negative for short positions. Guard against this in the sync function:
```ts
const total_value_usd = Math.max(parseFloat(pos.market_value), 0.01)
```
Or skip positions where `parseFloat(pos.market_value) <= 0` and log them as skipped. Recommend skipping zero-value positions entirely rather than clamping, because a zero-value position likely means the trade has not settled yet.

### 5. `qty` in `alpacaClient.ts` `fetchPosition` parses as `parseInt`
Line 72 of `src/lib/alpacaClient.ts` uses `parseInt(data.qty, 10)` for the single-ticker position fetch — this truncates fractional shares. The new `fetchAllPositions` function must use `parseFloat` instead, since Alpaca supports fractional share quantities (e.g., `"10.5"`). The `qty numeric(12,6)` column accommodates this. Do not reuse or copy the `parseInt` pattern.

### 6. Sync on every page load has latency cost
`syncAlpacaPositions` makes an outbound HTTP call to Alpaca on every portfolio page load. If Alpaca is slow (> 1–2 s), this adds to page render time. This is an accepted trade-off per the plan's key decisions ("page-load sync is the primary mechanism"). No action required, but the Alpaca `fetch` call should not set a long timeout — let it fail fast. Consider adding `signal: AbortSignal.timeout(5000)` to the `fetchAllPositions` call.

### 7. No `alpaca_synced` audit action in `AuditAction` union
The `AuditAction` type in `src/types/database.ts` does not include `'alpaca_synced'`. The sync route must call `logAudit` with this action. **Resolution**: add `'alpaca_synced'` to the union in B2. Also update `src/components/audit/AuditEntry.tsx` display map if the action should render in the audit log UI — it currently maps specific actions to colours/labels (line 19+). Add a neutral entry for `alpaca_synced` or it will fall through to the default case.

# Architect Notes — Alpaca Trade Execution

## Conflicts / Risks

### Conflict 1 — `logAudit()` requires `tripId`, not `trip_id`

The `logAudit()` signature in `/workspaces/my-travel-assistant/src/lib/auditLogger.ts` uses camelCase params:

```ts
logAudit({
  performedBy: string,
  action: AuditAction,
  tripId: string | null,        // <-- camelCase, NOT trip_id
  tripSnapshot?: ... | null,
  changedFields?: ...,
  onBehalfOf?: string,
})
```

All three new route handlers (T008 credentials POST, T008 credentials DELETE, T012 execute) must call it as:

```ts
await logAudit({ performedBy: user.id, action: 'alpaca_credentials_connected', tripId: null })
```

No `trip_snapshot` argument needed — it is optional and defaults to `undefined` which is fine.

### Conflict 2 — Auth helper is `getAuthUser()`, not `getUser()`

The existing portfolio routes (e.g., `/workspaces/my-travel-assistant/src/app/api/portfolio/holdings/route.ts`) import `getAuthUser` from `@/lib/auth`, not a bare `getUser`. The returned object is `AuthUser { id, email, role, displayName }`. Use `user.id` and `user.role` accordingly in all three new route files.

### Conflict 3 — `AuditLogEntry.trip_snapshot` is typed as non-null

In `/workspaces/my-travel-assistant/src/types/database.ts` line 92, `trip_snapshot` on `AuditLogEntry` is typed as `Trip & { legs: TripLeg[] }` (not nullable). This is a display-side type only; the actual DB column accepts null and `logAudit()` writes `null` without issue (existing portfolio routes already do this). No change required to `AuditLogEntry` — do not add `| null` unless a separate cleanup task is scoped.

### Conflict 4 — `RecommendationDetail` is a server component; props must be serialisable

`RecommendationDetail.tsx` is currently a plain server component (no `'use client'`). After T016/T018 add `AlpacaExecuteButton` (a client component) as a child, the file remains a server component — this is fine in React 19 / Next.js 16 App Router. Server components can render client components as children. The props passed down (`recommendationId`, `isLatest`, `hasCredentials`, `isPaper`, `execution`) are all plain JSON-serialisable values. No issue.

### Conflict 5 — `alpaca_executions` write must use `createAdminClient()`

The RLS policy on `alpaca_executions` only grants SELECT to the authenticated user — there is no INSERT policy. The execute route must use `createAdminClient()` for the insert, same as the audit log pattern. Using the cookie-based `createClient()` would produce a 403 from RLS.

### Conflict 6 — `upsert` on `alpaca_credentials` requires admin client for clean bypass

`alpaca_credentials` has an ALL policy tied to `auth.uid()`, which means a cookie-based client can upsert. However, to match the pattern established for audit writes and avoid subtle RLS edge-cases with service-role vs user context, use `createAdminClient()` for the credentials upsert and delete, filtering explicitly by `user_id`. This is consistent with T008's stated intent.

### Conflict 7 — No `role` table column named `'owner'` in this app

`CLAUDE.md` references `'owner'` role but the actual `UserRole` type in `database.ts` is `'main' | 'assistant' | 'premium' | 'premium_plus'`. The portfolio role check is `role === 'premium_plus'`. All three new routes must check `user.role !== 'premium_plus'`, not `'owner'`.

---

## Migration SQL

**File**: `supabase/migrations/20260619_alpaca_trade_execution.sql`

Use the SQL exactly as written in `data-model.md`. No modifications needed. Key notes for the developer:

- `alpaca_credentials` uses `user_id uuid PRIMARY KEY` — the upsert in the credentials route relies on this PK conflict to replace existing credentials.
- `alpaca_executions` has `UNIQUE (recommendation_id)` — the 409 guard in both preview and execute routes relies on this constraint as a safety net. The route-level check comes first, but the DB constraint prevents races.
- The INSERT policy is intentionally absent from `alpaca_executions` — writes go through the service role only.
- Apply migration with: `supabase db push` or paste directly into the Supabase SQL editor on the project.

---

## Backend Tasks

### T001 — DB Migration

**File**: `supabase/migrations/20260619_alpaca_trade_execution.sql`
**Action**: Create

Copy SQL verbatim from `data-model.md`. The file must be committed so `supabase db push` can apply it. No changes to the SQL needed.

---

### T002 — TypeScript Types

**File**: `/workspaces/my-travel-assistant/src/types/database.ts`
**Action**: Modify

1. Extend the `AuditAction` union with three new literals, appended after `'run_triggered'`:

```ts
| 'alpaca_credentials_connected'
| 'alpaca_credentials_disconnected'
| 'alpaca_executed'
```

2. Append three new interfaces at the bottom of the file:

```ts
export interface AlpacaCredential {
  user_id: string
  encrypted_key_id: string
  key_id_iv: string
  encrypted_secret: string
  secret_iv: string
  is_paper: boolean
  created_at: string
  updated_at: string
}

export interface AlpacaOrderResult {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  price_at_execution: number
  estimated_value: number
  alpaca_order_id: string | null
  status: 'submitted' | 'rejected' | 'error' | 'skipped'
  error_message: string | null
}

export interface AlpacaExecution {
  id: string
  recommendation_id: string
  user_id: string
  executed_at: string
  is_paper: boolean
  orders: AlpacaOrderResult[]
}
```

---

### T003 — Env Var Placeholder

**File**: `/workspaces/my-travel-assistant/.env.local`
**Action**: Modify

Add a comment block (do not add the real value to this file — it must never be committed):

```
# Alpaca credential encryption key (AES-256-GCM, 32-byte base64)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# ALPACA_CREDENTIAL_ENCRYPTION_KEY=<generated value>
```

---

### T004 — `alpacaCrypto.ts`

**File**: `/workspaces/my-travel-assistant/src/lib/alpacaCrypto.ts`
**Action**: Create

Mirror `gmailCrypto.ts` exactly. Change three things only: env var name, exported function names, and the comment header.

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Generate key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Set as ALPACA_CREDENTIAL_ENCRYPTION_KEY env var (32-byte base64-encoded string)

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ALPACA_CREDENTIAL_ENCRYPTION_KEY
  if (!key) throw new Error('ALPACA_CREDENTIAL_ENCRYPTION_KEY is not set')
  return Buffer.from(key, 'base64')
}

export function encryptCredential(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const ciphertext = Buffer.concat([encrypted, tag]).toString('hex')
  return { ciphertext, iv: iv.toString('hex') }
}

export function decryptCredential(ciphertext: string, iv: string): string {
  const data = Buffer.from(ciphertext, 'hex')
  const tag = data.subarray(data.length - TAG_LENGTH)
  const encrypted = data.subarray(0, data.length - TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

---

### T005 — `alpacaOrderCalculator.ts`

**File**: `/workspaces/my-travel-assistant/src/lib/alpacaOrderCalculator.ts`
**Action**: Create

```ts
/**
 * computeOrderQty
 *
 * For buys:  floor(deltaUsd / askPrice)   — deltaUsd is positive
 * For sells: min(floor(abs(deltaUsd) / askPrice), positionQtyHeld)
 *            — capped at what the user actually holds
 *
 * Returns 0 (never negative) when:
 *   - deltaUsd is 0
 *   - askPrice is 0 or negative (guard against division by zero)
 *   - floor division yields 0
 */
export function computeOrderQty(
  deltaUsd: number,
  askPrice: number,
  positionQtyHeld: number,
  side: 'buy' | 'sell'
): number {
  if (askPrice <= 0) return 0
  if (deltaUsd === 0) return 0

  if (side === 'buy') {
    return Math.max(0, Math.floor(deltaUsd / askPrice))
  } else {
    const computed = Math.floor(Math.abs(deltaUsd) / askPrice)
    return Math.min(computed, Math.max(0, positionQtyHeld))
  }
}

/**
 * isNYSEOpen
 *
 * Returns true if the current UTC time falls within NYSE regular
 * trading hours: Monday–Friday, 9:30am–4:00pm US/Eastern.
 * Uses Intl for timezone conversion — no external dependencies.
 */
export function isNYSEOpen(): boolean {
  const now = new Date()
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etTime.getDay() // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false
  const totalMinutes = etTime.getHours() * 60 + etTime.getMinutes()
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60
}
```

Note on `positionQtyHeld` for buys: callers pass `0` for buy-side (position held is irrelevant). The function signature uses `number` not `number | null` — the caller normalises null→0 before calling. This avoids a null-check branch inside the pure function.

---

### T006 — `alpacaOrderCalculator.test.ts`

**File**: `/workspaces/my-travel-assistant/src/lib/alpacaOrderCalculator.test.ts`
**Action**: Create

Test cases required (must all pass before Phase 3 starts):

**`computeOrderQty` — buy side**
- `computeOrderQty(500, 100, 0, 'buy')` → `5` (exact floor)
- `computeOrderQty(549.99, 100, 0, 'buy')` → `5` (floor, not round)
- `computeOrderQty(50, 100, 0, 'buy')` → `0` (delta too small)
- `computeOrderQty(0, 100, 0, 'buy')` → `0` (zero delta)
- `computeOrderQty(500, 0, 0, 'buy')` → `0` (zero price guard, no division by zero)
- `computeOrderQty(500, -1, 0, 'buy')` → `0` (negative price guard)

**`computeOrderQty` — sell side**
- `computeOrderQty(-500, 100, 10, 'sell')` → `5` (floor, within position)
- `computeOrderQty(-1000, 100, 7, 'sell')` → `7` (capped at position)
- `computeOrderQty(-50, 100, 10, 'sell')` → `0` (too small, floor = 0)
- `computeOrderQty(-500, 100, 0, 'sell')` → `0` (no position held)
- `computeOrderQty(0, 100, 5, 'sell')` → `0` (zero delta)
- `computeOrderQty(-500, 0, 5, 'sell')` → `0` (zero price guard)

**`isNYSEOpen`**
- These tests must mock `Date` to control time. Use `vi.useFakeTimers()` / `vi.setSystemTime()`:
  - Saturday 12:00 ET → `false`
  - Sunday 12:00 ET → `false`
  - Monday 09:29 ET → `false` (one minute before open)
  - Monday 09:30 ET → `true` (exact open)
  - Wednesday 13:00 ET → `true` (midday)
  - Friday 15:59 ET → `true` (one minute before close)
  - Friday 16:00 ET → `false` (exact close — 16:00 is excluded)
  - Friday 16:01 ET → `false` (after close)

Remember to call `vi.useRealTimers()` in `afterEach` to avoid polluting other tests.

---

### T007 — `alpacaClient.ts`

**File**: `/workspaces/my-travel-assistant/src/lib/alpacaClient.ts`
**Action**: Create

Export four functions:

```ts
export function getAlpacaBaseUrl(isPaper: boolean): string {
  return isPaper
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets'
}
```

```ts
export async function fetchQuotes(
  tickers: string[],
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<Record<string, number>>
```
- GET `${base}/v2/stocks/quotes/latest?symbols=${tickers.join(',')}`
- Headers: `APCA-API-KEY-ID: keyId`, `APCA-API-SECRET-KEY: secret`
- Extract `data.quotes[ticker].ap` for each ticker
- Return `{ AAPL: 185.25, MSFT: 420.10, ... }`
- Throw on non-2xx so the caller can return 502

```ts
export async function fetchPosition(
  ticker: string,
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<number>
```
- GET `${base}/v2/positions/${ticker}`
- On 404: return `0` (not held — safe to skip sell)
- On 2xx: return `parseInt(data.qty, 10)`
- Throw on other non-2xx

```ts
export async function submitOrder(
  params: { symbol: string; qty: number; side: 'buy' | 'sell' },
  keyId: string,
  secret: string,
  isPaper: boolean
): Promise<{
  alpaca_order_id: string | null
  status: 'submitted' | 'rejected' | 'error'
  error_message: string | null
}>
```
- POST `${base}/v2/orders`
- Body: `{ symbol: params.symbol, qty: String(params.qty), side: params.side, type: 'market', time_in_force: 'day' }`
- On 200/201: `{ alpaca_order_id: data.id, status: 'submitted', error_message: null }`
- On 4xx: parse body as `{ message: string }`, return `{ alpaca_order_id: null, status: 'rejected', error_message: data.message }`
- On network error or 5xx: return `{ alpaca_order_id: null, status: 'error', error_message: 'Alpaca unreachable' }` (never throw — caller must not abort)

`submitOrder` must never throw. Catch all errors internally and return the `error` result shape. This is critical for the execute route to record partial results.

---

### T008 — Credentials API Route

**File**: `/workspaces/my-travel-assistant/src/app/api/portfolio/alpaca/credentials/route.ts`
**Action**: Create

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptCredential } from '@/lib/alpacaCrypto'
import { logAudit } from '@/lib/auditLogger'

const CredentialsSchema = z.object({
  key_id:     z.string().min(1).max(100),
  secret_key: z.string().min(1).max(200),
  is_paper:   z.boolean().default(true),
})
```

**POST handler** (connect / replace):
1. `getAuthUser()` → 401 if null
2. `user.role !== 'premium_plus'` → 403
3. Parse body with try/catch → 400 on JSON error
4. `CredentialsSchema.safeParse(raw)` → 400 on failure
5. Encrypt: `const encKeyId = encryptCredential(parsed.data.key_id)` and `const encSecret = encryptCredential(parsed.data.secret_key)`
6. Upsert using `createAdminClient()`:

```ts
const admin = createAdminClient()
const { error } = await admin
  .from('alpaca_credentials')
  .upsert({
    user_id:          user.id,
    encrypted_key_id: encKeyId.ciphertext,
    key_id_iv:        encKeyId.iv,
    encrypted_secret: encSecret.ciphertext,
    secret_iv:        encSecret.iv,
    is_paper:         parsed.data.is_paper,
    updated_at:       new Date().toISOString(),
  })
```

7. On upsert error → 500
8. `logAudit({ performedBy: user.id, action: 'alpaca_credentials_connected', tripId: null })`
9. Return `NextResponse.json({ connected: true, is_paper: parsed.data.is_paper })`

**DELETE handler** (disconnect):
1. `getAuthUser()` → 401 if null
2. `user.role !== 'premium_plus'` → 403
3. Delete using `createAdminClient()`:

```ts
const { error } = await admin
  .from('alpaca_credentials')
  .delete()
  .eq('user_id', user.id)
```

4. On error → 500
5. `logAudit({ performedBy: user.id, action: 'alpaca_credentials_disconnected', tripId: null })`
6. Return `new NextResponse(null, { status: 204 })`

---

### T011 — Preview API Route

**File**: `/workspaces/my-travel-assistant/src/app/api/portfolio/alpaca/preview/route.ts`
**Action**: Create

```ts
const PreviewSchema = z.object({
  recommendation_id: z.string().uuid(),
})
```

**POST handler**:
1. Auth check (`getAuthUser()`) → 401 / 403
2. Parse + validate body → 400
3. Load recommendation:

```ts
const supabase = await createClient()
const { data: rec } = await supabase
  .from('recommendations')
  .select('id, action_list, user_id')
  .eq('id', parsed.data.recommendation_id)
  .eq('user_id', user.id)
  .single()
```
→ 400 if not found

4. Check no existing execution:

```ts
const { data: existing } = await supabase
  .from('alpaca_executions')
  .select('id')
  .eq('recommendation_id', rec.id)
  .maybeSingle()
```
→ 409 if `existing !== null`

5. Load + decrypt credentials:

```ts
const admin = createAdminClient()
const { data: cred } = await admin
  .from('alpaca_credentials')
  .select('*')
  .eq('user_id', user.id)
  .maybeSingle()
```
→ 404 if `cred === null`

```ts
const keyId  = decryptCredential(cred.encrypted_key_id, cred.key_id_iv)
const secret = decryptCredential(cred.encrypted_secret, cred.secret_iv)
```

6. Extract non-hold tickers from `rec.action_list` (filter `action !== 'hold'`)
7. `fetchQuotes(tickers, keyId, secret, cred.is_paper)` — wrap in try/catch → 502 on throw
8. For each sell item: `fetchPosition(ticker, keyId, secret, cred.is_paper)` — run sequentially
9. Compute preview items:

```ts
export interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}
```

For each non-hold `ActionItem`:
- `ask_price = quotes[item.ticker] ?? 0`
- `positionQty = side === 'sell' ? (fetched position) : 0`
- `qty = computeOrderQty(item.delta_usd, ask_price, positionQty, item.action)`
- `skipped = qty === 0`
- `skip_reason = skipped ? 'Too small to execute' : null`
- `estimated_value = qty * ask_price`

`hold` items are excluded entirely from the response array.

10. Return:

```ts
return NextResponse.json({
  is_market_open: isNYSEOpen(),
  is_paper: cred.is_paper,
  preview: previewItems,
})
```

---

### T012 — Execute API Route

**File**: `/workspaces/my-travel-assistant/src/app/api/portfolio/alpaca/execute/route.ts`
**Action**: Create

```ts
const ExecuteSchema = z.object({
  recommendation_id: z.string().uuid(),
})
```

**POST handler**:
1. Auth check → 401 / 403
2. Parse + validate → 400
3. Load recommendation (same query as preview) → 400 if not found
4. 409 guard on existing execution (same as preview)
5. Load + decrypt credentials → 404 if missing
6. Fetch quotes + positions and compute qtys (same logic as preview)
7. Separate into submittable vs skipped:
   - `skippedItems`: `qty === 0` items → status `'skipped'`, no Alpaca call
   - `sellItems`: non-skipped sells → submit first
   - `buyItems`: non-skipped buys → submit second
8. Submit sequentially (sells then buys). For each, call `submitOrder(...)`. **Never abort on failure** — capture each result.
9. Build the `orders` JSONB array — **include ALL non-hold items** (skipped + submitted):

```ts
const orders: AlpacaOrderResult[] = [
  ...skippedItems.map(item => ({
    ticker: item.ticker,
    action: item.action,
    qty: 0,
    price_at_execution: quotes[item.ticker] ?? 0,
    estimated_value: 0,
    alpaca_order_id: null,
    status: 'skipped' as const,
    error_message: null,
  })),
  ...submittedResults,  // from sell + buy loops
]
```

10. Insert execution record using `createAdminClient()`:

```ts
const admin = createAdminClient()
const { data: execution, error: insertError } = await admin
  .from('alpaca_executions')
  .insert({
    recommendation_id: rec.id,
    user_id: user.id,
    is_paper: cred.is_paper,
    orders,
  })
  .select()
  .single()
```
→ 500 on insert error (this is a fatal failure — no execution record written)

11. `logAudit({ performedBy: user.id, action: 'alpaca_executed', tripId: null })`
12. Return:

```ts
return NextResponse.json({
  execution_id:  execution.id,
  executed_at:   execution.executed_at,
  is_paper:      execution.is_paper,
  orders:        execution.orders,
})
```

---

## Frontend Tasks

### T009 — `AlpacaCredentialsForm.tsx`

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/AlpacaCredentialsForm.tsx`
**Action**: Create

```ts
'use client'

interface Props {
  initialConnected: boolean
  initialIsPaper: boolean
}
```

State variables:
- `connected: boolean` (init from `initialConnected`)
- `isPaper: boolean` (init from `initialIsPaper`)
- `keyId: string` (init `''`)
- `secretKey: string` (init `''`)
- `saving: boolean` (init `false`)

**Connected state** — render a card (`background: 'white', borderRadius: 'var(--r-xl)', border: '1px solid var(--rule)', padding: '28px', maxWidth: 480`) containing:
- Green badge chip: `background: '#dcfce7', color: '#16a34a'` — text: `Connected (${isPaper ? 'Paper' : 'Live'})`
- Disconnect button: calls `DELETE /api/portfolio/alpaca/credentials`, sets `connected = false` on success, toast on error. Style matches save button when disabled: `background: '#fee2e2', color: '#dc2626'`

**Not connected state** — same card wrapper containing:
- Label + input for Key ID (`type="text"`, `autoComplete="off"`)
- Label + input for Secret Key (`type="password"`, `autoComplete="new-password"`)
- Paper Trading toggle: a `<label>` wrapping a `<input type="checkbox">` checked to `isPaper`; label text: `Paper Trading (recommended)`
- Connect button: calls `POST /api/portfolio/alpaca/credentials`, sets `connected = true` and `isPaper` from response on success, toast on error. Disabled when `keyId.trim() === ''` or `secretKey.trim() === ''` or `saving`.

Use the same `inputStyle`, `focusHandlers`, and `labelStyle` patterns from `PortfolioSettingsForm.tsx`. Copy them locally into this file (do not import — they are not exported from that file).

Import `useToast` from `@/context/ToastContext`. Call `toast('Alpaca account connected', 'success')` / `toast('Failed to connect', 'error')` etc.

---

### T010 — Settings Page Update

**File**: `/workspaces/my-travel-assistant/src/app/portfolio/settings/page.tsx`
**Action**: Modify

After the existing `supabase` client is created and settings are resolved, add:

```ts
const { data: alpacaCred } = await supabase
  .from('alpaca_credentials')
  .select('is_paper')
  .eq('user_id', user.id)
  .maybeSingle()
```

Then in the JSX, after `<PortfolioSettingsForm initialSettings={settings ?? defaultSettings} />`, add:

```tsx
<div style={{ marginTop: 32 }}>
  <h2 style={{
    fontFamily: 'var(--display)',
    fontWeight: 700,
    fontSize: 20,
    color: 'var(--ink)',
    marginBottom: 8,
  }}>
    Alpaca Connection
  </h2>
  <p style={{ color: 'var(--ink-3)', fontSize: 14, marginBottom: 16 }}>
    Connect your Alpaca account to execute trades from recommendations.
  </p>
  <AlpacaCredentialsForm
    initialConnected={!!alpacaCred}
    initialIsPaper={alpacaCred?.is_paper ?? true}
  />
</div>
```

Import `AlpacaCredentialsForm` from `@/components/portfolio/AlpacaCredentialsForm`.

Note: never select `encrypted_key_id`, `encrypted_secret`, or IV columns here — only `is_paper` is safe to pass to the client.

---

### T013 — `AlpacaOrderPreview.tsx`

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/AlpacaOrderPreview.tsx`
**Action**: Create

This is a pure display component. No `'use client'` needed (no event handlers).

```ts
interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}

interface Props {
  preview: OrderPreviewItem[]
}
```

Render a `<table>` with columns: **Ticker | Action | Qty | Ask Price | Est. Value**

Table styles mirror `ActionList.tsx`:
- Container: `overflowX: 'auto'`
- Table: `width: '100%', borderCollapse: 'collapse', fontSize: 14, fontFamily: 'var(--sans)'`
- Header row: `borderBottom: '2px solid var(--rule)'`, header cells use `fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)'`
- Body rows: `borderBottom: '1px solid var(--rule)'`

Skipped rows: wrap the entire `<tr>` with `opacity: 0.4`. In the Qty cell, render `skip_reason` (`'Too small to execute'`) as grey italic text instead of the number.

Action chips: reuse the same chip style objects from `ActionList.tsx` for `buy` and `sell`. Copy them locally — do not import from `ActionList`.

Empty state (all items skipped or `preview.length === 0`): render `<p>No actionable orders</p>` — the Confirm button in `AlpacaExecuteButton` must be disabled in this case.

`hold` items must never appear here — the preview API route excludes them. Defensive check: filter `item.action !== 'hold'` in the render loop anyway.

---

### T014 — `AlpacaExecuteButton.tsx`

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/AlpacaExecuteButton.tsx`
**Action**: Create

```ts
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import AlpacaOrderPreview from './AlpacaOrderPreview'

interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}

interface Props {
  recommendationId: string
  hasCredentials: boolean
  isPaper: boolean
  isLatest: boolean
  alreadyExecuted: boolean
  executedAt: string | null  // ISO string — displayed as formatted date when alreadyExecuted
}
```

**State machine** — use a single `mode` state:
- `'idle'` — initial
- `'loading-preview'` — fetching preview
- `'preview-ready'` — modal open, showing table
- `'submitting'` — confirm clicked, orders being submitted
- `'done'` — execution complete (triggers router.refresh())

Plus state: `preview: OrderPreviewItem[] | null`, `isMarketOpen: boolean`, `isPaperLocal: boolean`

**Render logic**:
1. If `!isLatest`: return `null` (render nothing — older recommendations show no button at all)
2. If `alreadyExecuted`: render disabled button `"Executed on [formatted executedAt date]"` with PAPER chip if `isPaper`. No modal, no click handler.
3. If `!hasCredentials`: render disabled button with text `"Connect Alpaca in Settings"` and an `<a href="/portfolio/settings">` styled link beside it (or as the button text with a `→` suffix).
4. Otherwise: render active `"Execute trades"` button with PAPER chip. On click: set `mode = 'loading-preview'`, fetch preview, set `mode = 'preview-ready'`.

**PAPER badge chip**: `{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 11, display: 'inline-block', fontFamily: 'var(--sans)', marginLeft: 8 }` — blue tones, not green (paper ≠ real money).

**Modal**: When `mode === 'preview-ready'` or `'submitting'`:
- Overlay: `position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center'`
- Modal card: `background: 'white', borderRadius: 'var(--r-xl)', padding: 32, maxWidth: 700, width: '90%', maxHeight: '80vh', overflowY: 'auto'`
- Market hours warning banner (when `!isMarketOpen`): `background: '#fef9c3', border: '1px solid #ca8a04', borderRadius: 8, padding: '10px 14px', color: '#92400e', fontSize: 13, marginBottom: 16` — text: `"Markets are currently closed. Orders will queue for next market open."`
- `<AlpacaOrderPreview preview={preview ?? []} />`
- Confirm button: disabled when `mode === 'submitting'` or all preview items are skipped. On click: set `mode = 'submitting'`, POST to `/api/portfolio/alpaca/execute`, on success set `mode = 'done'` and call `router.refresh()`. On error: set `mode = 'preview-ready'`, toast error.
- Cancel button: closes modal, resets to `mode = 'idle'`

After `router.refresh()`: the modal can stay closed. The page re-fetches server component data and `AlpacaResultsPanel` appears.

**All preview items skipped check**: `const allSkipped = (preview ?? []).every(item => item.skipped)` — disable the Confirm button and show the `<AlpacaOrderPreview>` with the empty-state message.

---

### T015 — Recommendations Page Update

**File**: `/workspaces/my-travel-assistant/src/app/portfolio/recommendations/[id]/page.tsx`
**Action**: Modify

After the existing `rec` fetch, add three parallel queries:

```ts
const [latestRecResult, executionResult, credResult] = await Promise.all([
  supabase
    .from('recommendations')
    .select('id')
    .eq('user_id', authUser.id)
    .eq('status', 'complete')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
  supabase
    .from('alpaca_executions')
    .select('*')
    .eq('recommendation_id', id)
    .maybeSingle(),
  supabase
    .from('alpaca_credentials')
    .select('is_paper')
    .eq('user_id', authUser.id)
    .maybeSingle(),
])

const isLatest = latestRecResult.data?.id === id
const execution = (executionResult.data ?? null) as AlpacaExecution | null
const hasCredentials = !!credResult.data
const isPaper = credResult.data?.is_paper ?? true
```

Import `AlpacaExecution` from `@/types/database`.

Pass the four new props to `RecommendationDetail`:

```tsx
<RecommendationDetail
  recommendation={rec as Recommendation}
  recommendationId={id}
  isLatest={isLatest}
  hasCredentials={hasCredentials}
  isPaper={isPaper}
  execution={execution}
/>
```

---

### T016 + T018 — `RecommendationDetail.tsx` Update

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/RecommendationDetail.tsx`
**Action**: Modify

Update the `Props` interface:

```ts
import { AlpacaExecution, Recommendation } from '@/types/database'
import AlpacaExecuteButton from './AlpacaExecuteButton'
import AlpacaResultsPanel from './AlpacaResultsPanel'

interface Props {
  recommendation: Recommendation
  recommendationId: string
  isLatest: boolean
  hasCredentials: boolean
  isPaper: boolean
  execution: AlpacaExecution | null
}
```

In the "Recommended Actions" `<section>`:

```tsx
<section style={{ marginBottom: 32 }}>
  <h2 style={{ ... }}>Recommended Actions</h2>
  <AlpacaExecuteButton
    recommendationId={recommendationId}
    hasCredentials={hasCredentials}
    isPaper={isPaper}
    isLatest={isLatest}
    alreadyExecuted={execution !== null}
    executedAt={execution?.executed_at ?? null}
  />
  {execution !== null && (
    <AlpacaResultsPanel execution={execution} />
  )}
  <ActionList actionList={recommendation.action_list ?? []} />
</section>
```

Render order within the section:
1. `<h2>` heading
2. `<AlpacaExecuteButton>` (renders nothing when `!isLatest`)
3. `<AlpacaResultsPanel>` (conditional — only when `execution !== null`)
4. `<ActionList>`

No other sections are modified.

---

### T017 — `AlpacaResultsPanel.tsx`

**File**: `/workspaces/my-travel-assistant/src/components/portfolio/AlpacaResultsPanel.tsx`
**Action**: Create

No `'use client'` — this is server-renderable.

```ts
import { AlpacaExecution, AlpacaOrderResult } from '@/types/database'

interface Props {
  execution: AlpacaExecution
}
```

Render a card (`background: 'white', borderRadius: 'var(--r-xl)', border: '1px solid var(--rule)', padding: '28px', marginTop: 16, marginBottom: 24`):

**Card header row** (flex, space-between, align-center):
- Left: `<h3>Execution Results</h3>` in display font, 16px, fontWeight 700
- Right: formatted date from `execution.executed_at` using `new Date(execution.executed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })`
- PAPER chip (blue: `background: '#dbeafe', color: '#1d4ed8'`) rendered when `execution.is_paper` — positioned after the heading, inline.

**Table** — columns: **Ticker | Action | Qty | Status | Order ID**

Status chip styles:
- `submitted`: `background: '#dcfce7', color: '#16a34a'` — text "Submitted"
- `rejected`: `background: '#fee2e2', color: '#dc2626'` — text "Rejected"
- `error`: `background: '#fef3c7', color: '#d97706'` — text "Error"
- `skipped`: `background: '#f3f4f6', color: '#6b7280'` — text "Skipped"

Order ID cell: `fontFamily: 'var(--mono)', fontSize: 12`. Truncate to first 8 chars with ellipsis: `orderId.slice(0, 8) + '...'` — wrap in a `title` attribute for full ID on hover. Show `—` when `alpaca_order_id` is null.

Error message: when `row.error_message !== null`, render as a `<div>` below the row cells (using `colSpan={5}`) with `fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic', paddingTop: 4`.

Empty state (no orders in `execution.orders`): render `<p>No orders were submitted.</p>`.

---

## Test Tasks

### T006 — `alpacaOrderCalculator.test.ts`

**File**: `/workspaces/my-travel-assistant/src/lib/alpacaOrderCalculator.test.ts`
**Action**: Create

See detailed test cases above in T006 backend section. Summary:

`computeOrderQty` must cover:
- Normal buy floor
- Buy too small → 0
- Zero delta → 0
- Zero/negative price guard → 0
- Normal sell floor (within position)
- Sell capped at position
- Sell too small → 0
- Sell with zero position → 0

`isNYSEOpen` must cover (using `vi.useFakeTimers`):
- Weekend → false
- Before 9:30 ET → false
- Exactly 9:30 ET → true
- Midday weekday → true
- Exactly 16:00 ET → false
- After 16:00 ET → false

These are the only testable pure functions in this feature. `alpacaCrypto.ts` and `alpacaClient.ts` are not pure (env vars, network) and must not be tested with Vitest per project conventions.

---

## Acceptance Criteria

- [ ] `npm run build` passes with zero TypeScript errors after all changes
- [ ] `npm test` passes — T006 suite (14+ test cases) all green
- [ ] `npm run lint` — zero ESLint warnings or errors
- [ ] No `console.log` in any new or modified file
- [ ] Migration file exists at `supabase/migrations/20260619_alpaca_trade_execution.sql`
- [ ] `ALPACA_CREDENTIAL_ENCRYPTION_KEY` is NOT committed to `.env.local` or any tracked file
- [ ] `/portfolio/settings` shows "Alpaca Connection" card below existing settings card for `premium_plus` users
- [ ] Connecting credentials: POST encrypts both values, upserts row, logs audit `alpaca_credentials_connected`
- [ ] Disconnecting: DELETE removes row, logs audit `alpaca_credentials_disconnected`, card returns to input form
- [ ] Credential state persists on page reload (connected state shown on revisit)
- [ ] Most recent complete recommendation shows "Execute trades" button with PAPER chip
- [ ] Older recommendations show no execute button (neither active nor disabled)
- [ ] No credentials → disabled button with settings link, no modal
- [ ] Preview modal opens within 3 seconds, shows live prices from Alpaca
- [ ] Zero-qty items appear greyed out with "Too small to execute" — never submitted
- [ ] Market-closed banner appears when `is_market_open: false`
- [ ] Sells submitted before buys in execute route
- [ ] Partial Alpaca failures recorded per-order; execution record always written on success of the insert
- [ ] After execution: `router.refresh()` causes server re-fetch, results panel appears without full reload
- [ ] Results panel persists on hard page reload
- [ ] Already-executed recommendation: disabled "Executed on [date]" button + results panel; no execute modal
- [ ] Results panel shows correct status chips: green/red/amber/grey per order status
- [ ] `hold` items never appear in preview or results panel
- [ ] 409 returned by both preview and execute if recommendation already executed (prevents duplicate submission)

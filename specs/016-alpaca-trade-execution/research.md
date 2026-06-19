# Research: Alpaca Trade Execution

## Alpaca REST API v2

**Decision**: Use Alpaca REST API v2 (`https://paper-api.alpaca.markets/v2` for paper, `https://api.alpaca.markets/v2` for live).

**Auth**: Every request includes two headers:
```
APCA-API-KEY-ID: <key_id>
APCA-API-SECRET-KEY: <secret_key>
```

**Endpoints used**:

| Endpoint | Method | Purpose |
|---|---|---|
| `/v2/stocks/quotes/latest?symbols=AAPL,MSFT` | GET | Fetch latest NBBO quotes for multiple tickers in one call |
| `/v2/positions/{symbol}` | GET | Get actual qty held for a specific ticker (returns 404 if not held) |
| `/v2/orders` | POST | Submit a single order |

**Quote response shape** (key fields):
```json
{
  "quotes": {
    "AAPL": { "ap": 185.25 }
  }
}
```
`ap` = ask price (used for buys). `bp` = bid price. We use `ap` for buys and `bp` for sells for a conservative estimate, or simply `ap` for both (simpler; fine for paper trading). Decision: use `ap` (ask price) for all estimates since it's the most conservative and simplest.

**Position response shape** (key fields):
```json
{
  "symbol": "AAPL",
  "qty": "12",
  "market_value": "2223.00"
}
```
Returns 404 if the symbol is not held. We handle 404 as qty=0 (safe — sell skipped).

**Order request shape**:
```json
{
  "symbol": "AAPL",
  "qty": "3",
  "side": "buy",
  "type": "market",
  "time_in_force": "day"
}
```
`qty` is a string (Alpaca accepts both string and number). Use whole integers (no fractional shares).

**Order response shape** (key fields):
```json
{
  "id": "alpaca-order-uuid",
  "status": "accepted",
  "symbol": "AAPL",
  "qty": "3",
  "side": "buy"
}
```

**Error responses**: Alpaca returns 4xx with `{"message": "..."}` for rejections (e.g. insufficient buying power). We capture the message as `error_message` in the execution record.

---

## Qty Calculation

**Decision**: `qty = Math.floor(Math.abs(delta_usd) / ask_price)`. Integer division, no fractional shares. For sells, cap at `Math.min(computed_qty, position_qty_held)`. Items where qty=0 after calculation are skipped (not submitted).

**Rationale**: Whole-share orders avoid fractional share account requirements. Floor division is conservative (never over-buys). Capping sells prevents over-sell rejections.

---

## NYSE Market Hours Detection

**Decision**: Check server-side whether current UTC time falls within Mon–Fri 9:30am–4:00pm US/Eastern. The preview API route returns an `is_market_open: boolean` field alongside the order previews. The frontend renders the warning banner based on this flag.

**Implementation**: Convert current UTC to US/Eastern using the `Intl` API (no extra library needed):
```ts
function isNYSEOpen(): boolean {
  const now = new Date()
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etTime.getDay() // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const totalMinutes = hours * 60 + minutes
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60
}
```

---

## Credential Encryption

**Decision**: AES-256-GCM (same as `src/lib/gmailCrypto.ts`). New file `src/lib/alpacaCrypto.ts` using a new env var `ALPACA_CREDENTIAL_ENCRYPTION_KEY` (32-byte base64). Encrypt key_id and secret_key separately, each with its own random 12-byte IV.

**Rationale**: Mirrors the established pattern exactly. Independent key allows rotation without affecting Gmail tokens.

---

## Audit Logging

**Decision**: Add three new `AuditAction` values: `alpaca_credentials_connected`, `alpaca_credentials_disconnected`, `alpaca_executed`. The `logAudit()` call on credentials routes uses `trip_id: null` and `trip_snapshot: null` — the audit table permits nulls here (used by existing portfolio routes too).

**Rationale**: Constitution Principle III is trip-specific in its wording, but the existing codebase extends audit logging to portfolio actions. Consistency demands we do the same.

---

## "Most Recent Recommendation" Check

**Decision**: The recommendation page server component queries:
```sql
SELECT id FROM recommendations
WHERE user_id = $1 AND status = 'complete'
ORDER BY run_at DESC
LIMIT 1
```
If the current recommendation's `id` equals this result, it is the most recent — show the execute button. The `alpaca_executions` table provides `executed_at` — if a row exists for this recommendation, show the results panel and disabled button instead.

---

## Alternatives Considered

- **Notional orders**: Rejected (user decision — fractional shares not required, whole-share qty is simpler)
- **Polygon.io for prices**: Rejected — Alpaca quote endpoint is already authenticated with the user's key, no extra API key needed
- **Re-execution**: Rejected (user decision — one execution per recommendation)
- **Vercel timeout risk**: The execute API route submits orders sequentially. With up to ~10 orders and Alpaca's fast response, total time should be well under 30s. No special handling needed.

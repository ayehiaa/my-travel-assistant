# API Contracts: Alpaca Trade Execution

All routes require `premium_plus` role.
Auth pattern: `supabase.auth.getUser()` → 401 if null → role check → 403 if not `premium_plus`.
All request bodies validated with Zod before any business logic.

---

## Credentials

### `POST /api/portfolio/alpaca/credentials`
Connect (or replace) Alpaca credentials for the authenticated user.

**Request**:
```json
{
  "key_id": "PKABCDEF123456",
  "secret_key": "aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd",
  "is_paper": true
}
```

**Zod schema**:
- `key_id`: non-empty string, max 100 chars
- `secret_key`: non-empty string, max 200 chars
- `is_paper`: boolean, default `true`

**Behaviour**: Upsert into `alpaca_credentials` (user_id is the PK). Encrypts both values using `alpacaCrypto.ts` before storing. Calls `logAudit({ action: 'alpaca_credentials_connected', ... })`.

**Response 200**: `{ connected: true, is_paper: boolean }`
**Response 400**: Zod validation failure
**Response 401**: not authenticated
**Response 403**: not `premium_plus`
**Response 500**: DB or encryption error

---

### `DELETE /api/portfolio/alpaca/credentials`
Disconnect (delete) the user's Alpaca credentials.

**Request**: no body

**Behaviour**: Deletes the `alpaca_credentials` row for this user. Calls `logAudit({ action: 'alpaca_credentials_disconnected', ... })`. Returns 204 even if no row existed (idempotent).

**Response 204**: no body
**Response 401**: not authenticated
**Response 403**: not `premium_plus`
**Response 500**: DB error

---

## Order Preview

### `POST /api/portfolio/alpaca/preview`
Fetch live prices from Alpaca and compute the order preview for a recommendation's action list. Called when the confirmation modal opens.

**Request**:
```json
{ "recommendation_id": "uuid" }
```

**Zod schema**: `recommendation_id` non-empty UUID string.

**Behaviour**:
1. Load the recommendation's `action_list` (verify it belongs to this user).
2. Verify no `alpaca_executions` row exists for this recommendation (return 409 if already executed).
3. Decrypt credentials and call Alpaca `GET /v2/stocks/quotes/latest?symbols=AAPL,MSFT,...` for all non-hold tickers.
4. For sell tickers: call Alpaca `GET /v2/positions/{symbol}` to get held qty (404 → 0).
5. Compute qty for each item: buys = `floor(delta_usd / ask_price)`, sells = `min(floor(|delta_usd| / ask_price), position_qty)`.
6. Compute `is_market_open` using NYSE hours logic.
7. Return preview rows including skipped items.

**Response 200**:
```json
{
  "is_market_open": true,
  "is_paper": true,
  "preview": [
    {
      "ticker": "AAPL",
      "action": "buy",
      "qty": 3,
      "ask_price": 185.25,
      "estimated_value": 555.75,
      "skipped": false,
      "skip_reason": null
    },
    {
      "ticker": "NVDA",
      "action": "sell",
      "qty": 0,
      "ask_price": 875.00,
      "estimated_value": 0,
      "skipped": true,
      "skip_reason": "Too small to execute"
    }
  ]
}
```

**Response 400**: Zod validation failure, or recommendation not found / not owned by user
**Response 401**: not authenticated
**Response 403**: not `premium_plus`
**Response 404**: no Alpaca credentials connected
**Response 409**: recommendation already executed
**Response 502**: Alpaca API error (quote fetch failed)

---

## Execute Orders

### `POST /api/portfolio/alpaca/execute`
Submit orders to Alpaca for all non-skipped items in a recommendation's action list.

**Request**:
```json
{ "recommendation_id": "uuid" }
```

**Zod schema**: `recommendation_id` non-empty UUID string.

**Behaviour**:
1. Load recommendation and verify ownership.
2. Verify no `alpaca_executions` row exists (return 409 if already executed).
3. Decrypt credentials, fetch live prices (same as preview), compute qtys.
4. Filter: skipped items (qty=0 or hold) excluded from submission.
5. Submit sell orders first sequentially, then buy orders sequentially.
6. For each order: POST to Alpaca `/v2/orders`. Capture `alpaca_order_id`, `status`, `error_message` per order. Continue on per-order failures.
7. Insert `alpaca_executions` row (admin client) with all order results.
8. Call `logAudit({ action: 'alpaca_executed', ... })`.

**Response 200**:
```json
{
  "execution_id": "uuid",
  "executed_at": "2026-06-19T10:30:00Z",
  "is_paper": true,
  "orders": [
    {
      "ticker": "AAPL",
      "action": "buy",
      "qty": 3,
      "price_at_execution": 185.25,
      "estimated_value": 555.75,
      "alpaca_order_id": "abc123",
      "status": "submitted",
      "error_message": null
    }
  ]
}
```

**Response 400**: Zod validation failure, or recommendation not found / not owned
**Response 401**: not authenticated
**Response 403**: not `premium_plus`
**Response 404**: no Alpaca credentials connected
**Response 409**: recommendation already executed
**Response 502**: all orders failed (Alpaca unreachable) — partial failures still return 200 with per-order statuses
**Response 500**: DB error saving execution record

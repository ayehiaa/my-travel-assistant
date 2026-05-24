# API Contracts: Portfolio Advisor Module

All routes require `premium_plus` role. All responses use `application/json`.
Auth pattern: check `supabase.auth.getUser()` → 401 if null. Check role → 403 if not `premium_plus`.

---

## T&C Gate

### `POST /api/portfolio/tos-accept`
Accept the financial disclaimer. Sets `portfolio_tos_accepted_at` on `user_profiles`.

**Request**: `{}` (empty body)
**Response 200**: `{ accepted_at: string }`
**Response 401**: not authenticated
**Response 403**: not `premium_plus`

---

## Holdings

### `GET /api/portfolio/holdings`
Returns all holdings for the authenticated user, ordered by `total_value_usd DESC`.

**Response 200**:
```json
{
  "holdings": [
    { "id": "uuid", "ticker": "AAPL", "company_name": "Apple Inc.", "total_value_usd": 10000.00 }
  ],
  "total_holdings_usd": 45000.00
}
```

### `POST /api/portfolio/holdings`
Add a new holding. Fails if ticker already exists for this user.

**Request**:
```json
{ "ticker": "AAPL", "company_name": "Apple Inc.", "total_value_usd": 10000.00 }
```
**Zod schema**: `ticker` non-empty string max 10 chars, `company_name` non-empty string max 100 chars, `total_value_usd` positive number.
**Response 201**: `{ holding: PortfolioHolding }`
**Response 400**: validation error or duplicate ticker
**Response 409**: ticker already exists for this user

### `PUT /api/portfolio/holdings/[id]`
Update `total_value_usd` for an existing holding.

**Request**: `{ "total_value_usd": 12500.00 }`
**Response 200**: `{ holding: PortfolioHolding }`
**Response 404**: holding not found or belongs to another user

### `DELETE /api/portfolio/holdings/[id]`
Remove a holding.

**Response 204**: no body
**Response 404**: holding not found or belongs to another user

---

## Ticker Autocomplete

### `GET /api/portfolio/tickers/search?q={query}`
Proxy to Polygon.io ticker search. Returns top 10 matches.

**Query param**: `q` — min 1 char
**Response 200**:
```json
{
  "results": [
    { "ticker": "AAPL", "name": "Apple Inc.", "primary_exchange": "XNAS" }
  ]
}
```
**Response 400**: missing `q` param

---

## Portfolio Settings

### `GET /api/portfolio/settings`
Returns the user's portfolio settings. Creates a default row if none exists.

**Response 200**: `{ settings: PortfolioSettings }`

### `PUT /api/portfolio/settings`
Update portfolio configuration.

**Request**:
```json
{
  "cash_usd": 5000.00,
  "target_return_pct": 12.0,
  "risk_profile": "moderate",
  "run_interval_days": 30
}
```
**Zod schema**: all fields optional partial update; `risk_profile` enum; `run_interval_days` in `[7, 14, 30]`; `cash_usd` ≥ 0; `target_return_pct` > 0.
**Response 200**: `{ settings: PortfolioSettings }`

---

## Analysis Runs

### `POST /api/portfolio/run`
Trigger a manual analysis run. Enforces 24-hour cooldown.

**Request**: `{}` (empty body)
**Response 202**:
```json
{ "run_id": "uuid" }
```
**Response 429**: within cooldown window
```json
{ "error": "Cooldown active", "retry_after_seconds": 3600 }
```
**Response 400**: no holdings defined, or portfolio total value is 0

**Side effects**:
1. Inserts a `recommendations` row with `status: 'running'`
2. Inserts 7 `run_progress` rows (one per agent) with `status: 'pending'`
3. Updates `portfolio_settings.last_run_at` to now
4. Sends Inngest event `portfolio/analysis.requested` with `{ run_id, user_id }`

### `GET /api/portfolio/run/[id]/progress`
Poll for run progress. Returns agent statuses and overall run status.

**Response 200**:
```json
{
  "run_id": "uuid",
  "status": "running",
  "agents": [
    { "agent_name": "macroeconomics", "status": "complete", "completed_at": "2026-05-24T10:01:00Z" },
    { "agent_name": "fed_rates",      "status": "running",  "completed_at": null },
    { "agent_name": "geopolitics",    "status": "pending",  "completed_at": null }
  ]
}
```
**Response 404**: run not found or belongs to another user

---

## Recommendations

### `GET /api/portfolio/recommendations`
List all past recommendations for the user, newest first.

**Response 200**:
```json
{
  "recommendations": [
    {
      "id": "uuid",
      "run_at": "2026-05-24T10:00:00Z",
      "status": "complete",
      "summary_text": "Given slowing GDP growth and elevated rates...",
      "action_count": 5
    }
  ]
}
```

### `GET /api/portfolio/recommendations/[id]`
Full recommendation detail with agent outputs, allocation, and action list.

**Response 200**: `{ recommendation: Recommendation }`
**Response 404**: not found or belongs to another user

---

## Inngest Functions (internal — not HTTP API)

| Function ID | Trigger | Description |
|---|---|---|
| `portfolio/analysis.run` | event `portfolio/analysis.requested` | Main orchestrator: fetch data, run 7 agents in parallel, call synthesizer, compute action list, mark complete |
| `portfolio/summarize` | event `portfolio/run.completed` | Call Haiku to compress recommendation into 200–300 token summary |
| `portfolio/notify.email` | event `portfolio/run.completed` | Send Resend email to user if run was scheduled (not manual) |
| `portfolio/schedule.check` | cron `0 9 * * *` (daily 09:00 UTC) | Check all users with `next_run_at <= now()` and emit `portfolio/analysis.requested` |

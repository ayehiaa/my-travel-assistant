# External API Contract: frankfurter.app

**Base URL**: `https://api.frankfurter.app`
**Auth**: None (no API key)
**Rate limits**: None documented; reasonable use expected

## Endpoints used

### Historical rates

```
GET /{date}?from=GBP&to={currencies}
```

| Parameter | Type | Example | Notes |
|-----------|------|---------|-------|
| `date` | path `YYYY-MM-DD` | `2024-01-15` | Must be a past business day |
| `from` | query | `GBP` | Base currency (always GBP) |
| `to` | query | `USD,EUR,JPY` | Comma-separated target currencies |

**Success response** (200):
```json
{
  "amount": 1,
  "base": "GBP",
  "date": "2024-01-15",
  "rates": {
    "EUR": 1.1673,
    "JPY": 188.53,
    "USD": 1.2732
  }
}
```

**To convert expense amount in USD to GBP**:
```
gbpAmount = expenseAmount / rates["USD"]
```

**Error cases**:
- `404` — date not found (weekend/holiday with no ECB data) → use `latest` endpoint as fallback
- `422` — unknown currency code → exclude those expenses, increment `unconvertibleCount`
- Network error / timeout → exclude affected date's expenses, increment `unconvertibleCount`

### Latest rates (fallback for today or very recent dates)

```
GET /latest?from=GBP&to={currencies}
```

Same response shape. Use when the specific date returns 404 (ECB doesn't publish weekend/holiday rates).

## Caching

| Date type | `revalidate` |
|-----------|-------------|
| Historical (past) | 31 536 000 s (1 year) — rates never change |
| Today | 3 600 s (1 hour) — may update intra-day |

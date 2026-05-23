# Research: GBP-Normalised Expense Chart

## Decision 1: Currency exchange API

**Decision**: Use [frankfurter.app](https://api.frankfurter.app)

**Rationale**:
- Free, no API key, no registration
- Backed by ECB (European Central Bank) daily rates
- Supports historical rates by date: `GET /2024-01-15?from=GBP&to=USD,EUR`
- Supports multiple target currencies in one call (batch by date, not per expense)
- CORS-safe when called server-side
- Rates are stable for past dates → cacheable indefinitely

**Alternatives considered**:
- `open.er-api.com` — free tier, but requires registration and has monthly call limits
- `exchangerate.host` — deprecated free tier
- `api.fixer.io` — requires paid plan for historical rates
- Anthropic API — explicitly excluded by user requirement

**API contract**:
```
GET https://api.frankfurter.app/{date}?from=GBP&to=USD,EUR,JPY
Response: { "amount": 1, "base": "GBP", "date": "2024-01-15", "rates": { "USD": 1.2732, "EUR": 1.1673, "JPY": 188.53 } }

GET https://api.frankfurter.app/latest?from=GBP&to=USD
Response: { "amount": 1, "base": "GBP", "date": "2025-05-22", "rates": { "USD": 1.2741 } }
```

To convert `amount` in `USD` to GBP: `amount × (1 / rates.USD)`

---

## Decision 2: Where to fetch rates

**Decision**: Server component (`ExpensesPage`) fetches rates before passing to client components.

**Rationale**:
- `ExpensesPage` is already a server component that fetches all expense data
- Adding a parallel `buildGbpRates(expenses)` call there keeps conversion server-side
- No new API routes needed
- Rate map is serialisable as `Record<string, Record<string, number>>` for the server→client prop boundary
- Avoids CORS concerns entirely

**Alternatives considered**:
- New `/api/expenses/fx-rates` API route — adds latency (extra round-trip from browser), unnecessary complexity
- Client-side fetch in `ExpenseCategoryChart` — CORS issues with some browsers, harder to cache

---

## Decision 3: Caching strategy

**Decision**: Use Next.js `fetch` cache with `revalidate`.

**Rationale**:
- Historical rates (past dates) never change → `revalidate: 31536000` (1 year)
- Today's rate may update intra-day → `revalidate: 3600` (1 hour)
- Next.js deduplicates identical `fetch` calls within the same render, so no in-memory cache needed

**Implementation**:
```ts
const isToday = date === new Date().toISOString().slice(0, 10)
const revalidate = isToday ? 3600 : 31536000
const res = await fetch(url, { next: { revalidate } })
```

---

## Decision 4: Batching strategy

**Decision**: One frankfurter.app call per unique expense date that has non-GBP expenses.

**Rationale**:
- Each call can include multiple target currencies: `?from=GBP&to=USD,EUR,JPY`
- A user with 100 USD and EUR expenses across 5 months = 5 calls, not 100
- Calls are parallelised with `Promise.all`

**Worst case**: 24 unique dates × 1 call each = 24 parallel calls. With Next.js caching, subsequent page loads cost 0 calls (all cached).

---

## Decision 5: Error/fallback strategy

**Decision**: Graceful per-date fallback — if a date's rate fetch fails, those expenses are excluded from the chart and counted as "unconvertible". If all conversions fail, the chart shows GBP-only with a message.

**Rationale**:
- Partial failure (one bad date) should not break the entire chart
- The old GBP-only behaviour is the safe fallback
- User sees a clear message rather than a broken or empty chart

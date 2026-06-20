# Spec — Alpaca Portfolio Sync (017)

## Problem
After executing trades through Alpaca, `portfolio_holdings` in Supabase is never updated. The next portfolio analysis recommendation runs on stale data — wrong `current_usd`, wrong `current_pct`, potentially recommending the same trades again. The portfolio page also shows stale holdings after trades.

## Goal
Keep `portfolio_holdings` in sync with live Alpaca positions so the portfolio page always reflects reality and future recommendations are accurate.

## User Stories

**US-1 — Portfolio page is always fresh**
As a premium_plus user with Alpaca connected, when I open the portfolio page after trades have filled (even overnight), I see the current share counts and values from Alpaca — not the pre-trade state.

**US-2 — Manual sync**
As a premium_plus user, I can press "Sync now" at any time to pull the latest positions from Alpaca without waiting for the next page load.

**US-3 — Stale data warning**
As a premium_plus user, if the page-load sync fails (Alpaca down, bad credentials), I see an amber banner telling me the data may be out of date, with a "Sync now" retry button.

**US-4 — Last synced timestamp**
As a premium_plus user with Alpaca connected, I always see "Synced X minutes ago" near the holdings table so I know how fresh the data is.

**US-5 — Share count visible**
As a premium_plus user, I can see how many shares I hold per ticker in the portfolio table ("Shares" column).

**US-6 — Manual holdings preserved**
As a user with manually-entered holdings (no Alpaca), sync never deletes or overwrites those holdings — they are left untouched.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | On every portfolio page load, if the user has Alpaca credentials, call `GET /v2/positions` and reconcile with `portfolio_holdings` before rendering |
| FR-002 | `POST /api/portfolio/alpaca/sync` route triggers the same reconciliation on demand |
| FR-003 | Reconciliation rule: ticker in both Alpaca + DB → overwrite `total_value_usd`, `qty`, `updated_at` |
| FR-004 | Reconciliation rule: ticker in Alpaca only → insert new row, look up company name |
| FR-005 | Reconciliation rule: ticker in DB only → leave untouched (manual holdings preserved) |
| FR-006 | `portfolio_settings.last_synced_at` updated to `now()` on every successful sync |
| FR-007 | Portfolio page passes `lastSyncedAt` and `syncError` to `PortfolioOverview` |
| FR-008 | `PortfolioOverview` shows "Synced X minutes ago · Sync now" when Alpaca connected |
| FR-009 | Sync status line is hidden entirely when no Alpaca credentials |
| FR-010 | On sync failure: amber banner "Portfolio may be out of date — couldn't reach Alpaca" with retry |
| FR-011 | Holdings table gains a "Shares" column; shows qty (2 dp) or "—" for manual holdings |
| FR-012 | `portfolio_holdings` gains `qty numeric(12,6) NULL` column |
| FR-013 | `portfolio_settings` gains `last_synced_at timestamptz NULL` column |
| FR-014 | Sync API route requires `premium_plus` role; returns 400 if no credentials connected |
| FR-015 | After sync, re-query `portfolio_holdings` from DB (don't trust raw Alpaca response as final state) |

## Out of Scope
- Post-execution auto-sync (nice-to-have; page-load sync makes it redundant)
- Polling for order fills
- Syncing cash balance from Alpaca

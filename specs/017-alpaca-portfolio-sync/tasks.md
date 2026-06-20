# Tasks — Alpaca Portfolio Sync (017)

## Backend

- [ ] B1: Write DB migration `20260620_alpaca_portfolio_sync.sql` — add `qty numeric(12,6) NULL` to `portfolio_holdings`; add `last_synced_at timestamptz NULL` to `portfolio_settings`
- [ ] B2: Update `src/types/database.ts` — add `qty: number | null` to `PortfolioHolding`; add `last_synced_at: string | null` to `PortfolioSettings`
- [ ] B3: Create `src/lib/alpacaPortfolioSync.ts` — `syncAlpacaPositions(userId, keyId, secret, isPaper)` function: fetch `/v2/positions`, reconcile with DB (upsert existing, insert new with company name lookup, leave DB-only untouched), update `last_synced_at`, return `{ ok, lastSyncedAt? , error? }`
- [ ] B4 [depends B3]: Create `src/app/api/portfolio/alpaca/sync/route.ts` — POST, auth + premium_plus check, load+decrypt credentials, call `syncAlpacaPositions`, return result
- [ ] B5 [depends B3]: Update `src/app/portfolio/page.tsx` — after initial DB fetch, check for credentials, call `syncAlpacaPositions` server-side, catch errors, re-fetch holdings post-sync, pass `lastSyncedAt` + `syncError` + `hasAlpaca` to `PortfolioOverview`

## Frontend

- [ ] F1 [depends B2]: Update `src/components/portfolio/PortfolioOverview.tsx` — add `Shares` column to holdings table (show qty formatted to 2dp, or "—" if null); accept new props `lastSyncedAt: string | null`, `syncError: boolean`, `hasAlpaca: boolean`
- [ ] F2 [depends F1, B4]: Add sync status line to `PortfolioOverview` — "Synced X minutes ago · Sync now" button (hidden when `!hasAlpaca`); "Sync now" calls `POST /api/portfolio/alpaca/sync` then `router.refresh()`
- [ ] F3 [depends F1]: Add dismissible amber error banner to `PortfolioOverview` — shown when `syncError && hasAlpaca`; includes "Sync now" button

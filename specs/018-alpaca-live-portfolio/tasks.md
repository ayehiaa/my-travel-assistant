# Tasks: 018 Alpaca Live Portfolio

## Backend
- [x] B1 `alpacaClient.ts`: add `fetchAccount()` (`/v2/account`) and `fetchAssetNames()` (`/v2/assets/{symbol}` names)
- [x] B2 `src/lib/alpacaLivePortfolio.ts`: `loadAlpacaCredentials(userId)`, `fetchLivePortfolio(creds)`; pure `buildLiveSnapshot(positions, cash, names)` (tested)
- [x] B3 `src/lib/starterUniverse.ts`: pure `getStarterUniverse(riskProfile)` (tested)
- [x] B4 `POST /api/portfolio/run`: require credentials + non-zero live account value
- [x] B5 `portfolioAnalysis.ts`: live snapshot; candidate tickers + `is_new_portfolio` when no positions
- [x] B6 Agents: new-portfolio context line; synthesizer: build-from-cash prompt mode
- [x] B7 Remove manual holdings routes, sync route + lib, `cash_usd` from settings API

## Frontend
- [x] F1 `/portfolio` page: live data, not-connected empty state, error banner
- [x] F2 `PortfolioOverview`: read-only table, live status line + Refresh; remove HoldingForm / TickerAutocomplete
- [x] F3 `PortfolioSettingsForm`: remove Cash field

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no `console.log`

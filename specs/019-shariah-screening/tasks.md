# Tasks: 019 Shariah Screening + Stocks Only

## Pure logic (tests first-class)
- [x] T1 `src/lib/allocationUtils.ts`: extract `renormaliseAllocation`; add `capAllocation` (20% cap) and `removeTickers` (tested)
- [x] T2 `src/types/shariah.ts`: screening / ratio / financials types
- [x] T3 `src/lib/shariahRules.ts`: stocks-only, SIC blocklist, AAOIFI ratios (exact + upper bound), AI-estimate fallback, per-ticker verdict, merge + renormalise + cap, execution guard, stored-data reader (tested)
- [x] T4 `src/lib/islamicMandate.ts`: shared mandate block (tested)
- [x] T5 `src/lib/starterUniverse.ts`: individual halal-leaning common stocks, 8–12 per profile (tests updated)

## Data + AI
- [x] T6 `polygon.ts`: ticker details capture `type`, `sic_code`, `market_cap`; `fetchLatestFinancials` + pure parsers; never log URLs (tested)
- [x] T7 `src/inngest/shariahReviewer.ts`: strict prompt with real Polygon data; per-ticker Zod parsing; missing/malformed → fail (tested)
- [x] T8 Inject mandate into all 7 agents and both synthesizer prompts; new-portfolio = 6–10 stocks, max 20%

## Pipeline
- [x] T9 `portfolioAnalysis.ts`: split into `synthesize` / `validate-tickers` / `fetch-shariah-data` / `shariah-review` / `screen-and-save` steps; fail run when nothing compliant remains
- [x] T10 Non-compliant holdings → 0% → SELL with `note` reason
- [x] T11 Persist `agent_outputs.shariah_review` always + best-effort `shariah_screening` column
- [x] T12 Migration `20261120_shariah_screening.sql`

## Execution + UI
- [x] T13 Preview / execute: skip BUYs without a stored compliant verdict; old recs → refuse buys, allow sells, notice
- [x] T14 `ShariahScreeningPanel` on recommendation page (column → agent_outputs fallback); action-list notes; AgentBreakdown hardened against non-agent keys
- [x] T15 Settings: "Islamic screening — Always on" card (no toggle, documented)
- [x] T16 Alpaca safeguard: `applyAccountSafeguards()` + `POST /api/portfolio/alpaca/account-safeguards` (auth, Zod, audit) + button

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint` (0 errors); no new `console.log`

# Feature Specification: Real Return vs Target + Explicit Cash Allocation

**Created**: 2026-11-22
**Status**: Implemented
**Builds on**: `018-alpaca-live-portfolio`, `019-shariah-screening`, `020-order-execution-engine`, `021-risk-limits-kill-switch`, `028-portfolio-hub-ux-cleanup`, `030-configurable-islamic-screening`

## Summary

Two owner-approved changes to the analysis pipeline:

1. **Target tracking from the real account return.** The gap vs target fed to the synthesizer used to be the
   value-weighted 30-day Polygon price change of TODAY's holdings, annualised ×12 (ignores cash, sold positions,
   timing; noisy). It is now the account's real, time-weighted return from Alpaca's portfolio history, over a defined
   window, compounded properly. The Rebalance tab shows the same figures.
2. **Explicit cash in the allocation.** The synthesizer returns `cash_target_pct` next to the stock weights. Cash is
   never a ticker: reserved words (`CASH`, `USD`, `$`, money-market / sweep symbols, …) are converted into cash and are
   never validated, screened or bought (`CASH` is a real NASDAQ bank stock, Pathward Financial).

## User Stories

### US1 — Real return drives the target verdict (P1)
1. During a run (not for a brand-new, cash-only portfolio) the analysis step fetches
   `GET /v2/account/portfolio/history?period=3M&timeframe=1D` with the existing `fetchPortfolioHistory` client;
   credentials never leave the step, only computed metrics are returned.
2. Window = from the later of (run time of the user's first complete recommendation = programme start, now − 3 months)
   to the latest point — i.e. the shorter window. Points before the window or with no positive equity are ignored.
3. Fewer than 21 calendar days of history, or no complete recommendation yet → `insufficient_history`.
   Fetch failure / no credentials → `unavailable`. Neither ever fails the run.
4. Return is time-weighted with deposits/withdrawals excluded (method documented in `src/lib/returnMetrics.ts`):
   Alpaca's cumulative `profit_loss_pct` ratio (1+c_end)/(1+c_start)−1; fallback: chain daily returns
   (pl_i − pl_{i−1}) / equity_{i−1}; last resort: equity ratio (flagged "not deposit-adjusted").
5. ≥ 60 days: annualise by compounding `(1+r)^(365/days)−1` and compare to the annual target.
   21–59 days: compare the period return to the target prorated by compounding `(1+annual)^(days/365)−1`.
6. Monthly targets convert by compounding: `(1+m)^12−1` (previously `m × 12`; e.g. 2 %/month = 26.82 %/yr, not 24 %).
7. Synthesizer prompt: "PERFORMANCE VS TARGET" section with period, period return, (annualised return,) target
   (annual or prorated) and gap. Insufficient / unavailable → says so, forbids claiming a gap and instructs to focus on
   building / maintaining the target mix. New-portfolio prompt unchanged in this respect.
8. Per-holding ~30-day price changes stay as an input, in a separate section labelled "NOT the performance verdict".
9. The metrics are stored in `agent_outputs.return_metrics` and shown on the Rebalance view ("Performance vs target")
   so the UI and the AI agree.

### US2 — Explicit cash (P1)
1. Synthesizer JSON gets `cash_target_pct` (0–100, default 0). Σ stock target_pct + cash must be within 90–110, then
   stocks + cash are normalised together to exactly 100.
2. Prompt explains when cash makes sense (nothing compliant/attractive, risk limits, uncertainty), that idle cash does
   not help reach the target, and that cash is NOT a ticker.
3. Reserved words in `target_allocation` are converted into `cash_target_pct` (synthesizer and again in validation,
   idempotently); they are never validated as tickers, never screened (`applyShariahScreening` drops them) and never
   bought: `getBuyBlockReason` refuses them first, under every screening setting, so the preview, the engine's
   planner and the engine's per-order re-check all refuse (defence in depth). `computeActionList` never creates a
   BUY for them. SELLING a real holding with such a symbol is still possible.
4. Downstream: invalid tickers / Shariah removals → remaining stocks rescaled to fill (100 − cash) (removed weight is
   redistributed proportionally among the remaining stocks, as today); the 20 % per-stock cap's leftover goes to cash.
   Final `cash_target_pct` = 100 − Σ kept stocks.
5. `computeActionList` sizes buys from total × stock target %, so the cash target stays uninvested; the risk-limit cash
   buffer still applies on top at execution. Stocks are scaled down if stocks + cash would exceed 100.
6. Stored in `agent_outputs.cash_allocation = { version: 1, cash_target_pct, converted[] }` — no migration;
   `target_allocation` keeps stocks only.
7. Rebalance "Current vs target": the cash row uses the explicit cash target; its internal key is `__cash__`, so a real
   ticker named CASH is shown as its own stock row.
8. Backwards compatible: old recommendations (no `cash_allocation`) → cash target = 100 − Σ stock targets, as before;
   old reserved entries (e.g. a `CASH` target row) are ignored as stocks.

## Decisions made autonomously

- **Return source preference**: `profit_loss_pct` first (same series as the hub Performance chart → UI agrees), then
  chained `profit_loss`, then equity. Assumes Alpaca's `profit_loss_pct` is cumulative and cash-flow adjusted.
- **No complete recommendation yet** → `insufficient_history` (the programme has not started; nothing to measure).
- **Window** uses calendar days between the first and last daily point actually used.
- **All-cash recommendation** is not produced automatically: with no valid stocks the run still fails
  ("no valid tickers" / "no compliant stocks") — conservative, avoids an automatic sell-everything.
- **Removed-stock weight** goes to the remaining stocks (not to cash); the cap's leftover goes to cash.
- **Storage**: `target_allocation` is an array column, so the cash target lives in `agent_outputs.cash_allocation`
  (jsonb, no migration) like `shariah_review` / `usage`.
- **Old helper removal**: `computePortfolioReturnMetrics`, `removeTickers` and `normaliseTo100` had no remaining
  callers and were removed with their tests.
- **Reserved words** (normalised: upper-case, `_ - .` → space): CASH, USD, $, US$, US DOLLAR(S), DOLLAR(S),
  MONEY MARKET (FUND), MMF, MMKT, SWEEP, CASH SWEEP, CASH EQUIVALENT(S), CASH RESERVE, RESERVE, UNINVESTED, SPAXX,
  VMFXX, SWVXX, FDRXX, SPRXX, FZFXX, VMRXX, SNVXX, TTTXX, SNSXX, FCASH, plus anything containing the word CASH or the
  phrase MONEY MARKET, plus the internal row key `__cash__`.
- **A real holding with a reserved symbol** (e.g. the user owns Pathward "CASH") cannot be targeted, so it gets a 0 %
  target (SELL) like any holding the model leaves out. Documented limitation.

## Out of scope
- Benchmarks / risk-adjusted metrics; changing the hub Performance chart.
- A DB column for the cash target (no migration).

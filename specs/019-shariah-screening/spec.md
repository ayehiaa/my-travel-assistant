# Feature Specification: Islamic (Shariah) Screening + Individual Stocks Only

**Created**: 2026-11-20
**Status**: Implemented
**Phase**: 1 of 5 (autonomous build)
**Builds on**: `018-alpaca-live-portfolio`

## Summary

The owner wants every analysis and every buy restricted to Shariah-compliant **individual common stocks**.
No bonds, no ETFs / funds, no preferred shares, no options, no shorting, no margin. Prompts tell the agents
about the mandate, but enforcement is done **in code**: every ticker in a proposed allocation and every current
holding is screened (security type, SIC business activity, AAOIFI financial ratios, plus a separate strict AI
business-activity review). Anything not fully compliant is dropped from the allocation (existing holdings are
sold), and the execution routes refuse to buy anything without a stored compliant verdict.

## User Stories

### US1 — Only compliant common stocks reach the allocation (P1)

1. **Given** the synthesizer proposes an allocation, **When** the run screens it, **Then** each ticker is
   compliant only if ALL of these hold:
   - Polygon security `type` is `"CS"` (common stock). Unknown type → not compliant.
   - Polygon `sic_code` is not on the business-activity blocklist (see below).
   - The Shariah reviewer (separate AI call) returns `compliant` for it. `uncertain`, a missing ticker or a
     malformed entry → not compliant.
   - Each AAOIFI ratio passes (< 30% of market cap): interest-bearing debt, cash + interest-bearing securities,
     accounts receivable. If a ratio cannot be computed from Polygon data, the reviewer's estimate is used and
     passes only when < 30% with confidence not `low` (`ratio_source = "ai_estimate"`).
2. Non-compliant tickers are removed; the remaining weights are renormalised to 100% and capped at 20% per stock
   (excess above the cap is redistributed; if every position is capped the rest stays in cash).
3. **Given** no compliant ticker remains, **Then** the run fails with
   "Shariah screening: no compliant stocks remain …" and no action list is produced.

### US2 — Non-compliant holdings are sold (P1)

1. **Given** a current holding fails screening (e.g. an ETF, a bank), **Then** its target is 0% and the action list
   shows SELL with the screening reason (`ActionItem.note`).

### US3 — Execution refuses non-compliant buys (P1)

1. **Given** a recommendation with screening data, **When** preview or execute runs, **Then** any BUY whose ticker
   lacks a stored `compliant` verdict is skipped with reason "Not Shariah-compliant" and never submitted.
2. **Given** an old recommendation without screening data, **Then** every BUY is skipped with
   "Not Shariah-compliant — re-run the analysis (this recommendation predates Shariah screening)". Sells are allowed.

### US4 — Transparency on the recommendation page (P2)

1. A "Shariah screening" section shows each ticker's verdict chip, reason, the three ratios with their source
   (Polygon / AI estimate / unavailable), and an "Excluded" list with reasons.
2. The data is read from `recommendations.shariah_screening` first, then from `agent_outputs.shariah_review`.

### US5 — Mandate in every prompt (P2)

1. A shared ISLAMIC MANDATE block is appended to all 7 agent system prompts and both synthesizer prompts.
2. New-portfolio mode builds 6–10 individual stocks with max 20% per stock (ETF / 40% wording removed).
3. The starter universe contains only individual common stocks (8–12 per risk profile), avoiding
   banks / insurers / alcohol / tobacco / gambling / defence.

### US6 — Broker-side safeguard (P3)

1. In Portfolio Settings (Alpaca card) a "Disable margin & shorting" button calls Alpaca
   `PATCH /v2/account/configurations` with `{ no_shorting: true, max_margin_multiplier: "1" }` via an
   authenticated, Zod-validated, audited API route.

## SIC business-activity blocklist (code level)

| SIC range | Activity |
|---|---|
| 6000–6199 | Banks, savings institutions, credit institutions, finance lessors |
| 6200–6299 | Security & commodity brokers, dealers, exchanges |
| 6300–6499 | Insurance carriers, agents & brokers |
| 6700–6726 | Holding / investment offices, investment funds & trusts |
| 6770 | Blank-check companies (SPACs hold interest-bearing trust accounts) |
| 6799 | Investors, NEC |
| 2082–2085 | Malt beverages, malt, wines, distilled liquor |
| 2100–2199 | Tobacco products |
| 5180–5182 | Wholesale beer, wine & distilled alcoholic beverages |
| 5813 | Drinking places (bars) |
| 5921 | Liquor stores |
| 7948 | Racing incl. track operation (betting) |
| 7993 | Coin-operated amusement / gaming |
| 7999 | Amusement & recreation NEC (gambling operators) |
| 3480–3489 | Ordnance & accessories (ammunition, small arms) |
| 3760–3769 | Guided missiles & space vehicles |
| 3795 | Tanks & tank components |

Not blocked by SIC (too broad; left to the AI reviewer, which must fail them on business activity):
REITs (6798), hotels/casino resorts (7011), misc. amusement incl. online betting (7990), meat packing incl. pork
(2011), aerospace (3720s), adult entertainment (no SIC code). An unknown SIC code is not a code-level block; the
reviewer still has to pass the company.

## Decisions made autonomously

1. **Islamic screening is always ON** (owner requirement). No toggle is built; Portfolio Settings shows a
   read-only "Islamic screening: Always on" line. A toggle would add a way to switch off a religious requirement
   by accident for no benefit.
2. **20% cap enforced in code**, not just in prompts, applied after renormalisation (water-filling). If fewer than
   5 stocks remain, the uncapped remainder stays as cash.
3. **Ratio upper bounds**: when Polygon lacks a specific line item, a broader one is used as an upper bound
   (total liabilities ≥ interest-bearing debt; current assets ≥ cash + short-term securities and ≥ receivables).
   An upper bound under 30% is a pass; an upper bound ≥ 30% is "unknown" → falls back to the AI estimate.
   Long-term interest-bearing securities are not in current assets; this is an accepted approximation.
4. **Missing Polygon key / data**: type unknown → not compliant. Without `POLYGON_API_KEY` every ticker fails and
   runs error out. Safer than passing unknown securities.
5. **ADRs (`ADRC`), preferred shares, ETFs, funds, warrants, units** all fail the stocks-only check.
6. **Whole reviewer response unparseable** → the step throws so Inngest retries it; if retries are exhausted the
   run errors (no recommendation is produced). A single malformed / missing entry fails only that ticker.
7. **Compact copy in `agent_outputs.shariah_review`** uses the same shape as the column (≤ ~20 tickers, a few KB),
   so one reader/validator serves both.
8. **Recommendation write order**: main update (allocation, actions, agent_outputs incl. shariah_review) first;
   `shariah_screening` column written in a separate best-effort update whose error is ignored.
9. **Audit action** `alpaca_safeguards_applied` added to the TypeScript union. The DB CHECK constraint (last
   defined in migration 016) is not changed — newer actions (e.g. `alpaca_executed`) are already outside it in
   the repo's migrations; extending it blindly could fail on production data. Logged as a follow-up.
10. **Options level** not changed by the safeguard button (only shorting + margin, as specified). Options cannot
    be traded through the app anyway (orders are stock market orders on screened tickers only).
11. Reviewer uses the same model id string as the other agents, `temperature: 0`.

## Out of scope

- Purification (dividend cleansing) calculations.
- A user-facing toggle for screening.
- Scheduled / autonomous runs (later phases).

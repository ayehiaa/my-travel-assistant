# Feature Specification: Configurable Islamic Screening

**Created**: 2026-11-22
**Status**: Implemented
**Builds on**: `019-shariah-screening`, `020-order-execution-engine`, `023-trading-notifications`, `028-portfolio-hub-ux-cleanup`

## Summary

Islamic (Shariah) screening has been always on since spec 019. Each user can now configure it in
Portfolio hub → Settings → Strategy:

| Setting | Default | Meaning |
|---|---|---|
| `islamic_enabled` | on | Master switch for Islamic screening. |
| `business_screen` | on | Business activity: SIC blocklist + the AI reviewer's verdict on the main business. |
| `financial_screen` | on | Financial ratios: the three AAOIFI 30% ratios (debt, cash + interest-bearing securities, receivables; Polygon with AI-estimate fallback) AND non-permissible income < 5%. |
| `stocks_only` | on | Independent of Islamic: individual common stocks only (Polygon type `CS`, reviewer instrument type as fallback). |

Stored in `portfolio_settings.screening_settings` (jsonb). Missing column / null / malformed values → defaults
(everything on = the spec-019 behaviour).

**Effective mode**: Islamic screening is ON iff `islamic_enabled && (business_screen || financial_screen)`; then only
the selected parts apply. Otherwise Islamic screening is OFF. `stocks_only` applies whenever it is on.

## User Stories

### US1 — Configure screening (P1)
1. The Strategy section shows an "Islamic screening" card: master toggle, two sub-toggles ("Business activity",
   "Financial ratios") with one-line explanations (greyed and disabled while the master is off) and a separate
   "Individual stocks only" toggle.
2. Turning Islamic screening off, disabling a part, or turning stocks-only off opens a confirmation dialog that lists
   the effect ("Buys will no longer be checked for …"). The API also refuses such a weakening without
   `screening_confirm: true`.
3. Saving goes through `PUT /api/portfolio/settings` (Zod), written best-effort in a separate update; audit action
   `screening_settings_updated` with before/after. Without the migration the API returns
   `screening_settings_warning` and nothing changes (screening stays fully on).

### US2 — Analysis respects the settings (P1)
1. `decideTickerVerdict` takes the effective config. Only enabled checks can fail a ticker. Disabled checks are still
   recorded (outcome pass / fail / unknown when data is available) but marked "not applied" and never become a
   failure reason. The stocks-only check applies whenever `stocks_only` is on.
2. The AI Shariah reviewer is skipped entirely (no AI cost) when no Islamic part is enabled. Then the stocks-only
   check uses the Polygon type only; an unknown type fails stocks-only.
3. Business only → reviewer prompt asks for the business verdict; ratio estimates / non-permissible income are optional.
   Financial only → business verdict optional; ratio estimates + non-permissible income required.
4. Agents and synthesizer get the Islamic mandate only when Islamic screening is on, phrased for the enabled parts;
   the stocks-only wording is included when stocks-only is on. With everything off, no mandate is added. The new
   portfolio starter universe is unchanged. The 20% single-stock cap is always applied.
5. Polygon financials are only fetched when Islamic screening is on.
6. The effective config used is stored on the screening result (`config`) together with per-ticker `checks`.

### US3 — Buy guard respects the CURRENT settings (P1)
At preview and at execution time (`getBuyBlockReason(ticker, screening, currentConfig)`):
- Islamic off + stocks-only off → no block.
- Stocks-only only → block buys that are not a common stock per the stored screening type; no stored type → block
  ("Security type unknown — re-run the analysis…").
- Islamic on → the stored screening must have applied every currently enabled part (otherwise the existing re-run
  message `NO_SCREENING_SKIP_REASON`, e.g. a recommendation created while screening was off), and the ticker must
  pass every enabled part. Legacy screenings (no `config`) count as fully screened and keep the old rule
  (compliant and not excluded).

### US4 — Display (P2)
- Status strip chip: "Shariah: on" / "Shariah: business only" / "Shariah: financial only" / "Shariah: off"
  (+ " · stocks only" hint in the title).
- Rebalance Shariah card shows the mode used for that recommendation, and warns when the current settings differ.
- Holdings Shariah badges show "Not screened" when Islamic screening is currently off.

### US5 — Notifications (P2)
Shariah divest alerts and the weekly Shariah holdings section only when the run's screening had Islamic screening on,
and only for failures of enabled Islamic parts (a stocks-only failure is not a Shariah divest).

## Decisions made autonomously
1. **Confirmation also for stocks-only off** and enforced server-side (`screening_confirm`) — conservative.
2. **Legacy screenings** (no `config`) = all parts applied; their per-ticker verdict rule is unchanged (stricter).
3. **Recommendation screened with fewer parts than now enabled** → buys blocked with the existing re-run message
   (spec requirement); stocks-only is re-checked from the stored type when the stored run did not apply it.
4. **Reviewer verdict in financial-only mode** may be null; stored `reviewer_verdict` was already nullable.
5. **Full mode prompt** for the reviewer and the mandate is byte-identical to spec 019 (no behaviour change by default).
6. With stocks-only off and Islamic on, the reviewer is told an ETF/fund is compliant only if it is an explicitly
   Shariah-compliant fund; otherwise non-compliant.
7. **20% cap** stays in all modes (position-size safety, not a Shariah rule).
8. Status chip is always shown (also for the default) so the active mode is visible at a glance.
9. Sell notes for stocks-only exclusions read "Excluded by screening: …" when Islamic is off; forced-sell detection
   uses `screening.excluded`, so sells are never trimmed.
10. Reviewer skipped + stocks-only on: unknown Polygon type fails stocks-only (documented in US2.2).

## Out of scope
Per-recommendation overrides; changing the SIC blocklist or ratio thresholds; Shariah screening of ETFs' holdings.

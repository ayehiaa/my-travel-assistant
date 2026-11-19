# Feature Specification: Alpaca as the Live Portfolio Source + Start-from-Scratch Analysis

**Created**: 2026-11-19
**Status**: Implemented
**Supersedes**: parts of `017-alpaca-portfolio-sync` (DB sync of holdings) and the manual holdings / cash entry from `015-portfolio-advisor`

## Summary

The connected Alpaca account is the single source of truth for the portfolio. Holdings (ticker, company name,
shares, market value) and cash are read live from Alpaca whenever they are needed — on the portfolio page and at
the start of every analysis run. The app no longer stores or lets the user edit holdings or cash.

An account with cash but no positions can now run an analysis. In that case the agents research a starter
candidate list chosen by risk profile, and the synthesizer builds a new portfolio from the cash.

## User Stories

### US1 — Portfolio page reads the live account (P1)

1. **Given** no Alpaca account is connected, **When** the user opens `/portfolio`, **Then** they see a
   "Connect your Alpaca account" empty state linking to Portfolio Settings; no holdings table, no add button.
2. **Given** Alpaca is connected, **When** the page loads, **Then** holdings, shares, values and cash come from
   Alpaca (`/v2/positions`, `/v2/account`), with a "Live from Alpaca (Paper|Live) · as of HH:MM · Refresh" line.
3. **Given** Alpaca cannot be reached, **When** the page loads, **Then** an error banner with a Retry button is
   shown and no stale numbers are displayed.
4. There is no "Add holding", "Edit" or "Delete" on holdings, and no Cash field in Portfolio Settings.

### US2 — Analysis always uses the live account (P1)

1. **Given** no Alpaca account is connected, **When** a run is requested, **Then** it is refused (400,
   "Connect your Alpaca account first").
2. **Given** the account's total value (positions + cash) is 0, **When** a run is requested, **Then** it is
   refused (400, "Your Alpaca account has no funds or positions").
3. **Given** a run starts, **Then** the portfolio snapshot (holdings + cash) is fetched live from Alpaca inside
   the background job and stored on the recommendation as before. Decrypted keys never leave the step.

### US3 — Start from scratch (P1)

1. **Given** the account has cash and no positions, **When** a run executes, **Then** the agents analyse a
   starter candidate list for the user's risk profile (broad ETFs plus a few large caps), and are told this is
   a new portfolio, not a rebalance.
2. The synthesizer is told it is building a new portfolio from cash: allocate across 4–8 positions, may use any
   candidate or other valid US tickers, the 3-new-instrument cap does not apply, and there is no performance gap
   section (there is no history to measure).
3. The action list is all buys sized from cash; execution works as today.

## Out of scope

- Dropping the `portfolio_holdings` table or `portfolio_settings.cash_usd` / `last_synced_at` columns. They are
  no longer read or written; a later migration can drop them once the change has been verified.
- Scheduled runs (no scheduler exists yet).

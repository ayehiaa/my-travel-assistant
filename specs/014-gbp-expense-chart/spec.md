# Feature Specification: GBP-Normalised Expense Chart

**Feature Branch**: `014-gbp-expense-chart`

**Created**: 2026-05-23

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — View all expenses in chart regardless of currency (Priority: P1)

A user logs expenses in multiple currencies (e.g. USD hotel, EUR dinner, GBP flight). Today the chart silently drops non-GBP entries and shows a disclaimer. After this feature, every expense appears in the chart, converted to GBP at the rate that was current on the expense date, so the total spending picture is accurate.

**Why this priority**: The core value of the chart is an accurate view of total spending. Dropping expenses defeats that purpose.

**Independent Test**: Add one GBP expense and one USD expense. Open the expenses chart. Both amounts should appear in the chart, with the USD amount converted and the chart Y-axis labelled in GBP.

**Acceptance Scenarios**:

1. **Given** a user has expenses in GBP and USD, **When** they view the expenses chart, **Then** both expenses are included in the chart bars, with the USD amount converted to GBP at the historical rate for that expense date.
2. **Given** a user has only GBP expenses, **When** they view the chart, **Then** the chart looks and behaves identically to today (no regression).
3. **Given** all expenses are in a single non-GBP currency (e.g. all EUR), **When** they view the chart, **Then** all expenses are converted and shown correctly.
4. **Given** the exchange rate service is unavailable, **When** they view the chart, **Then** the chart falls back to showing GBP-only expenses with a clear message explaining that conversion is temporarily unavailable.

---

### User Story 2 — Understand that amounts are converted (Priority: P2)

A user wants to know at a glance that the chart is showing converted values, not raw amounts.

**Why this priority**: Without this, users may be confused about why a USD expense shows a slightly different amount than they entered.

**Independent Test**: Add a non-GBP expense. Open the chart. A visible label or note should confirm that amounts are converted to GBP.

**Acceptance Scenarios**:

1. **Given** the chart contains converted expenses, **When** a user views the chart, **Then** a label such as "All amounts converted to GBP" is shown near the chart.
2. **Given** all expenses are already in GBP, **When** a user views the chart, **Then** no conversion note is shown (no unnecessary noise).

---

### Edge Cases

- What happens when the exchange rate API returns an error or times out? → Fall back to GBP-only chart with an explanatory note.
- What happens when an expense has an unrecognised or malformed currency code? → Treat it as unconvertible; exclude it from the chart and note it in the disclaimer.
- What happens when the expense date is very recent and rates may not be published yet? → Use the latest available rate for that currency pair.
- What happens when two expenses on the same date have different currencies? → Each is converted independently at the rate for that date.

---

## Functional Requirements

1. **FR-1**: The system must fetch historical GBP exchange rates for all non-GBP currencies present in the user's expenses using a free public exchange rate API (no Anthropic API, no API key required).
2. **FR-2**: Exchange rates must be fetched per expense date (historical rates), not a single current rate, to accurately reflect spending on travel dates.
3. **FR-3**: Converted amounts must be used only for chart display; stored expense amounts and currencies must remain unchanged in the database.
4. **FR-4**: When conversion succeeds for all non-GBP expenses, the disclaimer "Some expenses in other currencies are not shown" must be replaced with "All amounts converted to GBP".
5. **FR-5**: When the exchange rate service is unavailable or returns an error, the chart must fall back to GBP-only display with a message explaining the temporary unavailability.
6. **FR-6**: Currency conversion must be fetched server-side (not client-side) to avoid CORS issues and to allow caching.
7. **FR-7**: Exchange rates should be cached per currency pair + date to avoid redundant API calls within a session.

---

## Success Criteria

1. Users with multi-currency expenses see 100% of their expenses represented in the chart (no silent exclusions).
2. The chart renders in under 3 seconds even with 10 different currencies across 12 months of expenses.
3. No existing GBP-only user sees any visual regression in the chart.
4. When the exchange rate service is down, users receive a clear, non-technical explanation rather than a broken or empty chart.

---

## Assumptions

- The free exchange rate API used will be [frankfurter.app](https://www.frankfurter.app/) — ECB-backed, no API key, supports historical rates by date, and allows CORS-free server-side calls.
- GBP is the always the target currency (matching the existing Y-axis label and app locale).
- Exchange rates are fetched at build/request time; there is no requirement to store them in the database.
- Rate caching is in-memory per server request (no persistent cache required for v1).

---

## Out of Scope

- Allowing users to choose a display currency other than GBP.
- Storing historical exchange rates in the database.
- Showing the original amount alongside the converted amount in chart tooltips (future enhancement).

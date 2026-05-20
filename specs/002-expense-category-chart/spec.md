# Feature Specification: Monthly Expense Category Chart

**Feature Branch**: `002-expense-category-chart`

**Created**: 2026-05-20

**Status**: Draft

**Input**: User description: "I should be able to see a graph showing the categorization of my expenses monthly with different colors based on the categories we have on expenses now"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Monthly Category Breakdown (Priority: P1)

As a user on the Expenses page, I want to see a stacked bar chart of my expenses grouped by month, with each bar segment coloured by category, so I can immediately see which categories dominate each month.

**Why this priority**: This is the entire feature — the chart is the deliverable and provides immediate financial insight with no additional steps.

**Independent Test**: Navigate to the Expenses page; the chart renders above the expense list showing at least one bar per month that has expenses, with each category visually distinguished by colour.

**Acceptance Scenarios**:

1. **Given** I have expenses across multiple categories in the current and previous months, **When** I open the Expenses page, **Then** I see a stacked bar chart with one bar per month and one coloured segment per category present in that month.
2. **Given** a month has expenses in only one category, **When** I view the chart, **Then** the bar for that month is a single solid colour for that category.
3. **Given** I hover over or tap a bar segment, **When** the tooltip appears, **Then** it shows the category name and the total amount (with currency) for that month.
4. **Given** a legend is displayed alongside the chart, **When** I look at it, **Then** every category colour shown in the chart is listed by name.

---

### User Story 2 - No Expenses Empty State (Priority: P2)

As a user who has not yet logged any expenses, I want the chart area to show a clear empty state rather than a broken or blank visual.

**Why this priority**: Without this, a new user sees a confusing empty chart area.

**Independent Test**: Log in with an account that has zero expenses; the chart area shows a descriptive message rather than empty axes.

**Acceptance Scenarios**:

1. **Given** I have no expenses recorded, **When** I visit the Expenses page, **Then** the chart area displays an empty-state message (e.g., "No expenses to display yet") instead of an empty chart.

---

### User Story 3 - Currency-Aware Amounts (Priority: P3)

As a user who logs expenses in multiple currencies, I want the chart to show amounts in a single consistent currency per chart view, so amounts are not misleadingly added across currencies.

**Why this priority**: Mixing currencies in a single bar would give incorrect totals; the chart must handle this correctly.

**Independent Test**: Log expenses in GBP and USD; the chart either shows separate bars or clearly scopes to one currency.

**Acceptance Scenarios**:

1. **Given** I have expenses in GBP only, **When** I view the chart, **Then** all bar values are in GBP and the currency label is shown.
2. **Given** I have expenses in multiple currencies, **When** I view the chart, **Then** it defaults to displaying GBP (or the user's primary currency) and indicates that other currencies are excluded.

---

### Edge Cases

- What happens when there is only one month of expense data? → Single bar renders correctly without axis errors.
- What happens when a category has been deleted but old expenses reference it? → Expenses are grouped under "Unknown" or the archived category name; no crash.
- What happens when amounts are very large or very small? → Y-axis scales appropriately; values are formatted (e.g., "£1.2k").
- What happens on a narrow mobile viewport? → Chart remains readable; x-axis labels may rotate or abbreviate month names.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a stacked bar chart on the Expenses page showing total expense amounts grouped by calendar month.
- **FR-002**: Each bar segment MUST be coloured according to the expense category, using a consistent colour palette derived from the existing `expense_categories` list.
- **FR-003**: The chart MUST include a legend mapping each colour to its category name.
- **FR-004**: The chart MUST show an interactive tooltip on hover/tap revealing the category name, month, and total amount for that segment.
- **FR-005**: The chart MUST display months in chronological order on the x-axis.
- **FR-006**: When no expenses exist, the chart area MUST render an empty-state message instead of broken axes.
- **FR-007**: The chart MUST scope amounts to a single currency (defaulting to GBP) and indicate when multi-currency data exists.
- **FR-008**: The chart MUST be visible to both `main` (owner) and `assistant` roles — it is read-only and contains no write actions.
- **FR-009**: The chart data MUST be derived from the same expenses already loaded on the page (no additional network request).

### Key Entities

- **ExpenseCategory**: `id`, `name`, `display_order` — determines the colour assignment and legend labels.
- **Expense**: `amount`, `currency`, `expense_date`, `category_id` — the raw data aggregated into monthly buckets.
- **MonthlyBucket**: A derived structure grouping expenses by `YYYY-MM`, then by `category_id`, summing `amount`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The chart renders on every Expenses page load that has at least one expense, with no visible delay beyond the existing page load.
- **SC-002**: Every category present in the loaded expenses is represented in the chart and legend — 0% of categories are silently omitted.
- **SC-003**: The chart correctly displays up to 24 months of data without layout overflow or axis label collision.
- **SC-004**: On screens 375px wide and above the chart remains legible (labels readable, bars distinguishable).
- **SC-005**: Hovering or tapping any bar segment within 1 second reveals accurate category and amount data.

## Assumptions

- Expenses are already loaded into the Expenses page component; the chart reuses that data client-side — no new API endpoint is required.
- The number of distinct categories is small (fewer than 15), so a fixed colour palette per category is sufficient and no colour recycling logic is needed.
- The chart shows the most recent 12 months by default; older data is not truncated but only visible if it exists within the loaded expense set.
- Currency scoping defaults to GBP; multi-currency handling is a P3 concern and a simple informational note suffices for v1.
- A charting library will be introduced as a new dependency (Recharts is the assumed choice — lightweight, React-native, MIT licensed).
- Mobile support is required at 375px minimum width but a horizontal scroll on the chart container is acceptable for many months of data.

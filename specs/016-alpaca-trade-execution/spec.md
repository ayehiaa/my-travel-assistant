# Feature Specification: Alpaca Trade Execution

**Feature Branch**: `075-alpaca-trade-execution`

**Created**: 2026-06-19

**Status**: Draft

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Connect Alpaca Account (Priority: P1)

A `premium_plus` user wants to link their Alpaca paper trading account so the app can place orders on their behalf. They navigate to Portfolio Settings, see the Alpaca Connection card, paste their API Key ID and Secret Key, choose Paper Trading mode, and click Connect. The card then shows "Connected (Paper)" with a Disconnect button.

**Why this priority**: All trade execution depends on credentials existing. Nothing else in this feature works without this step.

**Independent Test**: Can be tested by visiting `/portfolio/settings`, submitting credentials, and verifying the connected state is persisted and displayed on reload.

**Acceptance Scenarios**:

1. **Given** no Alpaca credentials are saved, **When** the user visits `/portfolio/settings`, **Then** an "Alpaca Connection" card below the existing settings card shows key ID + secret key inputs with a "Paper Trading" toggle defaulted to on and a Connect button
2. **Given** the user fills in valid key ID and secret, **When** they click Connect, **Then** the credentials are saved (encrypted) and the card transitions to show "Connected (Paper)" and a Disconnect button
3. **Given** credentials are connected, **When** the user visits `/portfolio/settings`, **Then** the card shows "Connected (Paper)" status — the raw keys are never re-displayed
4. **Given** credentials are connected, **When** the user clicks Disconnect, **Then** the credentials are deleted and the card returns to the input form

---

### User Story 2 — Preview and Execute Trades (Priority: P1)

A `premium_plus` user with Alpaca connected views their most recent portfolio recommendation. They see an "Execute trades" button with a "PAPER" badge. They click it; a modal opens showing a live preview table (ticker, action, computed qty, current price, estimated value). Zero-qty items appear greyed-out. If markets are closed, a yellow warning banner is shown. They review and click "Confirm & Execute". Orders execute (sells first, then buys) and the modal closes.

**Why this priority**: This is the core feature — the bridge between advisory and execution.

**Independent Test**: Can be tested end-to-end on the recommendation detail page against Alpaca's paper trading sandbox.

**Acceptance Scenarios**:

1. **Given** the user has Alpaca connected and views the most recent complete unexecuted recommendation, **When** the page loads, **Then** an "Execute trades" button with a PAPER badge is visible below the action list
2. **Given** the user clicks "Execute trades", **When** the modal opens, **Then** it fetches live prices from Alpaca and shows a table: ticker | action | qty | price | estimated value; items where computed qty = 0 are greyed out with "Too small to execute"
3. **Given** the current time is outside NYSE market hours (9:30am–4pm ET, Mon–Fri), **When** the modal is open, **Then** a yellow warning banner reads "Markets are currently closed. Orders will queue for next market open."
4. **Given** the user clicks "Confirm & Execute", **When** all orders are submitted, **Then** sells execute first, then buys; skipped items are not submitted to Alpaca
5. **Given** the user has no Alpaca credentials connected, **When** the page loads, **Then** a disabled "Execute trades" button shows with the label "Connect Alpaca in Settings →" linking to `/portfolio/settings`

---

### User Story 3 — View Persistent Execution Results (Priority: P2)

After executing, the recommendation page shows a persistent "Execution Results" panel below the Recommended Actions section. Each row shows ticker, action, qty, and order status (Submitted / Rejected / Error) plus the Alpaca order ID. The "Execute trades" button is replaced by "Executed on [date]" (disabled). Revisiting the page always shows the same panel.

**Why this priority**: Users need a durable record of what was actually submitted, especially if some orders were rejected.

**Independent Test**: Can be tested by executing trades, then refreshing the page and confirming the results panel persists with correct order statuses.

**Acceptance Scenarios**:

1. **Given** trades have been executed, **When** the user views the recommendation page, **Then** an "Execution Results" panel appears below "Recommended Actions" with a row per submitted order showing ticker, action, qty, status, and Alpaca order ID
2. **Given** some orders were rejected by Alpaca, **When** the results panel renders, **Then** rejected rows show in red with the rejection reason; successful rows show in green with "Submitted"
3. **Given** trades have been executed, **When** the user views the recommendation page, **Then** the execute button is replaced by a disabled "Executed on [date]" button with a PAPER badge
4. **Given** a recommendation that has already been executed, **When** the user views an older recommendation, **Then** no execute button is shown at all (not even disabled) — only the results panel if it was executed

---

### Edge Cases

- What happens if Alpaca returns an error for all orders? The results panel shows all rows as "Error" with messages; the recommendation is still marked as executed (attempted).
- What if the action list contains a ticker with no Alpaca position for a sell? The position fetch returns 0 qty held; computed sell qty is capped at 0 and the item is skipped.
- What if the user loses connectivity mid-execution? Orders already submitted to Alpaca are recorded; remaining orders are marked as "Error — not submitted". The partial execution is persisted.
- What if the recommendation's `action_list` is empty or contains only `hold` items? The confirmation modal shows an empty table with a message "No actionable orders"; Confirm button is disabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an "Alpaca Connection" card on `/portfolio/settings` for `premium_plus` users to enter and save their Alpaca API credentials
- **FR-002**: Credentials MUST be encrypted at rest using AES-256-GCM with a server-side encryption key; raw keys are never re-exposed after saving
- **FR-003**: The credentials card MUST support a Paper Trading toggle (default: on), storing an `is_paper` flag that determines which Alpaca base URL is used
- **FR-004**: System MUST allow users to disconnect (delete) their Alpaca credentials at any time
- **FR-005**: System MUST display an "Execute trades" button on the most recent complete unexecuted recommendation only; all other recommendations show no execute button
- **FR-006**: When Alpaca credentials are not connected, the execute button MUST be disabled and display a link to `/portfolio/settings`
- **FR-007**: When credentials exist, the execute button MUST display a "PAPER" badge when `is_paper` is true
- **FR-008**: The confirmation modal MUST fetch live prices from Alpaca's quote endpoint at the moment it opens and compute qty as `floor(|delta_usd| / price)`
- **FR-009**: For sell orders, computed qty MUST be capped at the actual position qty held in Alpaca (fetched from Alpaca positions endpoint)
- **FR-010**: Items where computed qty = 0 MUST be displayed as greyed-out with "Too small to execute" and excluded from submission
- **FR-011**: The confirmation modal MUST show a yellow warning banner when the current time is outside NYSE market hours (Mon–Fri 9:30am–4:00pm ET)
- **FR-012**: On confirm, sell orders MUST be submitted to Alpaca before buy orders; all orders use `type: market`, `time_in_force: day`
- **FR-013**: Execution results MUST be stored persistently and displayed in a panel below "Recommended Actions" on the recommendation page
- **FR-014**: Each result row MUST show: ticker, action, qty, order status (Submitted / Rejected / Error), and Alpaca order ID where available
- **FR-015**: Once a recommendation has been executed, it MUST NOT be executable again; the button is replaced by a disabled "Executed on [date]" indicator
- **FR-016**: `hold` items in the action list MUST never be submitted to Alpaca

### Key Entities

- **AlpacaCredential**: Per-user record storing encrypted API key ID, encrypted secret key, IV values, `is_paper` flag, timestamps. One row per user (upsert on reconnect).
- **AlpacaExecution**: Per-recommendation record storing `executed_at`, `is_paper`, and a JSONB array of order results (`ticker`, `action`, `qty`, `price_at_execution`, `estimated_value`, `alpaca_order_id`, `status`, `error_message`).
- **OrderPreview**: Transient (not stored) — computed from `action_list` + live Alpaca prices + positions; used only in the confirmation modal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can connect Alpaca credentials and see the connected state in under 30 seconds
- **SC-002**: The confirmation modal opens and displays live prices within 3 seconds of clicking "Execute trades"
- **SC-003**: All submitted orders appear in the persistent results panel within 5 seconds of confirmation
- **SC-004**: A recommendation marked as executed cannot be re-executed — zero cases of duplicate order submission
- **SC-005**: Greyed-out (zero-qty) items are never submitted to Alpaca — zero unintended orders for items marked "Too small"
- **SC-006**: The execution results panel survives page reload and is always visible on an executed recommendation

## Assumptions

- Only `premium_plus` users can access the portfolio module and therefore this feature; role checks are inherited from the existing portfolio middleware
- Alpaca's paper trading sandbox (`https://paper-api.alpaca.markets`) is used by default; the same code paths serve live trading by changing the base URL based on `is_paper`
- Fractional share trading is NOT required — all qty values are whole integers (floor division)
- The app does not track post-execution performance or outcome; execution is fire-and-forget with status captured at submission time
- Alpaca market orders with `time_in_force: day` are accepted outside market hours and queued; the app warns but does not block
- A single `ALPACA_CREDENTIAL_ENCRYPTION_KEY` environment variable (32-byte base64) is provisioned server-side; no per-user key management
- Assistant users cannot access portfolio features at all — no Alpaca features are exposed to `assistant` role
- The feature does not support options, crypto, or non-US equities — US stocks only, matching the existing portfolio module scope

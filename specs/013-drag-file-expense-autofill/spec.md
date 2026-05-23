# Feature Specification: Receipt Drag-and-Drop with AI Auto-fill

**Feature Branch**: `013-drag-file-expense-autofill`

**Created**: 2026-05-23

**Status**: Draft

**Input**: User description: "I want to be able to drag a file into the add expense screen, it automatically gets attached and it reads the details from the file and auto fill the form"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drag a Receipt to Auto-fill the Form (Priority: P1)

As a user opening the Add Expense modal, I want to drag a receipt image or PDF onto the modal and have the form fields automatically populated with the extracted details, so I can log an expense in seconds without manual data entry.

**Why this priority**: This is the entire feature — dragging a file and getting a pre-filled form is the deliverable and saves the most time.

**Independent Test**: Open the Add Expense modal, drag a JPG/PNG/PDF receipt onto it, and verify the file is attached as the receipt and the title, amount, currency, and date fields are populated from the document.

**Acceptance Scenarios**:

1. **Given** the Add Expense modal is open, **When** I drag a supported file (JPG, PNG, or PDF) onto the modal body, **Then** a visible drag-over highlight appears on the drop zone.
2. **Given** I drop a supported file onto the modal, **When** the file is accepted, **Then** the file is attached as the receipt and a "Reading receipt…" indicator appears while parsing runs.
3. **Given** parsing succeeds, **When** the result is returned, **Then** the Title, Amount, Currency, and Date fields are pre-filled with extracted values and the "Reading receipt…" indicator disappears.
4. **Given** the form is pre-filled, **When** I review the values, **Then** every field remains editable so I can correct any extraction error before saving.
5. **Given** the pre-filled form is correct, **When** I click "Add expense", **Then** the expense is saved with the attached receipt and the extracted field values.

---

### User Story 2 - Graceful Fallback on Parsing Failure (Priority: P2)

As a user whose receipt could not be parsed (poor scan, unsupported content, service error), I want the file to still be attached and a clear message shown, so I can fill in the form manually without losing my file.

**Why this priority**: Without this, a failed parse leaves the user confused with a blank form and no file — a broken experience.

**Independent Test**: Drop a blank white PNG onto the modal; the file is attached as the receipt, a non-blocking warning appears ("Couldn't read receipt details — please fill in manually"), and all form fields remain blank and editable.

**Acceptance Scenarios**:

1. **Given** I drop a file onto the modal and parsing fails (bad response or timeout), **When** the error is detected, **Then** the file remains attached as the receipt and a non-blocking inline notice says "Couldn't read receipt details — please fill in manually."
2. **Given** the parse failed gracefully, **When** I look at the form, **Then** all fields are empty and editable — no partial or incorrect data has been applied.
3. **Given** the parse failed gracefully, **When** I manually fill in the form and click "Add expense", **Then** the expense is saved normally with the attached receipt.

---

### User Story 3 - Click-to-Upload Still Works (Priority: P3)

As a user who cannot or does not want to drag a file, I want the existing click-to-upload file input to also trigger AI parsing, so the auto-fill experience is consistent regardless of how I attach the file.

**Why this priority**: Maintains parity between input methods; drag-and-drop is a progressive enhancement, not a replacement.

**Independent Test**: Open the Add Expense modal, click the receipt file input, select a supported file, and verify the same auto-fill behaviour occurs as with drag-and-drop.

**Acceptance Scenarios**:

1. **Given** the Add Expense modal is open, **When** I click the receipt input and choose a supported file, **Then** the same parse-and-auto-fill flow runs as for a dragged file.
2. **Given** parsing succeeds via click-to-upload, **When** the result appears, **Then** the form is pre-filled identically to the drag-and-drop path.

---

### Edge Cases

- What happens when the user drags a non-supported file type (e.g., `.docx`, `.csv`)? → The drop is rejected with an inline error ("JPG, PNG or PDF only") and no file is attached.
- What happens when the file exceeds 10 MB? → The drop is rejected with an inline error ("File too large — max 10 MB") and no file is attached.
- What happens when the user drops a file while the form already has a receipt attached? → The existing receipt is replaced by the new file and parsing re-runs.
- What happens when the user drops a file while a previous parse is still in progress? → The in-progress parse is cancelled (or ignored on arrival) and the new file's parse starts fresh.
- What happens when the modal is in edit mode (editing an existing expense)? → The same drag-and-drop and auto-fill behaviour applies; pre-filled values overwrite the existing field values.
- What happens on a mobile device where drag-and-drop is not available? → The click-to-upload input (Story 3) remains the sole mechanism; no drag-zone UI is shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The entire Add Expense modal body MUST act as the drop target while a file is being dragged; the file is deposited into the receipt field regardless of where within the modal the drop occurs.
- **FR-002**: While a file is dragged over any part of the modal, a full-modal highlight overlay MUST appear to signal the active drop zone; it disappears on drop or drag-leave.
- **FR-003**: On file drop, the system MUST validate the file type (JPG, PNG, PDF only) and size (max 10 MB) before processing; invalid files MUST be rejected with a clear inline error.
- **FR-004**: When a valid file is dropped, it MUST be immediately set as the pending receipt attachment (same as selecting via the file input).
- **FR-005**: Immediately after a valid file is dropped or selected via the file input, the system MUST send the file to a parsing endpoint and display a non-blocking "Reading receipt…" indicator on the form.
- **FR-006**: The parsing service MUST attempt to extract: merchant/payee name (→ Title), total amount paid (→ Amount), currency (→ Currency), and transaction date (→ Date) from the file content.
- **FR-007**: On a successful parse, the system MUST populate each of Title, Amount, Currency, and Date with its extracted value if non-null, leaving null fields empty for the user to complete; Category, Trip, and Notes are always left for the user to set manually.
- **FR-008**: All auto-filled fields MUST remain fully editable so the user can correct extraction errors before saving.
- **FR-009**: If parsing fails entirely (service error, unreadable file, timeout), the system MUST display a non-blocking inline notice and leave all form fields empty; the file MUST remain attached as the receipt. Partial success (some fields non-null) is handled by FR-007 — only fully null responses trigger the failure notice.
- **FR-010**: The click-to-upload file input MUST trigger the same parse-and-auto-fill flow as drag-and-drop.
- **FR-011**: If the user drops a new file while a parse is in progress, the earlier parse result MUST be discarded and parsing MUST restart with the new file.
- **FR-012**: The parsing endpoint MUST be authenticated — only logged-in users can call it.
- **FR-013**: The parsing endpoint MUST NOT store the uploaded file; it reads and discards the bytes after extraction.

### Key Entities

- **Receipt File**: A JPG, PNG, or PDF document (max 10 MB) containing expense information. Uploaded by the user; parsed on the fly; stored in Supabase Storage only after the expense is saved.
- **Parsed Receipt Data**: Structured extraction result containing: `title` (string or null), `amount` (number or null), `currency` (string or null), `date` (ISO date string or null). Any field may be null if the receipt does not contain that information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can drag a clear receipt image onto the modal and have all four key fields (Title, Amount, Currency, Date) populated without typing, completing the drop-to-filled experience in under 10 seconds on a standard connection.
- **SC-002**: When parsing fails, the user is never left with an empty attachment slot — the file remains attached and the form is still submittable.
- **SC-003**: The parsing endpoint responds within 8 seconds for at least 95% of requests under normal operating conditions.
- **SC-004**: Zero data from the receipt is stored by the parsing endpoint itself; file bytes are discarded after extraction.
- **SC-005**: Dropping an unsupported file type or oversized file never results in a silent failure — the user always receives an explicit rejection message within 1 second.

## Clarifications

### Session 2026-05-23

- Q: Should the drop target be the entire modal body or just the receipt section? → A: Entire modal body is the drop target; a full-modal highlight overlay appears while dragging and the file lands in the receipt field wherever it is dropped.
- Q: Should partial parse results (some fields null) be applied or treated as a full failure? → A: Apply non-null fields and leave null fields empty for the user to complete; only a fully null response triggers the failure notice.

## Assumptions

- The AI model used for parsing supports both image content (JPG/PNG) and PDF documents natively via the `document` content type — no rasterisation is required.
- Mobile drag-and-drop is out of scope; the click-to-upload path (FR-010) covers mobile users.
- The parsing endpoint is a new internal API route — no third-party OCR subscription is required.
- Category auto-suggestion is out of scope for this version; the user selects the category manually after auto-fill.
- The existing 10 MB file size limit and JPG/PNG/PDF type restriction (already enforced in the receipt upload flow) apply unchanged to the drag-and-drop path.
- Auto-fill applies to new expenses only in the primary use case; the same behaviour applies in edit mode (existing field values are overwritten by the parse result).
- The existing `ANTHROPIC_API_KEY` environment variable (or equivalent) is available server-side for calling the AI parsing service.

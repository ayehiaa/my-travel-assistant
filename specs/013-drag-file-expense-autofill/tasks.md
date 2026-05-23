# Tasks: Receipt Drag-and-Drop with AI Auto-fill

**Input**: Design documents from `specs/013-drag-file-expense-autofill/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in each description

---

## Phase 1: Setup

**Purpose**: No new project initialization required — `@anthropic-ai/sdk` is installed, `ANTHROPIC_API_KEY` is in `.env.local`, no DB migrations needed. One directory to create.

- [ ] T001 Create directory `src/app/api/expenses/parse-receipt/` (new route namespace)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Server-side parsing logic and API endpoint — both US1 and US3 depend on these; US2 uses the error path of the same endpoint.

**⚠️ CRITICAL**: No user story component work can begin until T002–T004 are complete.

- [ ] T002 Create `src/lib/receiptParser.ts` — export pure function `parseReceiptResponse(text: string): ParsedReceiptData` that JSON-parses the Claude response text, maps `title/amount/currency/date` fields to the interface (null for missing), returns all-null record on any parse error; also export the `ParsedReceiptData` interface
- [ ] T003 [P] Create `src/lib/receiptParser.test.ts` — Vitest unit tests for `parseReceiptResponse`: valid full JSON → all fields populated; partial JSON (some null) → partial result; `null` literal string → all-null record; malformed JSON → all-null record; amount as string → coerced to number or null
- [ ] T004 Create `src/app/api/expenses/parse-receipt/route.ts` — `POST` handler: (1) `getAuthUser()` first, return 401 if absent; (2) parse `multipart/form-data`, validate `file` field present (400 if not); (3) check MIME type against `['image/jpeg','image/png','application/pdf']` and size ≤ 10 MB (400 on failure); (4) read `ArrayBuffer`, call `verifyMagicBytes` (import pattern from `src/app/api/expenses/[id]/receipt/route.ts`); (5) base64-encode; (6) call `claude-haiku-4-5-20251001` via `@anthropic-ai/sdk` — images use `{ type: 'image', source: { type: 'base64', media_type, data } }`, PDFs use `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }` — prompt returns raw JSON only; (7) call `parseReceiptResponse()` on response text; (8) return `ParsedReceiptData` as JSON 200; return 500 on AI call failure; **file bytes discarded after extraction — never stored**

**Checkpoint**: `POST /api/expenses/parse-receipt` returns parsed data or structured errors. `npm test` passes for `receiptParser.test.ts`.

---

## Phase 3: User Story 1 — Drag a Receipt to Auto-fill the Form (Priority: P1) 🎯 MVP

**Goal**: Full-modal drag-and-drop that attaches the file, calls the parse endpoint, and pre-fills non-null form fields.

**Independent Test**: Open AddExpenseModal, drag a clear JPG receipt onto any part of the modal; verify the full-modal highlight overlay appears while dragging, "Reading receipt…" shows after drop, and Title/Amount/Currency/Date are pre-filled from the receipt.

### Implementation for User Story 1

- [ ] T005 [US1] Add state and refs to `AddExpenseModal.tsx` (`src/components/expenses/AddExpenseModal.tsx`) — add `dragOver: boolean`, `parsing: boolean`, `abortControllerRef: React.MutableRefObject<AbortController | null>` (via `useRef`); import `ParsedReceiptData` from `@/lib/receiptParser`
- [ ] T006 [US1] Add full-modal drag overlay to `AddExpenseModal.tsx` — add a `dragCounterRef = useRef(0)` to reliably track drag state across nested children (avoids `relatedTarget` flickering); attach to the outer modal `<div>`: `onDragEnter` (increment `dragCounterRef.current`, call `e.preventDefault()`, `setDragOver(true)`), `onDragOver` (call `e.preventDefault()` only — no state change needed), `onDragLeave` (decrement `dragCounterRef.current`; call `setDragOver(false)` only when counter reaches 0), `onDrop` (reset `dragCounterRef.current = 0`, `setDragOver(false)`, `e.preventDefault()`, extract file from `e.dataTransfer.files[0]`, delegate to `handleFileDrop`); when `dragOver` is true render a full-modal semi-transparent overlay `<div>` with border highlight and "Drop receipt here" label — overlay uses `position: absolute, inset: 0, zIndex: 10, pointerEvents: none` so it does not block drag events on the parent
- [ ] T007 [US1] Implement `handleFileDrop(file: File)` in `AddExpenseModal.tsx` — validate MIME type and size client-side (same constraints as existing `onChange` handler); on failure show toast error and return; on success: set `receiptFile(file)`, clear `removeReceipt`, abort any in-flight parse via `abortControllerRef.current?.abort()`, then call `triggerParse(file)`
- [ ] T008 [US1] Implement `triggerParse(file: File)` async function in `AddExpenseModal.tsx` — create new `AbortController`, store in `abortControllerRef.current`; capture `let timedOut = false` in closure; add 10-second timeout: `const timer = setTimeout(() => { timedOut = true; controller.abort() }, 10_000)`; set `parsing(true)`, clear `parseError`; `fetch('/api/expenses/parse-receipt', { method: 'POST', body: FormData with file, signal: controller.signal })`; on success: `clearTimeout(timer)`, parse JSON as `ParsedReceiptData`, apply non-null fields: `if (data.title) setTitle(data.title)`, `if (data.amount !== null) setAmount(String(data.amount))`, `if (data.currency) setCurrency(data.currency)`, `if (data.date) setExpenseDate(data.date)`; on `AbortError`: if `timedOut` is true treat as parse failure (error path in T010); if `timedOut` is false it was a user-triggered cancel (new file dropped) — silently ignore; on other errors delegate to error path (T010); always `clearTimeout(timer)` and `setParsing(false)` in finally
- [ ] T009 [US1] Show "Reading receipt…" indicator in `AddExpenseModal.tsx` — in the Receipt section, when `parsing` is true, render an inline spinner-free text indicator ("Reading receipt…" in `var(--ink-3)` at 12px) below the receipt file/remove UI; hide when `parsing` is false

**Checkpoint**: Drag a JPG/PNG/PDF onto the modal → full-modal highlight → file attached → "Reading receipt…" → fields pre-filled. Manual save completes successfully.

---

## Phase 4: User Story 2 — Graceful Fallback on Parsing Failure (Priority: P2)

**Goal**: When parsing fails entirely (all-null result, network error, or timeout), show a non-blocking notice; file stays attached; all form fields empty.

**Independent Test**: Drop a blank white PNG onto the modal; verify the file is attached, a non-blocking inline notice appears ("Couldn't read receipt details — please fill in manually"), and all form fields remain empty and editable.

### Implementation for User Story 2

- [ ] T010 [US2] Add `parseError: string | null` state to `AddExpenseModal.tsx` and wire error path in `triggerParse()` — on `fetch` failure (non-ok response, network error, `AbortError` from timeout, or all-null `ParsedReceiptData`): set `parseError('Couldn\'t read receipt details — please fill in manually')`; on `AbortError` from a new-file cancel (not timeout), do NOT set parseError (silent cancel); distinguish timeout abort from cancel abort using a `timedOut` boolean flag
- [ ] T011 [US2] Render `parseError` notice in `AddExpenseModal.tsx` — below the receipt section, when `parseError` is non-null, show a small non-blocking notice div (amber/warning styling using `var(--ink-3)` or a subtle amber token if available, 12px, no border, not a modal) with the error text; notice should have an `×` dismiss button that calls `setParseError(null)`

**Checkpoint**: Drop a blank file → file attached → notice appears → all fields empty → manually fill and save succeeds.

---

## Phase 5: User Story 3 — Click-to-Upload Parity (Priority: P3)

**Goal**: Selecting a file via the existing file `<input>` triggers the same parse-and-auto-fill flow as drag-and-drop.

**Independent Test**: Open AddExpenseModal, click the receipt file input, select a JPG; verify the same "Reading receipt…" + auto-fill behaviour as drag-and-drop.

### Implementation for User Story 3

- [ ] T012 [US3] Update the existing file `<input>` `onChange` handler in `AddExpenseModal.tsx` — after the existing MIME/size validation and `setReceiptFile(f)` call, also call `triggerParse(f)` (already implemented in T008); remove the `setReceiptFile` call from inside `handleFileDrop` to avoid duplication — `handleFileDrop` should call `setReceiptFile` then `triggerParse`; the `<input>` onChange should also call `setReceiptFile` then `triggerParse` (same sequence)

**Checkpoint**: Select via click → same "Reading receipt…" + auto-fill as drag path.

---

## Phase 6: Polish & Quality Gates

**Purpose**: Verify all quality gates from the constitution's Definition of Done pass.

- [ ] T013 [P] Run `npm test` — verify `receiptParser.test.ts` and all other tests pass; fix any failures
- [ ] T014 [P] Run `npm run build` — verify zero TypeScript type errors; fix any type errors (especially `ParsedReceiptData` imports and `AbortController` ref typing)
- [ ] T015 [P] Run `npm run lint` — verify zero ESLint warnings; fix any lint issues; confirm no `console.log` left in production code
- [ ] T016 Manual smoke-test per `specs/013-drag-file-expense-autofill/quickstart.md` — drag JPG, PNG, and PDF receipts; verify auto-fill; test rejection of invalid type and oversized file; test click-to-upload path; test new-file-while-parsing cancellation; **verify each auto-filled field (Title, Amount, Currency, Date) is individually editable after auto-fill before saving** (covers FR-008)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user story component work**
- **Phase 3 (US1)**: Depends on Phase 2 completion — builds `AddExpenseModal.tsx` changes
- **Phase 4 (US2)**: Depends on Phase 3 — extends `triggerParse()` error path
- **Phase 5 (US3)**: Depends on Phase 3 — wires existing input to same function
- **Phase 6 (Polish)**: Depends on Phases 3, 4, 5 all complete

### Within Phase 2

- T002 and T003 can run in **parallel** (different files, no dependency)
- T004 depends on T002 (imports `parseReceiptResponse`)

### Within Phase 3

- T005 first (adds state)
- T006, T007 can run in **parallel** after T005 (different responsibilities in same file — coordinate to avoid conflicts)
- T008 depends on T005, T006, T007
- T009 depends on T008 (needs `parsing` state wired first)

### Parallel Opportunities

```bash
# Phase 2 — parallel:
T002: src/lib/receiptParser.ts
T003: src/lib/receiptParser.test.ts

# Phase 3 — sequential within AddExpenseModal:
T005 → (T006 ∥ T007) → T008 → T009

# Phase 6 — parallel:
T013 (npm test) ∥ T014 (npm build) ∥ T015 (npm lint)
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Complete Phase 1 (T001)
2. Complete Phase 2 (T002–T004) — foundation ready
3. Complete Phase 3 (T005–T009) — drag-and-drop auto-fill working
4. **STOP and VALIDATE**: drag a receipt, verify auto-fill
5. Ship MVP

### Incremental Delivery

1. MVP (US1) → validates core value proposition
2. Add US2 (T010–T011) → graceful error handling
3. Add US3 (T012) → click parity
4. Polish (T013–T016) → quality gates

---

## Notes

- [P] tasks = different files or independent responsibilities, no shared dependencies at that point
- T003 and T004 can run in parallel with T002 since tests don't depend on implementation existing (write the tests to the interface)
- `verifyMagicBytes` and `sanitizeFilename` patterns should be copied/imported from `src/app/api/expenses/[id]/receipt/route.ts` — do not duplicate logic, extract if reuse grows
- `AbortController` timeout abort vs. user-triggered (new file) abort: distinguish using a `timedOut` boolean captured in closure to show error only on timeout, not on intentional cancel
- Never call `git add -A`; stage only the three files: `src/lib/receiptParser.ts`, `src/lib/receiptParser.test.ts`, `src/app/api/expenses/parse-receipt/route.ts`, `src/components/expenses/AddExpenseModal.tsx`

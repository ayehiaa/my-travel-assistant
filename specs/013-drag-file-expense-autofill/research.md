# Research: Receipt Drag-and-Drop with AI Auto-fill

## Decision 1 — AI model for receipt parsing

**Decision**: `claude-haiku-4-5-20251001` (same model used in `gmailParser.ts`)

**Rationale**: Haiku 4.5 (Oct 2025) supports both `image` content type (JPG/PNG) and `document` content type (PDF) confirmed in SDK v0.92.0 source. It is the project's established model for AI extraction tasks, is fast enough to meet the ≤8 s p95 target, and keeps costs low. Sonnet would improve accuracy on ambiguous receipts but is not necessary for a well-formatted receipt.

**Alternatives considered**:
- `claude-sonnet-4-6`: Higher accuracy; rejected as over-engineered for standard receipts and would increase latency/cost
- Third-party OCR (e.g., Google Vision, AWS Textract): Requires additional subscription and infrastructure; rejected because `@anthropic-ai/sdk` is already installed and configured

---

## Decision 2 — File encoding strategy per type

**Decision**: Send images as `{ type: 'image', source: { type: 'base64', media_type, data } }` and PDFs as `{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`

**Rationale**: The Anthropic SDK v0.92.0 natively supports both content types in a single `messages.create` call. No rasterisation of PDFs is required — the model reads the PDF content directly. This keeps the API route simple (no additional dependencies).

**Alternatives considered**:
- Rasterise PDFs to PNG server-side (e.g., `pdf2pic` / `sharp`): Adds a heavy dependency and build overhead; rejected
- Send all files as images: PDFs cannot be sent as `image` type; rejected

---

## Decision 3 — API route location

**Decision**: `POST /api/expenses/parse-receipt` (new route file at `src/app/api/expenses/parse-receipt/route.ts`)

**Rationale**: Groups the endpoint logically under the expense resource namespace. Consistent with existing `POST /api/expenses/:id/receipt` pattern in the codebase.

**Alternatives considered**:
- `POST /api/parse-receipt` (top-level): Less cohesive with the expense domain; rejected

---

## Decision 4 — Prompt design

**Decision**: Single-turn prompt returning raw JSON only. Modelled on the `gmailParser.ts` pattern (no markdown fences, literal `null` string for complete failure).

**Response schema**:
```json
{
  "title": "<merchant/payee name or null>",
  "amount": <numeric total or null>,
  "currency": "<ISO 4217 code e.g. GBP or null>",
  "date": "<YYYY-MM-DD or null>"
}
```

**Rationale**: The existing `gmailParser.ts` establishes this exact pattern — request raw JSON, parse with `JSON.parse`, return `null` string on full failure. Re-using the pattern keeps the codebase consistent and avoids complex prompt engineering.

**Alternatives considered**:
- Structured outputs / tool use: More reliable but requires more tokens and API complexity; not necessary for a constrained 4-field schema

---

## Decision 5 — Drag-and-drop UX implementation

**Decision**: Native HTML5 drag events (`onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`) on the modal wrapper `<div>`. No external drag-and-drop library.

**Rationale**: The modal is a single `<div>` — native events are sufficient and add zero bundle weight. The project avoids unnecessary dependencies (CLAUDE.md: "don't add features beyond what the task requires").

**Alternatives considered**:
- `react-dropzone`: Provides accessible drop zone with ARIA; rejected as over-engineered for a single modal integration

---

## Decision 6 — Parse cancellation for concurrent drops

**Decision**: Use an `AbortController` ref in the component. Each new file drop/selection creates a new controller, aborting the previous fetch before starting the next.

**Rationale**: The spec (FR-011) requires that a new file drop cancels any in-progress parse. `AbortController` is the standard Web API for this — no additional state management needed.

---

## Decision 7 — Client-side timeout

**Decision**: 10-second `AbortController` timeout on the fetch to the parse endpoint (covers server-side AI call + network). Aligns with SC-003's 8 s p95 target with 2 s margin.

**Rationale**: Prevents the user from seeing a spinning indicator indefinitely if the AI call stalls. On timeout, the graceful fallback path (FR-009) applies.

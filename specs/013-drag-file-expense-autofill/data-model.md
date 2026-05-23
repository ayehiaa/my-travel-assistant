# Data Model: Receipt Drag-and-Drop with AI Auto-fill

## New DB entities

None. This feature introduces no new database tables or columns. File bytes are
discarded after parsing; the existing `receipt_url` / `receipt_name` columns on
`expenses` are unchanged.

## New runtime types

### `ParsedReceiptData` (TypeScript interface — shared between route and component)

Location: can be inlined in `route.ts` and imported by the client via an API
response type; or defined in `src/types/` if reuse grows.

```ts
interface ParsedReceiptData {
  title:    string | null   // merchant / payee name
  amount:   number | null   // total amount paid (positive)
  currency: string | null   // ISO 4217 code, e.g. "GBP"
  date:     string | null   // YYYY-MM-DD
}
```

**Validation rules**:
- `title`: trimmed string, max 200 chars (matching the `expenses.title` column constraint), or null
- `amount`: non-negative number, or null
- `currency`: 1–10 char uppercase string, or null (matching `expenses.currency`)
- `date`: ISO date `YYYY-MM-DD`, or null

### Component state additions to `AddExpenseModal`

| State field | Type | Purpose |
|---|---|---|
| `dragOver` | `boolean` | Controls full-modal highlight overlay |
| `parsing` | `boolean` | Shows "Reading receipt…" indicator |
| `parseError` | `string \| null` | Inline non-blocking notice |
| `abortControllerRef` | `React.MutableRefObject<AbortController \| null>` | Cancels in-flight parse on new file |

## API surface (no new DB migrations required)

| Route | Method | Auth | Body | Response |
|---|---|---|---|---|
| `/api/expenses/parse-receipt` | POST | Required (getAuthUser) | `multipart/form-data` · field `file` (JPG/PNG/PDF, max 10 MB) | `ParsedReceiptData` (200) or `{ error }` (400/401/500) |

## File lifecycle

```
User drops/selects file
  → Component validates type + size (client-side, <1s)
  → File set as pending receiptFile state
  → File sent to POST /api/expenses/parse-receipt (multipart)
      → Route validates type + size + magic bytes (server-side)
      → Base64-encoded, sent to Claude API
      → Response parsed → ParsedReceiptData returned
      → File bytes DISCARDED (never stored)
  → Component applies non-null fields to form state
  → User saves expense → existing receipt upload flow (unchanged)
      → File stored to Supabase Storage at that point
```

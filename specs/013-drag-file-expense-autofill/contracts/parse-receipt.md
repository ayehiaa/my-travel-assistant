# Contract: POST /api/expenses/parse-receipt

## Overview

Accepts a receipt file, extracts expense details via AI vision, and returns
structured data. The file is **never stored** — bytes are discarded after extraction.

## Request

```
POST /api/expenses/parse-receipt
Content-Type: multipart/form-data
Authorization: session cookie (Supabase)
```

**Body fields**:

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `file` | File | Yes | JPG, PNG, or PDF · max 10 MB |

## Response — 200 OK

```json
{
  "title":    "Costa Coffee",
  "amount":   4.75,
  "currency": "GBP",
  "date":     "2026-05-21"
}
```

Any field may be `null` if the model could not extract it from the receipt.

```json
{
  "title":    null,
  "amount":   4.75,
  "currency": "GBP",
  "date":     null
}
```

## Response — Error codes

| Status | `error` value | When |
|--------|---------------|------|
| 401 | `"Unauthorized"` | No valid session |
| 400 | `"No file provided"` | `file` field missing from form data |
| 400 | `"Invalid file type. JPG, PNG or PDF only."` | MIME type or magic bytes mismatch |
| 400 | `"File too large. Max 10 MB."` | File exceeds 10 MB |
| 500 | `"Failed to parse receipt"` | AI call failed or response could not be decoded |

## Security notes

- Auth check is the first operation in the handler (Principle I)
- File type is validated by MIME type AND magic bytes (reuses `verifyMagicBytes` from `receipt/route.ts`)
- File bytes are not stored, logged, or forwarded to any service other than the Anthropic API
- Response never includes raw file bytes

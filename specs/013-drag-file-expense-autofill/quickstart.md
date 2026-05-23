# Quickstart: Receipt Drag-and-Drop with AI Auto-fill

## Prerequisites

- `ANTHROPIC_API_KEY` is already set in `.env.local` ✅
- `@anthropic-ai/sdk ^0.92.0` is already installed ✅
- No new npm packages required
- No database migrations required

## Testing the feature locally

1. Start dev server: `npm run dev`
2. Log in and open the Expenses page
3. Click **Add expense** to open the modal
4. Drag a JPG, PNG, or PDF receipt onto any part of the modal
5. Observe the full-modal highlight overlay while dragging, then the "Reading receipt…" indicator after drop
6. Verify Title, Amount, Currency, and Date are pre-filled from the receipt content
7. Edit any incorrect fields, select a Category, and click **Add expense**

## Testing the parse endpoint directly

```bash
curl -X POST http://localhost:3000/api/expenses/parse-receipt \
  -H "Cookie: <your-session-cookie>" \
  -F "file=@/path/to/receipt.jpg"
```

Expected response:
```json
{ "title": "...", "amount": 4.75, "currency": "GBP", "date": "2026-05-21" }
```

## Running tests

```bash
npm test                    # all tests including receiptParser.test.ts
npm run build               # verify zero type errors
npm run lint                # verify zero lint warnings
```

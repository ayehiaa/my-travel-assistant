# Tasks: 020 Order Execution Engine

## Pure logic (tests first-class)
- [x] T1 `src/types/database.ts`: extend `AlpacaOrderResult` (optional lifecycle fields), `ExecutionStatus`, `ExecutionEnvelope`
- [x] T2 `src/lib/tradeExecution.ts`: `buildClientOrderId`, `classifyAlpacaOrderStatus`, `decideMarketWait`, `planOrders` (notional / fractional / whole-share / full exit / GFV skip / Shariah), `computeBuyingCapacity`, `scaleBuysToCapacity`, `applyOrderSnapshot`, `deriveExecutionStatus`, `normalizeExecution`, `settlementLookbackStart` (tested)

## Alpaca I/O
- [x] T3 `alpacaClient.ts`: `fetchClock`, `fetchAsset`, `fetchBuyingInputs`, `submitOrder` (notional + client_order_id + order snapshot), `fetchOrder`, `fetchOrderByClientId`, `cancelOrder`, `fetchRecentBuySymbols`; `fetchPosition` uses parseFloat
- [x] T4 `tradeExecution.ts`: `loadPlanInputs()` shared by preview and engine

## Engine + API
- [x] T5 `src/inngest/executeTrades.ts` + registration
- [x] T6 `tradeExecutionRequest.ts` + execute route → 202 (insert-first 409, delete row on send failure, audit)
- [x] T7 `GET /api/portfolio/alpaca/executions/[id]` (auth, role, Zod, ownership)
- [x] T8 Preview route uses the shared planner (notional for buys, qty for sells, Alpaca clock)

## UI
- [x] T9 `AlpacaOrderPreview`: dollar amounts for buys, qty for sells
- [x] T10 `AlpacaExecuteButton`: 202 flow; `AlpacaResultsPanel`: polling, execution status, per-order chips + fills
- [x] T11 Recommendation page / detail use `normalizeExecution`

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint` (0 errors); no `console.log`

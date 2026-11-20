# Tasks: 020 Order Execution Engine

## Pure logic (tests first-class)
- [ ] T1 `src/types/database.ts`: extend `AlpacaOrderResult` (optional lifecycle fields), `ExecutionStatus`, `ExecutionEnvelope`
- [ ] T2 `src/lib/tradeExecution.ts`: `buildClientOrderId`, `classifyAlpacaOrderStatus`, `decideMarketWait`, `planOrders` (notional / fractional / whole-share / full exit / GFV skip / Shariah), `computeBuyingCapacity`, `scaleBuysToCapacity`, `applyOrderSnapshot`, `deriveExecutionStatus`, `normalizeExecution`, `settlementLookbackStart` (tested)

## Alpaca I/O
- [ ] T3 `alpacaClient.ts`: `fetchClock`, `fetchAsset`, `fetchBuyingCapacity`, `submitOrder` (notional + client_order_id + order snapshot), `fetchOrder`, `fetchOrderByClientId`, `cancelOrder`, `fetchRecentBuySymbols`; `fetchPosition` uses parseFloat
- [ ] T4 `tradeExecution.ts`: `loadPlanInputs()` shared by preview and engine

## Engine + API
- [ ] T5 `src/inngest/executeTrades.ts` + registration
- [ ] T6 `tradeExecutionRequest.ts` + execute route → 202 (insert-first 409, delete row on send failure, audit)
- [ ] T7 `GET /api/portfolio/alpaca/executions/[id]` (auth, role, Zod, ownership)
- [ ] T8 Preview route uses the shared planner (notional for buys, qty for sells, Alpaca clock)

## UI
- [ ] T9 `AlpacaOrderPreview`: dollar amounts for buys, qty for sells
- [ ] T10 `AlpacaExecuteButton`: 202 flow; `AlpacaResultsPanel`: polling, execution status, per-order chips + fills
- [ ] T11 Recommendation page / detail use `normalizeExecution`

## Quality gate
- [ ] Q1 `npm run build`, `npm test`, `npm run lint` (0 errors); no `console.log`

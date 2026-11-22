# Implementation Plan: Real Return vs Target + Explicit Cash Allocation

**Spec**: `spec.md` · **Migration**: none (jsonb fields in `recommendations.agent_outputs`)

## Constitution check
- Pure logic in `src/lib/` with Vitest tests next to the files; no Supabase / Next mocks.
- Zod at boundaries: synthesizer output schema, readers of stored `agent_outputs` fields.
- Trading safety: no guard weakened; a new refusal (reserved cash words) added to `getBuyBlockReason`, which every BUY
  path already calls (preview planner, engine planner, engine per-order re-check). No new execution path.
- Credentials stay inside the Inngest step; no new env vars; no console.log.

## Design

| Area | File | Change |
|---|---|---|
| Return metrics | `src/lib/returnMetrics.ts` (new) | target conversion, prorating, annualising, window choice, TWR, verdict builder, per-holding momentum, stored reader |
| Cash | `src/lib/cashAllocation.ts` (new) | reserved words, extraction, normalisation with cash, rescale to (100 − cash), residual cash, stored reader, `__cash__` row key |
| Alpaca client | `src/lib/alpacaClient.ts` | `fetchPortfolioHistory` also parses `profit_loss` |
| Synthesizer | `src/inngest/synthesizer.ts` | `cash_target_pct` in schema + `finaliseSynthesis`; `CASH_RULES`; `buildPerformanceSection` (real figures / insufficient history / momentum input) |
| Pipeline | `src/inngest/portfolioAnalysis.ts` | new step `fetch-return-history`; validate-tickers returns `{ allocation, cash_target_pct }`; screening with cash; action list with cash; store `cash_allocation` + `return_metrics` in `agent_outputs` |
| Screening | `src/lib/shariahRules.ts` | `applyShariahScreening(…, cashTargetPct?)` → `cash_target_pct`; drops reserved words; `getBuyBlockReason` refuses reserved words first (`RESERVED_CASH_SKIP_REASON`) |
| Actions | `src/lib/portfolioCalculator.ts` | `computeActionList(…, cashTargetPct?)`; old `computePortfolioReturnMetrics` removed |
| Allocation utils | `src/lib/allocationUtils.ts` | unused `removeTickers` / `normaliseTo100` removed |
| UI | `portfolioHub.ts`, `AllocationBars.tsx`, `RebalanceTab.tsx`, `RebalanceView.tsx`, `ReturnVsTarget.tsx` (new) | explicit cash row with `__cash__` key; "Performance vs target" card from stored metrics |

## Inngest memoisation / compatibility
- A run in flight across the deploy may have a memoised synthesizer result without `cash_target_pct`; the
  validate-tickers step re-extracts reserved words with `cash ?? 0`, so it behaves like the old flow.
- Old recommendations have no `cash_allocation` / `return_metrics`: readers return null → remainder cash, no card.

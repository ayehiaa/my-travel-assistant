# Tasks: Real Return vs Target + Explicit Cash Allocation

- [x] T001 Spec, plan, tasks; `.specify/feature.json`; CLAUDE.md "Current Feature Plan"
- [x] T002 `src/lib/returnMetrics.ts` + tests (TWR with deposits, compounding, prorating, insufficient history, monthly conversion, window, momentum, stored reader)
- [x] T003 `src/lib/cashAllocation.ts` + tests (reserved words, extraction, normalisation with cash, rescale, residual, stored reader)
- [x] T004 `fetchPortfolioHistory` parses `profit_loss`
- [x] T005 Synthesizer: `cash_target_pct` schema + `finaliseSynthesis`, `CASH_RULES`, `buildPerformanceSection` + tests
- [x] T006 Pipeline: `fetch-return-history` step, cash through validation / screening / action list, store `agent_outputs.cash_allocation` + `return_metrics`
- [x] T007 `applyShariahScreening` with cash (cap leftover → cash, reserved words dropped) + tests
- [x] T008 Buy guard: `getBuyBlockReason` refuses reserved words (preview + engine planner + engine re-check) + tests incl. `planOrders`
- [x] T009 `computeActionList` with cash target + tests; remove `computePortfolioReturnMetrics`, `removeTickers`, `normaliseTo100`
- [x] T010 UI: `computeAllocationDrift` explicit cash + `__cash__` key, `AllocationBars`, `ReturnVsTarget` card on the Rebalance view
- [x] T011 Quality gate: build, test, lint; commit + push

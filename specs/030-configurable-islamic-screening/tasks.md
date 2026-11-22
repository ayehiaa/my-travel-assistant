# Tasks: Configurable Islamic Screening

- [ ] T001 Spec, plan, tasks; feature.json; CLAUDE.md "Current Feature Plan"
- [ ] T002 `src/lib/screeningConfig.ts` + tests (effective config, read defaults, labels, weakenings)
- [ ] T003 Types: `ScreeningCheck`, `TickerScreening.checks?`, `ShariahScreeningResult.config?`
- [ ] T004 `decideTickerVerdict` with config + tests for every combination
- [ ] T005 `getBuyBlockReason` with current config + tests per combination; result schema/config storage
- [ ] T006 `buildScreeningMandate` / `withIslamicMandate(prompt, cfg)` + tests; agents + synthesizer wiring
- [ ] T007 Reviewer: mode prompts, per-mode schema, skip + tests
- [ ] T008 Pipeline wiring in `portfolioAnalysis.ts` (config from settings row, skip financials / reviewer)
- [ ] T009 Execution: `loadScreeningConfig`, `PlanInput.screeningConfig`, preview + engine
- [ ] T010 Settings API (Zod, confirm, best-effort write, audit) + `AuditAction`
- [ ] T011 UI: ScreeningSettingsCard with confirmation dialog; status chip; Rebalance card; holdings badges
- [ ] T012 Notifications: divest + weekly only when Islamic on, enabled parts only + tests
- [ ] T013 Migration `20261122e_screening_settings.sql` + `supabase/apply_screening_settings.sql` (tested locally if possible)
- [ ] T014 Quality gate: build, test, lint; commit + push

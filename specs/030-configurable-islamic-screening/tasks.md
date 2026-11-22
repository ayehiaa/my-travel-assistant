# Tasks: Configurable Islamic Screening

- [x] T001 Spec, plan, tasks; feature.json; CLAUDE.md "Current Feature Plan"
- [x] T002 `src/lib/screeningConfig.ts` + tests (effective config, read defaults, labels, weakenings)
- [x] T003 Types: `ScreeningCheck`, `TickerScreening.checks?`, `ShariahScreeningResult.config?`
- [x] T004 `decideTickerVerdict` with config + tests for every combination
- [x] T005 `getBuyBlockReason` with current config + tests per combination; result schema/config storage
- [x] T006 `buildScreeningMandate` / `withIslamicMandate(prompt, cfg)` + tests; agents + synthesizer wiring
- [x] T007 Reviewer: mode prompts, per-mode schema, skip + tests
- [x] T008 Pipeline wiring in `portfolioAnalysis.ts` (config from settings row, skip financials / reviewer)
- [x] T009 Execution: `loadScreeningConfig`, `PlanInput.screeningConfig`, preview + engine
- [x] T010 Settings API (Zod, confirm, best-effort write, audit) + `AuditAction`
- [x] T011 UI: ScreeningSettingsCard with confirmation dialog; status chip; Rebalance card; holdings badges
- [x] T012 Notifications: divest + weekly only when Islamic on, enabled parts only + tests
- [x] T013 Migration `20261122e_screening_settings.sql` + `supabase/apply_screening_settings.sql` (tested locally if possible)
- [x] T014 Quality gate: build, test, lint; commit + push

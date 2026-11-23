# Implementation plan: Lifestyle UX redesign

## Approach
Split each tab into a **server loader** (unchanged queries) and a **presentational view** with a plain model
(`TodayView`, `FoodView`, `TrainOverview`, `ProgressView`, `PlanOverview`), so the dev preview renders the real views
with fixtures. Shared primitives in `src/components/health/ui/`. Pure helpers in `src/lib/health/lifestyleUi.ts`.

## Files
- `src/lib/health/healthHub.ts` — new tab names, `LEGACY_HEALTH_TABS`, `legacyTabRedirect`, `settings` view.
- `src/lib/health/lifestyleUi.ts` (+ test) — meters/tones, component chips, foods for a component, effort mapping,
  set prefill, week dots, phase label, week chip, entry summary, recent foods, chart ranges, short labels,
  food-goal adherence.
- `src/components/health/ui/` — Bar, Meter, StatTile, Chip, InfoPopover, Disclosure, ListRow/ListGroup, OverflowMenu,
  BottomSheet/SheetTrigger, Section (button classes), tone.
- Today: `TodayTab` (loader) + `TodayView`, `ComponentChipsRow`, `StepsInline`, `relog.ts`, compact `CheckinCard`.
- Food: `LogTab` (loader) + `FoodView`, `FoodLogSheet`, `RecentFoods`, `LogDatePicker`, compact `QuickLog`,
  `FoodItemsEditor`, `FoodEntryCard` (sheet), `NoAddedFatToggle` chip.
- Train: `TrainingTab` (overview model + `TrainOverview`), `SessionPlayer` (Hevy-style).
- Progress: `ProgressTab` (loader) + `ProgressView`, `TrendChart`; bare modes for Waist/Labs/Milestones/Photos.
- Plan: `ProgrammeTab` (`PlanOverview`, `SettingsView`), `ProgrammeViews` (back header).
- Hub: `src/app/health/page.tsx` (redirects, FAB), `HealthTabs`, `LifestyleFab`.
- Dev: `src/app/dev/lifestyle-preview/{page,fixtures}.tsx`, `src/middleware.ts` bypass (non-production only).

## Word-count estimate (Today, primary UI, typical day)
Before ≈ 420 words visible (travel/eating-out list, check-in hint, 6 target bars with status words, component list,
meals list with plan templates, recommendation list, weight/sleep sentences, cardio form labels, quick-log tips).
After ≈ 150 words (3 meters, 6 chips, one check-in row, one action, 3 plan rows, notices). ≈ 64 % less.

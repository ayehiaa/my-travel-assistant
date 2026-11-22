# Implementation Plan: Health & Daily Routines (spec 029)

**Spec**: ./spec.md · **Constitution**: auth-first routes, Zod at boundaries, logAudit on writes, pure tests next to files.
One plan for the whole module, one section per build phase (§13).

---

## Phase P1a — Daily loop (data model, add-on, consent, enrolment, check-in, food logging, Today)

### Technical context
Next.js 16 App Router, Supabase (Postgres + Storage), Zod 4, Vitest, Tailwind v4. AI via `callClaude()` (extended
with optional base64 image blocks) and the user's own key (`resolveAiKeyForUser`, spec 026). Photo processing with
`sharp` (ships with Next) plus a pure JPEG metadata stripper as fallback. Open Food Facts public API for packaged food.

### Design
- **Pure logic** (`src/lib/health/`, all tested):
  - `programmeSchema.ts` — Zod schema for the whole programme definition (every §3.1 row: identity, energy & macros,
    components, meal slots, rotation, typed nutrition rules, eating out, training sessions/exercises, weekly schedule,
    blocks, progression, movement restrictions, pain rules, cardio, daily movement, sleep, supplements, tracking,
    adjustment, milestones, outcomes) + cross-field checks (duplicate keys, unknown sessions, ceiling ≥ target).
  - `seedProgramme.ts` — the 12-week template as a code constant (`SEED_TEMPLATE_KEY = 'seed-12wk-v3'`).
  - `targets.ts` — profile schema, Mifflin-St Jeor/TDEE, `computeTargets()` with a human-readable formula per target,
    overrides, safety floor.
  - `time.ts` — timezone day boundaries, ISO weeks, programme week, DST-safe zoned instants.
  - `checkin.ts` — 7-day average (≥3 weigh-ins), trend, rate/week, creatine water-weight note, sleep duration,
    consistency vs ±window.
  - `nutrition.ts` — item/entry schemas, totals, remaining budget, ±15% band, slot suggestion, component progress.
  - `rules.ts` — rules engine (§6.1 types P1a data supports) + §6.2 ranking (max 3), fixed template wording.
  - `foodLibrary.ts`, `foodEstimate.ts`, `openFoodFacts.ts`, `exif.ts`, `healthHub.ts`.
- **Server**: `healthServer.ts` (guards, state machine migration→consent→enrolment→active, loaders, rule storage,
  library writes), `healthPhotos.ts` (sanitise, upload, signed URLs, delete), `openFoodFactsClient.ts` (cached search).
- **API** (`src/app/api/health/*`): `consent` POST, `enrol` POST, `checkin` POST, `food/estimate` POST (multipart),
  `food` POST, `food/[id]` PATCH/DELETE, `foods/search` GET. All: auth → Health add-on (members only) → Zod → DB.
- **UI**: `/health?tab=today|log|training|progress|programme`, components in `src/components/health/`
  (HealthTabs mirrors the Portfolio HubTabs; LineChart reused from the portfolio hub).
- **Access**: `FeatureKey` + `'health'`, admin toggle ("Health enabled" + last log date only), invitation checkbox,
  invitation e-mail bullet, Nav link, `/api/portfolio/ai-key` accepts Health users (shared key card).

### Data model (migration `20261122_health_p1a.sql`, paste-ready `supabase/apply_health_p1a.sql`)
`health_consents`, `health_programmes` (user copy of the template definition — versioning point),
`health_enrolments` (profile, overrides, effective targets, timezone, status; one active per user),
`health_daily_logs` (user + local date), `health_checkins`, `health_food_entries` (slot, local time, eaten_at, text,
restaurant flag, ≤4 photo paths), `health_food_items` (nutrition, components jsonb, confidence, source, treat flag),
`health_food_library` (per-100 g values + default portion), `health_rule_events` (one per user/date/rule key),
`health_nutrition_cache` (Open Food Facts, service role only). Owner-only RLS (`user_id = auth.uid()`) on every
health table, items/enrolments additionally checked against their parent's owner. Bucket `health-photos` (private).
Features CHECKs + audit action CHECK (full list + `health_consent_given`, `health_programme_activated`).
Tested locally against PostgreSQL 16 with Supabase stubs: applies, re-runs cleanly, RLS blocks cross-user reads/writes.

### Decisions made autonomously (P1a)
1. **Template as code constant**, copied into `health_programmes` on enrolment so later template edits never change an
   active programme silently (versioning = new row).
2. **Seed exercise lists reconstructed**: the spec gives only counts/focus (A upper 7, B lower knee-friendly & core 9,
   C full body 8). Exercises were chosen to respect every excluded movement (no squats/lunges/step-downs/kneeling,
   wall sit ≤45°). **Owner should check them against the PDF** before P1b ships the player. Same for the meal-rotation
   options (only "Sat lunch = flex" is specified).
3. **Energy personalisation**: seed uses `tdee_deficit` (Mifflin-St Jeor × activity − 500 kcal, rounded to 50, floor
   1500 ♂ / 1200 ♀). For a profile like the author's (≈80.5 kg, 180 cm, 40 y, moderate) this reproduces 2,200 kcal /
   145 g P / 75 g fat / 235 g carbs exactly (tested). Fat = 30% of kcal; sat fat 15/18 g and fibre 35 g stay fixed.
   Every target can be overridden in the wizard; formulas are shown.
4. **Fortnightly adjustment bands**: spec gives <0.4 → −150, 0.6–0.9 → none, >1.2 → +150; the gaps (0.4–0.6, 0.9–1.2)
   are treated as "no change" (most conservative). Engine itself is P2.
5. **Rules thresholds** (deterministic, tested): sat fat "at risk" at ≥75% of target with meals left; kcal at risk at
   ≥85% with meals left; protein/fibre "behind pace" below 80% of the pace through the eating window (first slot start
   → last slot end), protein from 12:00, fibre from 16:00; daily components nudge after their `nudgeAfter` (default
   16:00; stanols 17:00); weekly components fire when days left ≤ 2 × remaining; caffeine counts from 15 mg; protein
   every occasion only for entries ≥100 kcal with <10 g protein; last-meal rule uses the programme bedtime or the
   median bedtime of the last 7 check-ins (skipped if unknown); treats = AI/user flag and ≥200 kcal.
6. **AI wording off** — fixed template text only (spec: optional). AI never decides whether a rule fired.
7. **Food library**: only items the user ticks "Remember" (auto-ticked when edited or entered by hand) are saved —
   saving every AI guess would make the library override future estimates with unverified values.
   Text logs where every part matches the library skip the AI entirely (free, instant).
8. **Open Food Facts**: used only for items the AI flags as a branded packaged product (max 3 per estimate, 4 s
   timeout) and from the editor's search box; results cached 30 days in a shared table (public data, no personal data;
   User-Agent `SojournHealthDiary/1.0 (personal nutrition diary)`, only search words are sent).
   **CoFID** (UK Composition of Foods Integrated Dataset) is **not bundled** in P1a: it is © Crown/PHE under the Open
   Government Licence, which would allow bundling, but a reliable subset needs curation (component mapping for
   beta-glucan/stanols is not in CoFID) — documented as a P2/P3 bundled dataset.
9. **Photos**: client downsizes to ≤1568 px JPEG (canvas re-encode drops EXIF); server re-encodes with sharp (drops all
   metadata) or strips APP1/APP13/COM when sharp fails; private bucket, service-role access only, 1-hour signed URLs;
   deleted with the entry. Photos uploaded for an estimate that is then discarded remain until the P2 30-day cleanup.
10. **Audit**: consent and programme activation are audited (no profile/health values); food/check-in writes are not
   (spec §8: no food details in audit). Assistants never see `health_*` audit entries (filtered in /audit and
   /api/audit), because assistants can read the member's audit log.
11. **Timezone**: from the enrolment (browser default in the wizard). Travel-aware switching is P2 (travel mode).
12. **No migration applied** → `/health` shows "Health needs a database update"; admin toggle / invite with Health
   returns a clear "apply supabase/apply_health_p1a.sql" error (CHECK violation 23514 detected); signup retries the
   access columns without `health` so the plan is still granted.
13. Model for food estimation: Sonnet 5.5, effort `low`, 6k max tokens (`health_food` role) — the only model in
    `aiModels.ts`; fast enough for the ≤10 s target in typical cases.

### Risks / limitations
- AI estimate latency depends on photo count; OFF lookups add up to 4 s when a packaged product is detected.
- No browser run here (no Supabase credentials) — UI reviewed by reading markup at 375 px / desktop widths.
- Programme editing, import, pause/complete, data export/delete, weekly review and the 30-day photo cleanup are later
  phases (P2/P3) per §13.

---

## Phase P1b — Training (session player, block logic, progression, joint/pain rules, unlocks)

### Design
- **Pure logic** (`src/lib/health/`, all tested):
  - `training.ts` — week/block position; `effectivePrescription()` per exercise and week; compound/isolation
    classification; drop-set exercise choice; excluded-movement matching; travel names; conditional-unlock status and
    the concrete unlock exercises; `progressionSuggestion()` (load / hold / band / bodyweight / stall); schedule
    (`weekSchedule`, `recommendSession`, `spacingWarning`, `orderWarning`); `preTrainingCoffee()`; workout input
    schema + `validateWorkoutAgainstProgramme()`; player/history helpers.
  - `painRules.ts` — per-check outcome (ok / pending / reduce / red_flag), `jointStatus()` for the next session,
    `painRulePassed()` (last 2 pain-check sessions), `exerciseSafety()`, `nextMorningDue()`, input schemas.
  - `rules.ts` — optional `training` context: safety findings (red flag → "stop, see your physiotherapist"; reduce on a
    day with joint-watched work) and the pre-training coffee timing rule. Food rules are unchanged.
- **Server**: `trainingServer.ts` (loaders for workouts, joint checks, approvals, exercise history; one
  `loadTrainingContext()` used by Training, Today and the API; every loader maps a missing table to
  "Training needs a database update"). `healthServer.evaluateDay()` adds training signals best-effort (today only).
- **API**: `POST /api/health/workouts` (upsert by user + date + session; sets replaced; joint check upserted for
  pain-check sessions, keeping any next-morning answer), `DELETE /api/health/workouts/[id]`,
  `POST /api/health/joint-checks` (`next_morning` | `clearance`), `POST /api/health/approvals` (tick / untick).
  All: auth → Health add-on → Zod → enrolment → programme validation → DB.
- **UI**: Training tab overview (week/block banner, joint status + clearance, today's recommendation, this week's
  schedule with statuses, joint & unlocks with the "approved by my physio" tick, recent sessions with delete, exercise
  history links); session player `?tab=training&session=a[&date=…]` (`SessionPlayer.tsx`); exercise history
  `?tab=training&exercise=key` (table + top-set chart, reusing the portfolio `LineChart`). Today: next-morning joint
  check card + "Today's training" card. Log: the day's sessions and joint scores.

### Data model (migration `20261122b_health_p1b.sql`, paste-ready `supabase/apply_health_p1b.sql`)
`health_workouts` (user, daily log, enrolment, local date, session key, block key, programme week, status
done|partial|skipped with a required skip reason, travel mode, duration, notes, skipped exercises jsonb; unique per
user + date + session), `health_workout_sets` (exercise key, set index, load kg, reps or hold seconds, RIR or
to_failure, drop-set flag, substitution name), `health_joint_checks` (one per workout: date, session, during-session
pain 0–10, next-morning pain 0–10 + date, swelling, red flags text[], physio clearance flag + date),
`health_professional_approvals` (unlock key, approved_at; unique per user + key). Owner-only RLS on all four; sets and
joint checks must also belong to the user's own workout; workouts may only reference the user's own daily log and
enrolment. Pre-check: P1a tables exist. Tested on local PostgreSQL 16 with Supabase stubs: P1b before P1a stops with
the message, applies after P1a, re-runs cleanly, skip-without-reason rejected, cross-user reads return 0 rows and
cross-user child inserts are rejected by RLS.

### Decisions made autonomously (P1b)
1. **Block 2 set counts** come from the session tables as written ("set counts as in the session tables"), so Session
   B keeps 4 sets on the shallow wall sit and Session C 4 on the chest-supported row; the parenthetical "4 on the first
   two exercises" is what the table already gives for Session A. Block 1 = 3 sets everywhere; Block 3 = 4 everywhere.
2. **Rep ranges**: block ranges replace the table's; a rep suffix is kept ("12 each way" → "10–15 each way" in
   Block 1). Hold exercises keep their hold time in every block (no failure / drop sets on holds) and have no RIR.
3. **Compound vs isolation (Block 3)**: name-based — press, row, pulldown, deadlift/RDL, hip thrust, push-up are
   compounds (6–12); raises, curls, extensions, face pulls, pull-aparts, side-steps, calf raises, knee extensions,
   bridges and core are isolation (12–20).
4. **Drop set**: one exercise per session — the last non-core, rep-based, non-joint-watched dumbbell exercise
   (A: lateral raise, B: standing calf raise, C: overhead triceps extension); fallback the last non-core rep exercise.
5. **Light / deload weeks**: light week = 2 sets, no failure/drop set; the load factor is read from the block note
   ("60%" → 0.6, Block 2 week 8 only). Week 12 deload = half the sets (rounded), plus a retest note. No progression
   suggestions during light/deload weeks; the week after a light week returns to the last normal load.
6. **Progression**: needs every prescribed set at the top of the range with RIR (or failure) recorded. Increment per
   dumbbell from the programme (+2 upper / +4 lower; core/full use the upper increment). Bands → "shorter band / step
   further / thicker band"; unloaded → slower tempo / pause. **Holds**: +15 s when every set reached the target, cap
   90 s; joint-watched holds (wall sit) are capped at the programme's own hold time (45 s) — range limit unchanged.
   **Stall** = neither of the last two sessions beat the one before (top load, then reps/seconds at that load) →
   keep the weight, add one set. Drop-set rows never count as working sets.
7. **Schedule**: order A → B → C from the weekly schedule. A missed session rolls forward (catch-up on a non-lift day
   only if nothing was lifted yesterday). Week "cut short" = more sessions left than spaced lifting days left (today,
   today+2, … to Sunday) → the programme priority (C, A, B) trims the list and C goes first. Lifting yesterday gives a
   spacing warning on a planned day (never blocks).
8. **Pain rule**: reduce when during-session pain > 3, next-morning pain > 3, swelling ticked, or pain worse next
   morning than during the session ("next-day soreness"). Next-morning answer missing → pending (does not count as a
   pass). Red flags (programme list only — locking, giving way, new swelling) → joint-watched exercises disabled
   (server also rejects their sets) until the user confirms "my physiotherapist has cleared me"; a cleared red flag
   still counts as "reduce" until a newer session. The next-morning card shows for sessions 1–2 days old.
9. **Conditional unlocks**: concrete exercises defined in code because the programme lists only movements —
   sit-to-stand from a high seat 3 × 8–10 and low step-up (10–15 cm) 3 × 8–10 per side, fixed prescriptions (not
   block-scaled), joint-watched, appended to the lower-body pain-check session (Session B). Sit-to-stand: Block 2+ and
   pain rule passed for the last 2 pain-check sessions. Step-ups: Block 3+ and a recorded professional approval. Both
   locked while a red flag is open. Excluded movements are never offered (travel substitutes or unlocks matching an
   excluded movement fall back / stay locked).
10. **Pre-training coffee**: on a day with a recommended session not yet done — before the caffeine cut-off
   "black coffee ~45 min before if you train before 14:00; evening session → skip it"; after the cut-off "skip the
   pre-training coffee". Habit group (§6.2 ranking). Today only.
11. **Not audited**: workouts, joint checks and approvals are personal logs like food and check-ins (P1a decision 10,
   spec §8) — no audit_log CHECK change in this phase.
12. **Draft safety**: the player keeps an unsaved draft in this browser's localStorage and offers "Restore / Discard"
   on return (offline queue/sync is P3). Re-opening a saved session pre-fills its sets; saving replaces them.
13. Sessions can be logged up to 60 days back (missed-session catch-up via Recent sessions / Log links).

### Risks / limitations
- No browser or Supabase run here — UI reviewed from markup; API exercised only through types and pure tests.
- Exercise history reads up to 1,500 recent set rows per query (ample for a 12-week programme).
- Retest after the deload is a note only (no dedicated retest form); cardio, intervals unlock and Zone 2 are P2.

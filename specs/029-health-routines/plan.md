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

---

## Phase P2 — Feedback loop (cardio & steps, adjustments, measurements/labs/milestones, weekly review, travel & restaurant, reminders, photo retention)

### Design
- **Fix first (owner's document, Block 2 knee progression)**: `ExerciseSchema.blockProgressions` (fromBlock, requires
  `pain_rule_ok`, optional `holdCapSeconds`, optional note). Seed: both shallow wall sits → hold cap 60 s from Block 2;
  band terminal knee extension → "Use a stronger band." from Block 2. `effectivePrescription(…, { painRulePassed })`
  applies them only when the pain rule has passed (same `painRulePassed()` as the sit-to-stand unlock); otherwise the
  45 s knee-watched cap stays. `progressionSuggestion` takes TODAY's cap (`opts.holdCapSeconds`), so a hold done while
  the rule passed never suggests > 45 s once it stops passing. `upgradeSeedDefinition()` back-fills the field into
  programme copies enrolled before this fix (seed template only, never overwrites).
- **Pure logic** (`src/lib/health/`, all tested): `units.ts`, `cardio.ts`, `adjustment.ts`, `measurements.ts`,
  `weeklyReview.ts`, `travel.ts`, `healthSettings.ts`, `reminders.ts`, `pushConfig.ts`, `photoCleanup.ts`;
  `painRules.recoveryOk()`.
- **Server**: `p2Server.ts` (loaders; missing table → `P2MigrationNeeded` → friendly card), `reviewServer.ts`
  (weekly review from stored data), `reminderDelivery.ts` (Resend email + web-push, idempotent),
  `healthServer.effectiveTimezone()` (per-day override → `enrolment.timezone`; `homeTimezone` keeps the enrolment's).
- **API**: `POST/DELETE /api/health/activity` (cardio | steps), `POST/DELETE /api/health/progress-data`
  (waist | lab | milestone), `POST/DELETE /api/health/progress-photos`, `POST /api/health/adjustments`,
  `GET/PATCH /api/health/settings`, `POST /api/health/day-timezones`, `GET/POST/DELETE /api/health/push`;
  `food/estimate` accepts `restaurant=true` (prompt note + deterministic tips). All: auth → Health add-on → Zod → DB.
- **Inngest**: `health-reminders-cron` (every 15 min → one event per enabled user per quarter hour),
  `health-reminders-user` (local time, due types, content, delivery; each send a memoised step),
  `health-photo-cleanup` (daily 03:17 UTC).
- **PWA**: `src/app/manifest.ts` (→ `/manifest.webmanifest`), `public/sw.js` (push + notification click only, no
  caching), `public/app-icon.svg`; `/sw.js` and `/manifest.webmanifest` are public in the middleware. The service
  worker is registered only when the user turns push on in Health settings.
- **UI**: Today — travel-mode card (trip, eating-out rules, day timezone control), fortnightly proposal card, "This
  week" card (mid-point review, milestone due, waist due), cardio & steps card, restaurant mode in Log food, weights
  in the chosen unit. Training — cardio & steps card; the session player pre-selects travel mode on trip days.
  Log — cardio & steps for the chosen day. Progress — proposal / "not enough weigh-ins", adjustment history, waist,
  lipid panel, milestones (expected vs actual), progress photos, weekly reviews (this week so far + stored weeks).
  Programme — Health settings panel (units, reminders, quiet hours, training time, review day/time, push on/off).

### Data model (migration `20261122c_health_p2.sql`, paste-ready `supabase/apply_health_p2.sql`)
`health_cardio_sessions`, `health_steps` (unique user + date), `health_adjustments` (unique enrolment + period end;
targets before/after), `health_measurements` (waist cm; unique user + date + kind), `health_progress_photos` (path
must be `progress/<uid>/…` by RLS), `health_lab_results` (mmol/L + entered unit), `health_milestone_checks`,
`health_weekly_reviews` (jsonb stats; unique user + week), `health_settings` (units + reminders jsonb),
`health_day_timezones` (unique user + date), `health_push_subscriptions` (unique endpoint). Owner-only RLS on all;
adjustments / milestone ticks must reference the user's own enrolment, cardio the user's own daily log. Audit CHECK
(full list) + `health_adjustment_accepted`, `health_adjustment_declined`. Pre-checks P1a and P1b. Tested on local
PostgreSQL 16 with Supabase stubs: stops before P1a / before P1b with the message, applies after P1b, re-runs cleanly,
cross-user reads return 0 rows, cross-user insert and a foreign progress-photo path are rejected by RLS.

### Decisions made autonomously (P2)
1. **Knee progression applies from Block 2 onwards** (Block 3 too) — the owner's note says the 45 s cap applies "in
   Block 1 and whenever the pain rule has not passed", so Block 3 with the rule passed keeps 60 s. The 60 s is a cap
   reached through the normal +15 s hold progression, not a jump. Band TKE shows the note; its progression message was
   already "shorter / thicker band".
2. **Cardio**: types offered = the programme's allowed list; avoid-list types are selectable under "On your avoid
   list" and need a confirm (client) — the API returns 409 `needsConfirmation` without `confirmAvoid`. HR is optional
   and only flagged (never blocks). Weekly target = sessions × minutes (4 × 30 = 120), ISO week Mon–Sun.
3. **Intervals** unlock = week ≥ the unlockable's `fromWeek` (5) AND `painRulePassed` (last 2 pain-check sessions OK)
   AND **recovery OK** = no red flag in the last 3 pain-check sessions (and none uncleared) and ≥ 2 of the last 3 OK.
   The option is hidden where training data is unavailable (Log tab / missing P1b), and the server re-checks.
4. **Adjustment periods** are fixed fortnights from the start date (days 1–14, 15–28, …), capped at the programme
   length; only the latest finished fortnight can be decided (409 if stale), once per enrolment. Loss = 7-day average
   of the fortnight's first week − second week, each with ≥ 5 weigh-ins (else "not enough data", no buttons).
   Boundary losses (exactly 0.4 or 1.2 kg) resolve to "no change". Accept: kcal ± change (never below the safety floor
   1,500 ♂ / 1,200 ♀ or the programme min), protein unchanged, carbs ± change ÷ 4 rounded to 5 g; fat unchanged.
   "No change" proposals show "Got it" (recorded as accepted, 0 kcal). The proposal is recomputed server-side.
   Creatine caveat for fortnights ending within water-weight weeks + 1 week (first two fortnights in the seed).
5. **Mid-point review**: shown on Today during the milestone week whose task mentions "review" (seed week 6).
6. **Waist bands**: male > 94 raised / > 102 high (brief); female > 80 / > 88 (same guidance's female cut-offs).
   Fortnightly reminder when the last waist is ≥ 14 days old (or none).
7. **Lipids** stored in mmol/L (2 dp); mg/dL factors 38.67 (cholesterol) and 88.57 (TG); non-HDL = total − HDL
   computed, not stored. Implausible values (likely wrong unit) are rejected. **Escalation** fires for a panel taken in
   or after the programme's last week (week 12) with LDL above the programme threshold (4.9 mmol/L).
8. **Milestones**: ticks per task (stable key `w<week>:<task>`); states upcoming / this week / open / done; actual =
   7-day-average weight vs start weight and waist change since the first measurement, as of the milestone week end.
9. **Weekly review**: ISO week Mon–Sun; daily components count days the target was hit; a "gap" is < 4/7 days
   (scaled for a partial week). Focus templates in fixed priority: oats + soya combined fix (beta-glucan AND soy gaps)
   → sat-fat ceiling breached → protein < 5/7 → each component gap (programme's own suggestion text) → sessions →
   cardio → steps → sleep consistency → "plan the week's food". Stored per week (Sunday reminder generates it; the
   Progress tab stores last week's when missing); Progress also shows "this week so far" live.
10. **Trips**: the user's OWN trips (`trips.owner_id = user`; Health users are members, assistants never get
    Health). A trip covers first departure → last arrival (local dates in the home timezone); one-way trips cover
    their travel day(s) only. On trip days Today shows travel mode and the player pre-selects hotel variants.
11. **Day timezone**: optional per-day override (`health_day_timezones`), set from the travel card ("Use <device tz>
    for this trip" / "Back to <home>"). The override for date D applies when it is D in that timezone (home date ±1
    checked, newest first) — a day is never split or duplicated. Default: enrolment timezone.
12. **Restaurant mode**: the "Eating out" tick shows the programme rules, sends `restaurant=true` (prompt note: dish
    or menu, hidden cooking fat) and returns deterministic tips (sauce on the side, no butter on the grill, fried →
    grilled, one starch, sat fat vs what is left today, leave a third) — AI never words or decides the tips.
13. **Reminders** are **opt-in (off by default)**; once on, every type is on, email + push channels on, quiet hours
    22:00–07:00 (a reminder scheduled inside quiet hours is skipped that day). Times: check-in = typical wake + 30 min
    (07:30 + 30 default); pre-training coffee only with a "training time" setting (before the cut-off: 45 min before;
    after: cut-off − 30 min "skip it"); caffeine = cut-off − 30 min; evening gap = last meal slot start − 60 min
    (only when something is missing: top recommendations); bedtime = bedtime − max last-meal gap; weekly review =
    chosen day/time (Sun 18:00); milestone = 09:00 on the first day of a milestone week; adjustment = 09:00 the day
    after a fortnight ends (only for a ±kcal proposal not yet decided). One-hour catch-up window; idempotent per user /
    type / local date via `notification_log` (`health_<type>`), the Inngest event id and Resend's Idempotency-Key.
    Health reminder kinds are not part of the portfolio notification preferences.
14. **Web Push**: `web-push@3.6.7` (exact; the 4.0.0 major was released only ~2 weeks ago). VAPID from `VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:/https:); missing or malformed → push silently disabled (GET
    /api/health/push returns `publicKey: null`, the settings panel says so), email still works. Subscriptions with a
    404/410 answer or 10 consecutive failures are deleted. The public key is served by the API (no NEXT_PUBLIC var).
15. **Photo retention**: daily job deletes food photos older than 30 days (storage object age) and clears
    `photo_paths` of entries older than 30 days (items kept); photos not referenced by any entry are deleted after
    24 h. Never deletes when the entries query fails; progress photos (`progress/…`) are never touched. Bounded per run.
16. **Progress photos** reuse the private `health-photos` bucket under `progress/<uid>/<date>/<uuid>.jpg` (same EXIF
    stripping and signed URLs); kept until the user deletes them.
17. **Audit**: adjustment accepted / declined are audited (kcal before/after + period only). Cardio, steps, waist,
    labs, photos, milestones, settings, push subscriptions are personal logs — not audited (spec §8, P1a decision 10).
18. **Units**: Progress (weight, waist, lipids), Today's weight card and the check-in weight entry follow the units
    setting; everything is stored in kg / cm / mmol/L.

### Risks / limitations
- No browser, Supabase, Resend or push service here — UI reviewed from markup; delivery code exercised only through
  types and the pure tests. iOS needs the site added to the Home Screen for Web Push.
- Reminder scheduling uses typical times (median of recent check-ins); a user without check-ins gets the defaults.
- Food photos uploaded before P2 for discarded estimates are cleaned by the first daily run (> 24 h old).
- Food-entry `eaten_at` on back-dated entries uses today's timezone (unchanged from P1a).

---

## Phase P3 — Convenience (programme import, meal plan + shopping list, clinician export, offline sets, barcode, data rights)

### Design
- **Pure logic** (`src/lib/health/`, all tested):
  - `programmeImport.ts` — 15 review sections covering every §3.1 field (identity · energy & macros · components ·
    meal slots & rotation · nutrition rules & eating out · sessions/exercises · weekly schedule · blocks & progression ·
    movement restrictions & pain rules · cardio & daily movement · sleep · supplements · tracking · adjustment ·
    milestones & outcomes); per-section Zod validation built from `ProgrammeDefinitionSchema.shape`; status
    extracted / needs review / not found; AI-output normalisation (nulls dropped, keys → lower_snake_case); prompt +
    strict parser; `assembleDraft` (all confirmed + whole-definition validation, errors mapped to sections);
    `replaceSection`; `programmeDiff` (per-section summary: added / removed / changed items, changed leaves);
    editor templates; import upload paths (`imports/<uid>/<uuid>.pdf`) and the 1-hour stale rule.
  - `programmeEdit.ts` — `retargetAfterEdit` (only energy/macro changes move targets; accepted adjustments re-applied
    as a delta), `targetsForSwitch`.
  - `mealPlan.ts` — week plan (day × slot), swaps within a slot, `cleanChoices`, 39-entry ingredient dictionary built
    from the seed rotation (aliases, aisle, amount per serving), option parsing (split on + , ; on with —; quantities /
    notes stripped; longest alias wins), aggregation by aisle, quantity formatting, share text, AI split prompt + strict
    parser (known names mapped back to the dictionary).
  - `clinicianExport.ts` + `clinicianPdf.ts` — report assembly (profile, weight + 7-day averages, waist, lipids with
    non-HDL, adherence: food-logged days, protein ≥ target days, sat fat ≤ target / ceiling days, averages, each daily
    component days-hit and weekly component weeks-met, training done/partial/skipped + key-lift first vs latest top set,
    cardio minutes by type, notes); CSV (formula-injection safe); PDF with pdf-lib (A4, Helvetica, weight chart).
  - `offlineQueue.ts` — set / finish ops with client ids, `enqueue` (idempotent, bounded 500), LWW `mergeSetOps`,
    `queuedSetCount`, `groupQueue`, server merge `applySetOps` (op applies only if not older than the stored set; client
    clock clamped to server now; replays no-ops), `setsToExercises`.
  - `barcode.ts` — EAN-8/UPC-A/EAN-13/GTIN-14 + GS1 check digit, OFF product URL / mapping, portion options, scaling.
  - `dataRights.ts` — every per-user health table in a safe delete order (a test checks it against the migrations),
    typed confirmation, export document (redacts push keys), photo paths, storage prefixes.
- **Server**: `p3Server.ts` (drafts, programme rows / versions, insert version, enrolment switch with rollback, meal plan,
  ingredient cache; missing table/column → `P3MigrationNeeded` / 503), `workoutWrite.ts` (session write shared by
  POST /workouts and the sync), `dataRightsServer.ts`, `openFoodFactsClient.lookupBarcode` (same cache),
  `callClaude({ documents })` (base64 PDF document blocks — the installed `@anthropic-ai/sdk` 0.92 types support them),
  AI roles `health_import` (16k tokens, effort medium) and `health_ingredients` (4k, low).
- **API**: `programme/import` (GET drafts, POST text | uploaded PDF), `programme/import/upload-url`,
  `programme/import/[id]` (GET / PATCH section + confirm / DELETE), `programme/import/[id]/save` (save, optionally
  enrol), `programme` (GET versions, PATCH section | restore), `programme/switch`, `meal-plan` (GET / PATCH),
  `meal-plan/ingredients` (AI fallback), `export/clinician` (PDF | CSV), `foods/barcode`, `workouts/sync`,
  `data/export`, `data/delete`. All: auth → Health add-on → Zod → enrolment where needed → DB.
- **UI**: Programme tab sub-views `?tab=programme&view=overview|edit|import|meals|export` (pills nav):
  Edit & versions (section editor, version history with restore, your programmes + switch), Import (upload / paste →
  step-by-step review, section chips with status, AI notes, validation errors, confirm per section, save / save & start),
  Meal plan (`&week=` Monday; day cards with swap selects, shopping list by aisle with ticks, copy / share, "Split with
  AI" for unknown parts), Export & data (clinician PDF/CSV with optional photos; export JSON; typed delete). Generic
  `SectionValueEditor` (fields, item cards with add/remove/reorder, one-per-line lists, number pairs, enum selects, JSON
  escape hatch). Barcode scanner in Log food (start screen + item editor). Offline indicator + auto-sync on the Training
  tab and in the session player. Today links to the meal plan.

### Data model (migration `20261122d_health_p3.sql`, paste-ready `supabase/apply_health_p3.sql`)
`health_programmes` + `lineage_id`, `parent_id`, `version_no`, `source` (template | import | edit), `change_summary`
(existing rows back-filled as v1 of their own lineage); `health_programme_imports` (draft sections / statuses / notes /
confirmed, status draft | saved | discarded, source pdf | text, ai_usage; may only point at the user's own programme);
`health_meal_plans` (user + Monday unique; choices jsonb, checked text[]; Monday CHECK); `health_ingredient_cache`
(user + part key unique); `health_workout_sets` + `client_id`, `client_updated_at`. Owner-only RLS on the new tables.
Audit CHECK (full list) + `health_programme_imported`, `health_programme_updated`, `health_data_exported`,
`health_data_deleted`. Pre-checks P1a, P1b and P2. Tested on local PostgreSQL 16 with Supabase stubs: stops before
P1a and before P2 with the message, applies after P2, re-runs cleanly, Monday / source CHECKs enforced, cross-user
reads return 0 rows, an import pointing at another user's programme is rejected by RLS, owner delete in the
data-rights order succeeds.

### Decisions made autonomously (P3)
1. **PDF handling**: the PDF goes to Claude as a base64 `document` block (SDK 0.92 supports it). The browser uploads it
   with a one-time signed URL to the private `health-photos` bucket (`imports/<uid>/<uuid>.pdf`) — avoids serverless
   request-body limits (4.5 MB on Vercel) for files up to 10 MB; the import request reads it once and deletes it in a
   `finally`; the daily cleanup removes any upload older than an hour. Pasted text (≤ 100k chars) needs no storage.
2. **One extraction call** (16k max tokens, non-streaming within the SDK's time budget); "max_tokens" → ask the user
   to paste the main sections. The model's "uncertain" flags make a section "needs review"; invalid sections too;
   identity missing is "needs review" (required), other empty sections "not found". Confirming an empty section is
   allowed (schema defaults apply). Every section must be confirmed and the whole definition must validate to save.
3. **Section editor is generic** (one component for all 15 sections) with a JSON escape hatch per section, instead of
   15 bespoke forms — every field of §3.1 is editable; enum fields use selects; validation errors are shown inline.
4. **Versioning**: an edit or restore inserts a new `health_programmes` row (same lineage, version + 1, diff summary)
   and moves the enrolment to it; old rows stay (history, workouts keep their enrolment). Edited versions store
   `template_key = null` so the seed back-fill (`upgradeSeedDefinition`) can never re-add something the user removed
   (the edit starts from the already-upgraded definition). Targets change only when the computed targets change
   (energy / macros); accepted fortnightly adjustments are carried over as a delta.
5. **Switching programme** ends the current enrolment (`completed`, history kept) and starts the new one with the same
   profile, no overrides and fresh targets; on failure the old enrolment is restored. Import is reachable from the
   Programme tab (an active enrolment provides the profile); first-time users still start from the seed template.
6. **Shopping list**: deterministic first; flex slots (eat out) and leftovers buy nothing; quantities are per serving
   × meals (dictionary amounts, e.g. oats 50 g, skyr 250 g, Benecol 1 bottle). Unknown parts are listed under "Other"
   as written until the user taps "Split with AI" (max 30 parts per call, cached per user; parts the model skips are
   cached as themselves so they are never paid for twice). Swaps choose among the day's own options first, then the
   same slot's options from other days (never across slots); a stale choice falls back to the rotation.
7. **Clinician export**: PDF with pdf-lib 1.17.1 (pinned, pure JS, standard fonts — text sanitised to WinAnsi) rather
   than HTML-to-PDF (no headless browser on serverless). Date range ≤ 400 days. Photos only when ticked (embedded,
   max 12; CSV gets 24-hour signed links). Food items are never exported here — only daily adherence. Each section
   degrades to empty when its phase's tables are missing. Audited as `health_data_exported` (kind only).
8. **Offline sets**: the queue is in localStorage (`health-offline-queue:v1`, max 500 ops); a set op is queued when a
   set is ticked / unticked while `navigator.onLine` is false; "Finish / partial / skip" while offline (or a network
   failure during save) queues every set plus a finish op and returns to Training. Sync on load, on `online` and via
   "Sync now". Conflict rule: last write wins per set index (client time, clamped to server time; stored sets without a
   client time use the workout's save time). A queued finish applies unless the session was saved after it. Rejected
   groups (future date, > 60 days, programme validation) are dropped with a toast; temporary failures retry.
9. **Barcode**: browser `BarcodeDetector` (Chrome/Edge Android, recent Safari) with the rear camera; elsewhere manual
   entry of the printed digits — no extra JS library (keeps the bundle small; manual entry covers iOS/Firefox). Only
   valid GS1 codes are looked up. Not-found answers are cached for a day, products 30 days. The item is pre-ticked
   "Remember", so saving the entry stores it in the personal food library.
10. **Data rights**: export = one JSON file (all health rows via the user's own session + 24-hour signed photo links;
    push-subscription keys redacted) — no zip dependency. Delete = typed "DELETE HEALTH DATA" → every per-user health
    row (consent included, so Health restarts at the consent screen), every object under `<uid>/`, `progress/<uid>/`,
    `imports/<uid>/`, and `health_*` rows in `notification_log`; idempotent (retry after a partial failure). The audit
    entry has counts only. Assistants never see these audit actions (health filter extended).
11. **Not audited**: meal-plan swaps/ticks, ingredient cache, offline sync (personal logs, spec §8).

### Risks / limitations
- No browser, Supabase or Anthropic run here — PDF extraction quality, camera scanning and offline behaviour are
  untested end-to-end; the PDF renderer and every pure function are unit-tested.
- Very long programmes may exceed one 16k-token extraction (the user is told to paste the main sections).
- Offline queue is per device; the player page itself must already be loaded (no service-worker page caching).
- Clock skew between devices can affect which set wins (clamped to server time on the future side only).
- Apple Health / Google Fit sync (§10 P3 list) is out of scope (owner decision §12.2: manual steps).

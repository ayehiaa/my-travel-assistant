# Feature Specification: Health & Daily Routines Module

**Feature Branch**: `029-health-routines` (spec only — not yet planned or built)
**Created**: 2026-11-22
**Status**: Draft for owner review
**Seed programme**: the owner's "12-Week Programme v3" (nutrition, LDL-lowering components, 3-day home training,
cardio, sleep, tracking, milestones). The module is **generic**: any user can load their own programme; the seed
programme is the first template and is used throughout this spec as the worked example.

> Not medical advice. The module helps a user follow a plan they (and their clinicians) chose. It never diagnoses,
> never prescribes medication, and surfaces "see a professional" prompts when a programme's red-flag rules fire.

---

## 1. Goals

1. **Load a programme** (diet + training + cardio + sleep + tracking rules) once, from a template, a document, or by hand.
2. **Report the day with minimal effort**: food by words and/or photos, training by tapping through the session,
   morning weight and check-in in under 30 seconds.
3. **Calculate what matters**: daily totals vs targets, the 7-day weight average and rate of loss, adherence to the
   programme's components, progression in training.
4. **Recommend during the day** what to change to stay within targets ("you have 3 g saturated fat left — make dinner
   fish or tofu, no cheese").
5. **Run the programme's own rules automatically**: fortnightly calorie adjustment, training progression and deloads,
   pain/safety rules, milestones.

### Non-goals (v1)
- Medical diagnosis, medication advice, or clinical decision support.
- Social/community features, coaching marketplace, payments.
- Barcode scanning and wearable sync (planned for a later phase — see §10).

---

## 2. Users & access

| Who | Access |
|---|---|
| Member with the **Health** add-on | Full module for their own data |
| Admin (`APP_ADMIN_EMAILS`) | Enables/disables the Health add-on per user (`/admin`), same pattern as Portfolio |
| Assistant | No access to Health data (health data is personal; assistants never inherit it) |

- New add-on key `health` in `user_roles.features` (spec 027 model).
- AI features (food parsing, photo analysis, programme import, recommendation wording) use the **user's own
  Anthropic API key** (spec 026 model); admin emails in `ANTHROPIC_KEY_OWNER_EMAILS` may use the app key.
- Health data is **special-category personal data** (UK GDPR): explicit consent screen on first use, per-user export
  and full deletion, photos in a private storage bucket, never shared with other users or the admin page (admin sees
  only "Health enabled: yes/no" and "last log date").

---

## 3. Core concepts (domain model)

### 3.1 Programme (template)
A reusable, versioned definition. Fields (all optional except name + duration):

| Area | Fields | Seed example |
|---|---|---|
| Identity | name, version, duration (weeks), author, description, disclaimer | "12-Week Programme v3", 12 weeks |
| **Energy & macros** | kcal target; protein g (or g/kg); fat g (+ % range); **saturated fat target + ceiling**; carbs (remainder); fibre minimum | 2,200 kcal · 145 g P (1.8 g/kg) · 75 g fat · sat fat ≤15 g target, 18 g ceiling · 235 g carbs · fibre 35 g+ |
| **Components** (custom daily/weekly targets) | name, unit, target, period (day/week), timing rule, food sources | Plant stanols 2 g/day *with a meal*; beta-glucan 3 g/day; soy protein 25 g/day; nuts 30 g/day; pulses 1 serving/day; oily fish 2×/week |
| **Meal slots** | name, time window, template, per-slot targets (kcal, protein, sat fat), components it usually covers | Breakfast 7–8am · Coffee mid-morning · Lunch 1–2pm · Afternoon 4–5pm · Dinner 7–8pm |
| **Meal rotation** | 7-day grid (day × slot) with swappable options; flex slots | Mon–Sun rotation, Sat lunch = FLEX eat-out |
| **Nutrition rules** | typed rules (see §6) | One-starch-per-meal; protein in every eating occasion; treat budget = sat fat spare, pay calories by dropping starch; no caffeine after 2pm; last meal 2–3 h before bed |
| **Eating-out guidance** | list of tips shown in "restaurant mode" | Grilled not fried; sauce on the side; no butter on the grill; hidden sat-fat list; leave a third |
| **Training sessions** | name, focus, exercises (name, sets × reps or hold time, rest, tempo, notes, video URL, equipment, "per side" flag, superset group), per-block set/rep overrides, travel substitutes | Session A Upper (7 exercises), B Lower knee-friendly & core (9), C Full body (8) |
| **Weekly schedule** | day → session / cardio / rest, spacing rules, "if week is cut short" priority | Mon A · Tue Z2 · Wed B · Thu Z2 · Fri C · Sat Z2 · Sun easy walk; ≥1 day between lifts; do C first if short |
| **Blocks & progression** | blocks (weeks, focus, sets, rep range, RIR, intensity technique), deload weeks, load-increment rules, stall rule | B1 wk1–4 (3 sets, 10–15, RIR 2–3, wk4 light), B2 wk5–8 (4 sets first two, 8–12, last set to failure, wk8 light), B3 wk9–12 (6–12/12–20, drop set, wk12 deload + retest); +2 kg upper / +4 kg lower; stall ×2 → add a set |
| **Movement restrictions** | excluded movements/patterns, range limits, conditional unlocks (needs pain rule pass / professional approval) | No squats, lunges, split squats, step-downs, deep knee bends, kneeling; wall sit ≤45°; sit-to-stand unlocked in Block 2 if pain rule OK; step-ups Block 3 with physio agreement |
| **Pain / safety rules** | scale, thresholds, next-day check, red flags, action text | Pain 0–10: ≤3 OK if settled next morning & no swelling; >3 or next-day soreness → reduce range/load; locking/giving way/new swelling → stop leg work, see physio |
| **Cardio** | types, sessions/week, minutes, intensity (HR zone with bpm), allowed/avoid lists, unlockable variants | Zone 2 4×30 min at 104–122 bpm; allowed: flat/uphill walk, incline treadmill, bike saddle high, front crawl; avoid: running, long downhill/stair descents, rower, breaststroke; intervals 6×1/2 from week 5 if recovering & joints quiet |
| **Daily movement** | steps target range | 8,000–10,000 steps |
| **Sleep** | duration range, timing consistency (± min), caffeine cut-off, last-meal gap, environment checklist | 7–8 h; ±30 min; no caffeine after 14:00; last meal 2–3 h before bed; 18–19 °C, no phone |
| **Supplements** | name, dose, timing, notes, side-effect caveats | Creatine 3–5 g daily (water weight +0.5–1.5 kg in weeks 1–3; tell GP before bloods) |
| **Tracking plan** | metric, frequency, "don't track" list | Weight daily → 7-day avg; waist fortnightly; training log every session; joint response after B and C; sat fat & protein daily; lipid panel wk1 & wk12; **don't track** morning temperature, daily weight in isolation |
| **Adjustment rules** | condition → action on targets (see §6.3) | Fortnightly: loss 0.6–0.9 kg → no change; <0.4 kg → −150 kcal; >1.2 kg → +150 kcal |
| **Milestones** | week, tasks, expected ranges | Wk1 physio review, lipids, weight, waist, photos, baseline lifts, start creatine · Wk4 1–1.5 kg, lifts +10–20% · Wk6 review, 2–2.5 kg, waist −2–3 cm · Wk8 3–3.5 kg · Wk12 lipids, retest, 4–5 kg, waist −5–7 cm |
| **Outcome expectations** | text/table shown in Progress | LDL −1.0–1.5 mmol/L (20–30%) with all components for 12 weeks; escalation note if LDL > 4.9 mmol/L after adherence |

### 3.2 Enrolment (a user's instance of a programme)
start date, current week/block (derived), personal profile (sex, age, height, start weight, activity level), personal
overrides of any target, current **effective targets** (programme targets + adjustments applied so far), status
(active / paused / completed), timezone (for day boundaries; follows the user when travelling).

### 3.3 Daily log (one per user per local date)
morning check-in, food entries, training session(s), cardio, steps, sleep, supplements taken, joint/pain checks,
water (optional), notes, computed totals and adherence flags.

### 3.4 Food entry
- Input: free text, one or more photos, or both; meal slot (auto-suggested from time); time eaten; "restaurant" flag.
- AI output: list of **items** (name, estimated quantity g/ml, kcal, protein, carbs, fat, **sat fat**, fibre, plus
  every programme component it contributes, e.g. beta-glucan g, soy protein g, nuts g, pulse servings, oily-fish
  flag, starch servings, caffeine mg), each with a confidence level.
- User can edit any item/quantity; edits are remembered (personal food library).
- Entry-level uncertainty band (programme says treat logged figures as ±15%).

### 3.5 Personal food library
Foods the user logs often, with their **own nutrition values** (e.g. "Oat So Simple Original: beta-glucan 3.6 g per
100 g", "soya flat white: 3 g soy protein") and default portions (e.g. "my handful of nuts = 45 g"). Used to make AI
estimates match the user's real products and for one-tap re-logging.

### 3.6 Workout log
session id, date, block/week, per exercise: sets (load, reps or seconds, RIR or "to failure", drop-set flag), skipped
flag + reason, substitutions (travel variant), joint pain score during the session, notes, duration.

### 3.7 Measurements & lab results
weight (daily), waist (cm), progress photos (private), lab panels (total cholesterol, LDL, HDL, triglycerides, non-HDL,
date, units mmol/L or mg/dL with conversion), resting HR (optional), lift retests.

---

## 4. User scenarios

### US1 — Load a programme (P1)
A user picks the seed template **or** uploads their own programme (PDF/text); the AI extracts it into the structured
model; the user reviews every section in a step-by-step editor, fixes anything, and activates it with a start date.

**Acceptance**
1. Choosing the seed template creates an enrolment with all values in §3.1 pre-filled.
2. Uploading a document produces a **draft** with each section marked "extracted", "needs review" or "not found";
   nothing activates until the user confirms each section.
3. Targets that depend on body weight (e.g. 1.8 g/kg protein) are recalculated from the user's weight, with the
   formula shown.
4. The user can edit any field later; changes are versioned (history shows what changed and when).

### US2 — Morning check-in (P1)
Each morning the user records weight (same conditions), sleep (bed + wake time), supplements taken (e.g. creatine),
and — the morning after a session that has a pain rule — next-morning pain and swelling.

**Acceptance**
1. Check-in takes ≤4 taps + one number; it is the first card on Today until done.
2. The app shows the **7-day average** and trend arrow prominently and the single-day weight small, with a hint that
   daily weight is mostly water.
3. Sleep duration and consistency (vs the ±30 min window) are computed.
4. In the first 3 weeks after starting a supplement with a water-weight caveat (creatine), a note explains why the
   scale may not move and points to waist as the main metric.

### US3 — Log food by words or photos (P1)
"2 flat whites with soya and half a cinnamon roll" or a photo of lunch → items, quantities and nutrition appear in a
few seconds; the user confirms or adjusts.

**Acceptance**
1. Text-only, photo-only (1–4 photos) and text+photo all work; result shown in ≤10 s typical.
2. Every item shows kcal, protein, sat fat and any programme components it contributes; totals update immediately.
3. Low-confidence items are highlighted with a one-tap way to correct the portion ("small / medium / large" or grams).
4. Known personal foods are matched from the library before the AI guesses.
5. Logging a meal outside its slot window or after the caffeine cut-off triggers the relevant rule (§6).
6. Photos are stored privately and can be deleted with the entry.

### US4 — Today screen with live targets and recommendations (P1)
One screen showing what is left for today and what to do next.

**Acceptance**
1. Progress for kcal, protein, **sat fat (target and ceiling)**, carbs, fat, fibre, and each component (stanols,
   beta-glucan, soy, nuts, pulses; weekly ones like oily fish show "1 of 2 this week").
2. Meal-slot timeline (planned template vs logged) and today's training/cardio from the schedule.
3. A ranked list of **recommendations** generated after every log (§6.2), each actionable ("Add 40 g leblebi or
   hummus this afternoon — no pulse yet today").
4. "Remaining budget" card: kcal, protein, sat fat left, starch servings left under the one-starch rule.

### US5 — Do and log today's training (P1)
The scheduled session opens as a guided player with the correct sets/reps for the current block and week.

**Acceptance**
1. Shows each exercise with target sets × reps (block-adjusted), rest timer, tempo, notes and video link; last time's
   load/reps shown next to each set.
2. Per set: load, reps (or hold seconds), RIR or "to failure"; drop-set prompt in blocks that use it.
3. **Progression suggestions**: top of rep range on every set → suggest +2 kg (upper) / +4 kg (lower) next time;
   stalled two sessions → suggest adding a set instead; bands → suggest next band/position.
4. Deload/lighter weeks automatically reduce sets/load per the block rules.
5. Excluded movements never appear; substitutions only from the allowed list.
6. Travel mode swaps in the hotel variants with the same sets/reps/RIR rule.
7. Sessions marked "done", "partial" or "skipped (reason)"; a missed week suggests the priority session (C first).

### US6 — Joint/pain check (P1 for programmes with a pain rule)
**Acceptance**
1. During sessions flagged for the joint, the user records a 0–10 score; next morning they're asked for pain and
   swelling.
2. Rule evaluation: ≤3 and settled → OK; >3 or next-day soreness/swelling → next session's affected exercises show
   "shorten range / reduce load"; red flags (locking, giving way, new swelling) → affected work is **disabled** with a
   "see your physiotherapist" message until the user confirms clearance.
3. Conditional unlocks (e.g. sit-to-stand from Block 2) appear only if the pain rule has been passed for the
   configured period, and those requiring professional approval need an explicit "approved by my physio" tick.

### US7 — Cardio and steps (P2)
Log Zone 2 sessions (type, minutes, average HR optional) and daily steps (manual for v1).
**Acceptance**: weekly minutes vs target; HR outside zone flagged; types on the avoid list warn before saving;
optional intervals unlocked from the configured week only if recovery/joint conditions are met; steps vs 8–10k.

### US8 — Weight trend and automatic adjustments (P2)
**Acceptance**
1. Daily 7-day average; rate of loss per week and % body weight per week vs the programme's safe range
   (0.3–0.4 kg/week preferred for the seed).
2. Every 2 weeks, the adjustment rule runs and **proposes** a change (e.g. "Loss 0.3 kg over the fortnight → reduce
   by 150 kcal: drop one starch serving"); the user accepts or declines; accepted changes update effective targets
   and are logged in history.
3. Insufficient data (fewer than 5 weigh-ins in either week) → no proposal, with an explanation.

### US9 — Measurements, labs and milestones (P2)
**Acceptance**: fortnightly waist reminder with risk bands (>94 cm raised, >102 cm high); private progress photos;
lipid panel entry with mmol/L↔mg/dL; milestone checklist per week with expected ranges shown next to actuals; the
programme's escalation note shown if a lab value crosses its configured threshold after the programme ends.

### US10 — Weekly review (P2)
Every Sunday (configurable), a summary: adherence per component (e.g. beta-glucan 3/7 days, soy 0/7), protein days
on target, sat fat days within target/ceiling, sessions done, cardio minutes, average steps, sleep average and
consistency, weight/waist trend, top 3 focus points for next week ("oats with soya milk at breakfast fixes both
gaps"), and a prompt to plan the week's food.

### US11 — Restaurant and travel modes (P2)
Restaurant mode shows the eating-out rules and estimates a dish from a menu photo or description with "ask for sauce on
the side / no butter" tips. **Travel integration with the existing Trips module**: on days inside a saved trip,
Today switches to travel mode (hotel training variants, restaurant rules, timezone-aware day boundaries).

### US12 — Reminders (P2)
Email (Resend, existing) and later push: morning check-in, pre-training coffee timing (if the session is before the
caffeine cut-off), caffeine cut-off, evening gap nudge ("no pulse and 20 g protein short"), bedtime/last-meal, weekly
review, milestone due. Each reminder type can be turned off; quiet hours respected.

### US13 — Meal plan & shopping list (P3)
Weekly rotation view with swaps within a slot; generate a shopping list from the planned week.

### US14 — Export for a clinician (P3)
PDF/CSV of weight and waist trend, lab results, adherence summary and training summary for a date range.

---

## 5. Screens (mobile-first)

New top-level **Health** hub (Nav link only for users with the add-on), tabs:

| Tab | Contents |
|---|---|
| **Today** | Morning check-in card (until done) · remaining-budget card · progress rings/bars · component checklist · ranked recommendations · meal-slot timeline · today's training/cardio card · quick "Log food" button (text + camera) |
| **Log** | Day view with food entries (edit/delete), training, cardio, steps, sleep, supplements, joint checks; date picker for past days |
| **Training** | Today's session player · schedule for the week · per-exercise history and charts · block/week indicator · travel-mode toggle |
| **Progress** | 7-day weight trend, rate of loss, waist, photos, labs, adherence heatmap, milestones, adjustment history, weekly reviews |
| **Programme** | Active programme (read/edit by section), targets history, import/replace, pause/complete |

Global: floating "+ Log" action (text, photo, workout, cardio, weight) on every Health tab.

---

## 6. Rules engine

Deterministic, typed rules evaluated in code on every log and on a schedule; AI is only used to word suggestions
and to estimate food, never to decide whether a rule fired.

### 6.1 Rule types (programme-configurable)
| Type | Example from the seed |
|---|---|
| Daily ceiling / target | sat fat ≤15 g target, 18 g ceiling; protein ≥145 g; kcal ~2,200 |
| Component target (day/week) | stanols 2 g/day; oily fish 2×/week |
| Timing | stanols must be eaten **with a meal**; no caffeine after 14:00; last meal ≥2 h before bedtime |
| Per-meal structure | one starch serving per meal; protein in every eating occasion |
| Budget trade-off | a treat uses spare sat fat; its calories must be paid for by dropping starch |
| Schedule | ≥1 rest day between lifting sessions; A→B→C order; C first if the week is short |
| Progression | top of range on every set → add load; stall ×2 → add a set; block/week set and rep changes; deloads |
| Safety | pain-score thresholds, red-flag stop, excluded movements, conditional unlocks |
| Adjustment | fortnightly 7-day-average comparison → ±150 kcal |
| Tracking | "don't track" metrics are hidden (e.g. morning temperature cannot be added) |

### 6.2 In-day recommendations (examples the engine must produce)
- Sat fat at 12/15 g by 3pm → "Keep dinner to fish/chicken/tofu with vegetables; skip cheese and butter sauces."
- Protein behind pace at 4pm (e.g. 60/145 g) → "Afternoon slot: 250 g skyr (+26 g). Dinner: 150 g chicken or tofu (+40 g)."
- Two starches logged in one meal → "One-starch rule: next time choose rice *or* bread. Today: skip starch at dinner to stay on target."
- 400 kcal treat logged → "Fits your sat-fat spare (4 g left). Pay the calories: drop the starch at lunch and dinner."
- No pulse by 4pm → "Add hummus with carrots or 40 g leblebi."
- Stanols logged between meals → "Stanols work best with a meal — have the next one with dinner."
- Coffee at 15:30 → "After your 14:00 caffeine cut-off — choose decaf; sleep matters more than the lift."
- Evening training scheduled → "Skip the pre-training coffee tonight."
- Planned bedtime 23:00, food logged at 22:30 → "Last meal is within 2 h of bed — move the afternoon slot earlier tomorrow."
- Weekly oily fish 0/2 on Thursday → "Plan salmon, mackerel or sardines for one meal before Sunday."

Ranking: safety > ceilings at risk > daily targets behind pace > weekly targets > habits. Max 3 shown at once.

### 6.3 Adjustment engine (fortnightly)
Inputs: 7-day averages of the last two weeks (≥5 weigh-ins each), supplement water-weight caveat window, user's
target loss band. Output: proposal (no change / −150 kcal / +150 kcal) with reasoning, applied only on user acceptance.

---

## 7. AI usage

| Task | Input | Output | Notes |
|---|---|---|---|
| Food estimation | text and/or 1–4 photos, meal slot, user's food library, programme components | structured items with nutrition + component contributions + confidence | Strict JSON schema; values clamped to plausible ranges; library matches override AI |
| Programme import | uploaded PDF/text | structured programme draft per §3.1 | Every section reviewed by the user before activation |
| Recommendation wording | fired rules + remaining budget + the user's common foods | short, specific suggestions | Rules decide *what*; AI only phrases *how* (optional — templates work without AI) |
| Weekly review summary | adherence stats | 3 focus points | Optional |

- Uses the user's own Anthropic key (spec 026); model per task configured in `src/lib/aiModels.ts`.
- Expected cost: dominated by food photos; target ≤ US$0.05 per logged meal, shown in Settings with a running monthly
  estimate.
- Prompts treat user text/photos as data; no medical advice in outputs; red-flag rules always use fixed wording.

---

## 8. Data & privacy requirements
- New tables (indicative): `health_programmes`, `health_programme_versions`, `health_enrolments`, `health_daily_logs`,
  `health_food_entries`, `health_food_items`, `health_food_library`, `health_workouts`, `health_workout_sets`,
  `health_measurements`, `health_lab_results`, `health_rule_events`, `health_adjustments`, `health_photos` (storage).
- RLS: owner-only for every table; no assistant or admin read access to content.
- Consent recorded with timestamp and version; export (JSON + photos zip) and hard delete in Settings.
- Photos in a private Supabase Storage bucket with signed URLs; EXIF location stripped on upload.
- Audit log entries for programme activation/changes, adjustments accepted, data export/deletion (no food details in audit).

---

## 9. Non-functional
- Mobile-first; core actions (weight, text food log, mark set done) usable one-handed in ≤10 s.
- Day boundaries in the user's current timezone; travelling across timezones never splits or duplicates a day.
- Works with intermittent connectivity for set logging (queue and sync) — P3.
- Accessibility: numbers readable at 375 px, colour not the only signal for over/under target.
- All rule logic as pure, unit-tested functions (project convention).

---

## 10. Phasing

| Phase | Scope |
|---|---|
| **P1 — Daily loop (MVP)** | Seed template + enrolment · morning check-in + 7-day average · food logging (text + photo) with AI and personal library · Today screen with targets, components and deterministic recommendations · training session player with block logic and progression suggestions · joint/pain rules and excluded movements · Health add-on + consent |
| **P2 — Feedback loop** | Cardio & steps · fortnightly adjustment engine · measurements, labs, milestones · weekly review · restaurant & travel modes (Trips integration) · email reminders |
| **P3 — Convenience** | Programme import from PDF · meal-plan rotation + shopping list · clinician export · offline set logging · barcode scanning · Apple Health / Google Fit (steps, workouts, HR, weight) |

---

## 11. Success criteria
- Daily logging takes ≤3 minutes in total for a typical day.
- ≥80% of food estimates need no correction or only a portion tweak (measured from edits).
- Users see their 7-day trend and remaining sat fat/protein at any time in ≤2 taps.
- Every programme rule in the seed template is represented and testable (rule coverage list in tasks.md).

---

## 12. Open questions for the owner
1. **Photo storage**: keep food photos indefinitely, or auto-delete after N days and keep only the estimates?
2. **Steps**: manual entry acceptable for P1, or is Apple Health / Google Fit sync needed earlier?
3. **Reminders**: email is available now; do you want push notifications (requires a PWA / app setup) in P2?
4. **Food database**: AI estimation + personal library only, or also integrate a nutrition database (e.g. UK CoFID /
   Open Food Facts) for better accuracy on packaged foods?
5. **Friends**: should the seed programme be available to friends as a template, or only programmes they import
   themselves (it is personalised to you)?
6. **Units**: kg/cm and mmol/L by default with lb/in and mg/dL as options — OK?

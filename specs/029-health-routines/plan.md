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

# /build-feature

Orchestrates the full agent development team to build a feature end-to-end, raise a PR,
and request human review. Requirements are crystallised via Spec Kit before any code
is written; the resulting artifacts (spec.md, plan.md, tasks.md) live in `specs/` and
travel with the PR.

## Trigger
User says `/build-feature <input>` where `<input>` is one of:
- A GitHub issue number: `/build-feature #42` or `/build-feature 42`
- A GitHub issue URL
- A free-text feature description

---

## Autonomous Mode

If the user's invocation contains the word **"autonomous"** or **"autonomously"**, activate **AUTONOMOUS MODE** for the entire run. In this mode:

- **Never call `AskUserQuestion`** — resolve every decision independently using best-practice defaults and the project context in `CLAUDE.md`.
- **Skip Step 2** (`/speckit-clarify`) entirely — proceed with the spec as written and assume no blocking ambiguities remain.
- **Suppress mid-workflow confirmations** — produce no interim status messages; speak only once at Step 12.
- **Self-heal all gate failures** — in Steps 9 and 10, fix every issue inline without pausing or showing reports to the user; re-run the gate after each fix; never proceed until the gate is green.
- **Deploy automatically** — after the PR is created (Step 11), run `/vercel:deploy` to trigger a Vercel preview deployment and capture the preview URL for Step 12.

When this mode is active, treat every step that says "confirm to the user" or "show the report to the user" as a no-op until Step 12.

---

## Step 0 — Resolve the starting description

**If input is an issue number or URL**, fetch it with:
```bash
gh issue view <number> --json number,title,body,labels,comments
```
Use the issue title as the feature name and the body as the requirements.
Confirm to the user: "Building from issue #N: [title]" before proceeding.

**If input is free text**, use it directly as the starting description.

---

## Step 1 — Specify (`/speckit-specify`)

Run `/speckit-specify` with the feature description as input.

**What happens automatically (Spec Kit git hooks):**
- `before_specify` fires → `/speckit-git-feature` creates and switches to a new feature
  branch (sequential naming: `001-feature-slug`). Capture `BRANCH_NAME` and
  `FEATURE_NUM` from its JSON output — you'll need them in Steps 8 and 9.
- The command produces `specs/<FEATURE_NUM>-<slug>/spec.md` covering user scenarios,
  functional requirements, success criteria, and assumptions.
- `after_specify` fires → `/speckit-git-commit` commits `spec.md`.

Do not proceed until `spec.md` exists.

---

## Step 2 — Clarify (`/speckit-clarify`)

> **AUTONOMOUS MODE**: Skip this step entirely. Do not run `/speckit-clarify`. Proceed directly to Step 3.

Run `/speckit-clarify` on the spec just created. This asks up to 5 targeted questions
about underspecified areas and encodes the answers back into `spec.md`.

**After clarify completes**, perform these inline domain-model steps (carried over from
the grill-with-docs discipline — Spec Kit has no equivalent):

1. Check `CONTEXT.md` for terminology conflicts. If the feature introduces a term used
   differently from the glossary, resolve it now and update `CONTEXT.md` inline.
2. If any decision made during clarify is (a) hard to reverse, (b) surprising without
   context, and (c) the result of a real trade-off, create an ADR under `docs/adr/`.
   Skip the ADR if any of the three conditions is missing.

`after_clarify` hook auto-commits all changes.

---

## Step 3 — Create GitHub issue from `spec.md`

Once the spec is clarified, create the GitHub issue:

```bash
gh issue create \
  --title "<feature name>" \
  --label "feature" \
  --body "..."
```

Issue body template:
```markdown
## What to build
<concise description from spec.md — end-to-end behaviour, not layer-by-layer>

## Acceptance criteria
<user scenarios from spec.md, converted to checkboxes>

## Spec
`specs/<FEATURE_NUM>-<slug>/spec.md`

## Blocked by
<issue numbers if any, or "None — can start immediately">
```

Confirm the issue number to the user: "Created issue #N — starting the plan."
Store this as `ISSUE_NUM` for the PR in Step 9.

---

## Step 4 — Plan (`/speckit-plan`)

Run `/speckit-plan`. This produces:
- `specs/<feature>/plan.md` — technical plan with Constitution Check gate
- `specs/<feature>/research.md` — Phase 0 research output
- `specs/<feature>/data-model.md` — entity definitions
- `specs/<feature>/contracts/` — API contracts

**Constitution Check gate**: `/speckit-plan` verifies the plan against the five
principles in `.specify/memory/constitution.md`. If any gate fails, resolve the
violation before continuing.

`before_plan` and `after_plan` hooks auto-commit changes.

---

## Step 5 — Analyze (`/speckit-analyze`)

Run `/speckit-analyze`. This performs a non-destructive cross-artifact consistency
check across `spec.md`, `plan.md`, and any contracts. Fix any flagged inconsistencies
before continuing — do not skip this gate.

`after_analyze` hook auto-commits.

---

## Step 6 — Tasks (`/speckit-tasks`)

Run `/speckit-tasks`. This produces `specs/<feature>/tasks.md` — an ordered task list
grouped by user story, with dependency markers and `[P]` parallel-execution hints.

`after_tasks` hook auto-commits `tasks.md`.

---

## Step 7 — Architect (backend/frontend split)

Spawn the `architect` subagent with:
- Full content of `specs/<feature>/spec.md`, `plan.md`, and `tasks.md`
- Instruction to read any existing files referenced in the plan before splitting work
- The project context from `CLAUDE.md`

The architect's job at this stage is **not** to re-plan — the Spec Kit artifacts own
the plan. Its job is to:
1. Split `tasks.md` into a **backend task list** and a **frontend task list**
2. Identify any implementation details missing from the plan (DB migrations, Zod
   schemas, component props) and add them to the relevant list
3. Flag any conflicts with existing code found during codebase exploration

Wait for the architect's output before proceeding.

---

## Step 8 — Backend Dev + Frontend Dev (parallel implementation)

Spawn both agents **in parallel**:

**backend-dev** — pass:
- The architect's backend task list verbatim
- `specs/<feature>/data-model.md` and `contracts/` for reference
- Any DB migration SQL from the plan
- Instruction to implement all tasks completely

**frontend-dev** — pass:
- The architect's frontend task list verbatim
- `specs/<feature>/spec.md` user scenarios as acceptance criteria
- Instruction to read nearby components before implementing
- Instruction to implement all tasks completely

Wait for both to complete.

---

## Step 9 — Security Review (blocking gate)

Spawn the `security-reviewer` subagent with:
- The full list of new and modified files from Step 8
- Instruction to run `npm audit` and report any new dependencies

**If the security report contains any FAIL:**
1. Show the full report to the user
2. Fix every flagged issue inline (do not skip or defer)
3. Re-run the security agent on the fixed files
4. Only proceed when the report is all PASS

**Do NOT proceed to Step 10 until security is fully green.**

---

## Step 10 — Tester (quality gate)

Spawn the `tester` subagent with:
- List of all new/modified files from Steps 8 and 9
- List of any new pure functions that need tests
- Instruction to run the full quality gate: `npm test`, `npm run build`, `npm run lint`

If any gate fails, fix the issues inline and re-run the tester before proceeding.

---

## Step 11 — Commit & raise PR

Once both gates are green:

```bash
# Stage specific files only — never git add -A or git add .
git add <list of specific files>

git commit -m "feat: <concise description>

Implements #<ISSUE_NUM>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push -u origin <BRANCH_NAME>
```

Then create the PR:
```bash
gh pr create \
  --title "<feature name>" \
  --base main \
  --label "feature" \
  --body "..."
```

**PR body template:**
```markdown
## Summary

Closes #<ISSUE_NUM>

<2–4 bullet points describing what was built>

## Spec & plan

`specs/<FEATURE_NUM>-<slug>/` — spec, plan, tasks, and contracts committed to this branch.

## Files changed

<list of new and modified source files with one-line description each>

## Security review

All 10 security categories passed. ✅

## Test plan

- [ ] `npm test` — all tests pass
- [ ] `npm run build` — zero type errors
- [ ] `npm run lint` — zero lint errors
- [ ] <manual test step 1 specific to this feature>
- [ ] <manual test step 2 specific to this feature>

## DB migration required?

<Yes — run `<migration filename>` in Supabase before testing> OR <No>

🤖 Built by the Sojourn agent team · Spec Kit · security-reviewer · tester
```

---

## Step 12 — Report to user

Show the user:
- PR URL to review and merge
- Any DB migration they need to run in Supabase before testing
- Location of the spec artifacts: `specs/<FEATURE_NUM>-<slug>/`
- A one-paragraph summary of what was built

**The feature is complete when the PR is open and awaiting the user's review. Never merge automatically.**

---

## Guardrails

- Never commit directly to `main`
- Never merge the PR — only create it
- Never mark a feature complete with failing security checks, tests, or type errors
- The Constitution Check in `/speckit-plan` (Step 4) is a hard gate — do not skip it
- `/speckit-analyze` (Step 5) is a hard gate — do not skip it
- Stage specific files only — never `git add -A` which could include `.env.local`
- If the plan touches auth or roles, confirm the security agent enforced correct role gates
- If a DB migration is needed, remind the user to run it in Supabase before testing
- CONTEXT.md and ADR updates (Step 2) must happen before planning — not batched at the end

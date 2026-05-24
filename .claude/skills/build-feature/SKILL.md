# /build-feature

Orchestrates the full agent development team to build a feature end-to-end, raise a PR,
and request human review. Spec Kit artifacts (spec.md, plan.md, tasks.md) live in `specs/`
and travel with the PR.

## Trigger
`/build-feature <input> [--from <N>]` — issue number, issue URL, or free-text description.

Optional `--from <N>` flag skips all steps before step N, loading existing artifacts
instead of regenerating them. Use this when planning has already been done at a higher
level (e.g. a module-level spec/plan covering multiple issues).

Valid `--from` values: `1` through `11`. Defaults to `1` (full run).

---

## Autonomous Mode

Activated when the invocation contains **"autonomous"** or **"autonomously"**:
- Skip Step 2 entirely
- Never call `AskUserQuestion` — resolve all decisions from project context
- Self-heal gate failures in Steps 9 and 10 inline; re-run until green
- Suppress all mid-workflow messages; speak only at Step 12
- After PR is created, run `/vercel:deploy` and capture the preview URL for Step 12

---

## Steps

### 0 — Resolve input
- **Parse flags**: Extract `--from <N>` if present. Set `START_STEP = N` (default `1`).
- **Issue number/URL**: `gh issue view <N> --json number,title,body,labels,comments`. Use title as feature name, body as requirements. Store as `ISSUE_TITLE` and `ISSUE_BODY`. Confirm: "Building from issue #N: [title]".
- **Free text**: use directly as requirements.
- If `START_STEP > 1`, confirm which steps are being skipped: "Skipping steps 1–[START_STEP-1] — loading existing artifacts."

### 1 — Specify *(skip if START_STEP > 1)*
**If skipping**: Verify `specs/<feature>/spec.md` exists. If missing, abort: "spec.md not found — run /speckit-specify first or remove --from flag." Load spec.md as `SPEC_CONTENT`. Capture `BRANCH_NAME` and `FEATURE_NUM` from the directory name.

**If running**: Run `/speckit-specify`. Produces `specs/<FEATURE_NUM>-<slug>/spec.md`. A new feature branch is created automatically (`001-feature-slug` naming). Capture `BRANCH_NAME` and `FEATURE_NUM` for later steps.

### 2 — Clarify *(skip if START_STEP > 2 OR autonomous mode)*
**If skipping**: Skip silently.

**If running**: Run `/speckit-clarify`. Encodes answers back into `spec.md`. Then:
1. Check `CONTEXT.md` for terminology conflicts; resolve and update inline if found.
2. If any clarify decision is hard to reverse, surprising without context, and the result of a real trade-off — create an ADR under `docs/adr/`. Skip if any condition is missing.

### 3 — Create GitHub issue *(skip if START_STEP > 3)*
**If skipping**: Verify issue exists via `gh issue view <N>`. If issue was passed as input in Step 0, it already exists — skip silently. Store `ISSUE_NUM` from input.

**If running**:
```
gh issue create --title "<feature name>" --label "feature" --body "..."
```

Body:
```markdown
## What to build
<end-to-end behaviour from spec.md>

## Acceptance criteria
<user scenarios as checkboxes>

## Spec
`specs/<FEATURE_NUM>-<slug>/spec.md`

## Blocked by
<issue numbers or "None — can start immediately">
```

Store the returned issue number as `ISSUE_NUM`. Confirm: "Created issue #N — starting the plan."

### 4 — Plan *(skip if START_STEP > 4)*
**If skipping**: Verify all of the following exist in `specs/<feature>/`:
- `plan.md`
- `research.md`
- `data-model.md`
- `contracts/`

If any are missing, abort: "[file] not found — run /speckit-plan first or adjust --from flag."
Load `plan.md` as `PLAN_CONTENT`.

**If running**: Run `/speckit-plan`. Produces `plan.md`, `research.md`, `data-model.md`, `contracts/`.
**Constitution Check is a hard gate** — resolve any failure before continuing.

### 5 — Tasks *(skip if START_STEP > 5)*
**If skipping**: Verify `specs/<feature>/tasks.md` exists. If missing, abort: "tasks.md not found — run /speckit-tasks first or adjust --from flag."

**If running**: Run `/speckit-tasks`. Produces `tasks.md` with dependency markers and `[P]` parallel hints.

### 6 — Analyze *(skip if START_STEP > 6)*
**If skipping**: Skip silently.

**If running**: Run `/speckit-analyze`. Cross-checks spec/plan/tasks for consistency.
**Hard gate** — fix all flagged issues before continuing.

### 7 — Architect
Spawn the `architect` subagent with `spec.md`, `plan.md`, `tasks.md`, and the project context from `CLAUDE.md`. Its job:
1. Split `tasks.md` into a backend list and a frontend list
2. Add any missing implementation details (migrations, Zod schemas, component props)
3. Flag conflicts with existing code

**If START_STEP > 1 (existing artifacts loaded)**: The spec/plan may cover a broader scope than this issue. Pass `ISSUE_TITLE` and `ISSUE_BODY` from Step 0 as the explicit scope boundary. Instruct the architect: "Restrict your task split strictly to the work described in this issue. Ignore unrelated sections of the spec/plan."

Wait for output before proceeding.

### 8 — Backend + Frontend (parallel)
Spawn both agents in parallel:

**backend-dev**: architect's backend list + `data-model.md` + `contracts/` + any migration SQL. Implement all tasks completely.

**frontend-dev**: architect's frontend list + `spec.md` user scenarios as acceptance criteria. Read nearby components before implementing. Implement all tasks completely.

Wait for both.

### 9 — Security review (blocking gate)
Spawn `security-reviewer` with the full list of new/modified files. Include instruction to run `npm audit`.

If any category is FAIL: fix inline, re-run on fixed files, repeat until all PASS. Do not proceed until green.

### 10 — Tester (quality gate)
Spawn `tester` with all new/modified files and any new pure functions. Run `npm test`, `npm run build`, `npm run lint`.

If any gate fails: fix inline, re-run tester, repeat until green.

### 11 — Commit & raise PR
Stage specific files only (never `git add -A`). Commit:
```
feat: <concise description>

Implements #<ISSUE_NUM>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```
Push, then:
```
gh pr create --title "<feature name>" --base main --label "feature" --body "..."
```

PR body:
```markdown
## Summary
Closes #<ISSUE_NUM>

<2–4 bullet points>

## Spec & plan
`specs/<FEATURE_NUM>-<slug>/` — spec, plan, tasks, and contracts committed to this branch.

## Files changed
<new and modified files with one-line description each>

## Security review
All 10 security categories passed. ✅

## Test plan
- [ ] `npm test` — all tests pass
- [ ] `npm run build` — zero type errors
- [ ] `npm run lint` — zero lint errors
- [ ] <manual test step 1>
- [ ] <manual test step 2>

## DB migration required?
<Yes — run `<filename>` in Supabase before testing> OR <No>

🤖 Built by the Sojourn agent team · Spec Kit · security-reviewer · tester
```

**Autonomous mode only**: run `/vercel:deploy`, capture the preview URL.

### 12 — Report
- PR URL
- DB migration to run (if any)
- Spec artifacts location: `specs/<FEATURE_NUM>-<slug>/`
- One-paragraph summary of what was built
- **Autonomous mode only**: Vercel preview URL

**Never merge the PR — only create it.**

---

## Guardrails
- Never commit to `main`; never merge the PR
- Never mark complete with failing security, tests, or type errors
- Never `git add -A` — stage specific files only
- Constitution Check (Step 4) and `/speckit-analyze` (Step 6) are hard gates
- If plan touches auth/roles, confirm security agent enforced correct role gates
- Remind user of any required DB migration before testing
- CONTEXT.md and ADR updates (Step 2) must happen before planning
- When `--from <N>` is used with module-level artifacts, always pass issue scope to architect (Step 7)

---

## Common Invocation Patterns

```bash
# Full run from scratch (free text)
/build-feature Add a dark mode toggle

# Full run from a GitHub issue
/build-feature 73

# Skip planning — spec/plan/tasks already exist, start at architect
/build-feature 73 --from 7

# Skip planning and tasks — spec/plan exist, run tasks then build
/build-feature 73 --from 5

# Fully autonomous from an issue
/build-feature 73 autonomously

# Autonomous starting from architect (all planning done)
/build-feature 73 --from 7 autonomously
```

# /build-feature

Orchestrates the full agent development team to build a feature end-to-end, raise a PR, and request human review.

## Trigger
User says `/build-feature <input>` where `<input>` is one of:
- A GitHub issue number: `/build-feature #42` or `/build-feature 42`
- A GitHub issue URL
- A free-text feature description

---

## Step 0 — Resolve the feature description

**If input is an issue number or URL**, fetch it with:
```bash
gh issue view <number> --json number,title,body,labels,comments
```
Use the issue title as the feature name and the body as the requirements. Include label context and any clarifying comments.

Confirm to the user: "Building from issue #N: [title]" before grilling.

**If input is free text**, use it directly as the starting description.

---

## Step 0.5 — Grill session (requirements crystallisation)

Before any planning or code, conduct a **grill-with-docs session** following the procedure in `.claude/skills/grill-with-docs/SKILL.md`.

The goal is to reach a shared, precise understanding of the feature before any work begins. Do not skip this step — even for small features.

**How to run the grill:**

1. Explore the codebase for anything relevant to the feature (existing components, API routes, DB schema, types). Answer questions from the code where possible — only ask the user when the code doesn't answer.

2. Check `CONTEXT.md` (if it exists) for domain terminology conflicts. If the user's description uses a term differently from the glossary, call it out immediately.

3. Ask probing questions **one at a time**, waiting for the user's answer before continuing. For each question, state your recommended answer so the user can redirect rather than having to think from scratch. Cover:
   - **Scope**: What exactly is in and out of scope for this feature?
   - **Edge cases**: What happens when [specific scenario]?
   - **Role behaviour**: Does this work differently for main accounts vs assistants?
   - **Data model impact**: Does this need a new DB column, table, or migration?
   - **Audit requirement**: Does this action need to be logged to `audit_log`?
   - **UI entry point**: Where does the user access this? New page, modal, or existing component?
   - Any other design decisions the code doesn't already answer.

4. When a domain term is resolved or introduced, update `CONTEXT.md` inline. Do not batch — write it immediately.

5. Create an ADR only when all three conditions apply: the decision is hard to reverse, surprising without context, and the result of a real trade-off between alternatives. Follow the format in `.claude/skills/grill-with-docs/ADR-FORMAT.md`.

6. When all open questions are resolved, summarise the crystallised requirements to the user and ask: **"Does this capture everything? Should I create the GitHub issue and start building?"** Wait for explicit confirmation before proceeding.

---

## Step 0.75 — Create GitHub issue from crystallised requirements

Once the user confirms the grill output:

1. Create a new GitHub issue using the crystallised requirements:
```bash
gh issue create \
  --title "<feature name>" \
  --label "feature" \
  --body "..."
```

Issue body uses this template:
```markdown
## What to build
<concise description from grill session — end-to-end behaviour, not layer-by-layer>

## Acceptance criteria
- [ ] <criterion from grill session>
- [ ] <criterion from grill session>
...

## Blocked by
<issue numbers if any, or "None — can start immediately">
```

2. Confirm the issue number to the user: "Created issue #N — starting the build."
   This issue number is used in the branch name and PR in later steps.

---

## Step 1 — Architect (planning)

Spawn the `architect` subagent with:
- The resolved feature name and full requirements text
- Instruction to read relevant existing files before planning
- The full project context from CLAUDE.md

Wait for the plan before proceeding.

---

## Step 2 — Create feature branch

Before any code is written, create and switch to a feature branch using the issue number from Step 0.75:

```bash
# Derive slug from issue title (lowercase, hyphens, max 40 chars)
BRANCH="feature/issue-<N>-<slug>"    # e.g. feature/issue-24-trip-sharing
git checkout -b $BRANCH
```

Confirm the branch name to the user.

---

## Step 3 — Backend Dev + Frontend Dev (parallel implementation)

Spawn both agents **in parallel**:

**backend-dev** — pass:
- The architect's backend task list verbatim
- Any DB migration SQL from the plan
- Instruction to implement all tasks completely

**frontend-dev** — pass:
- The architect's frontend task list verbatim
- Instruction to read nearby components before implementing
- Instruction to implement all tasks completely

Wait for both to complete.

---

## Step 4 — Security Review (blocking gate)

Spawn the `security-reviewer` subagent with:
- The full list of new and modified files from Step 3
- Instruction to run `npm audit` and report any new dependencies

**If the security report contains any FAIL:**
1. Show the full report to the user
2. Fix every flagged issue inline (do not skip or defer)
3. Re-run the security agent on the fixed files
4. Only proceed when the report is all PASS

**Do NOT proceed to Step 5 until security is fully green.**

---

## Step 5 — Tester (quality gate)

Spawn the `tester` subagent with:
- List of all new/modified files from Steps 3 and 4
- List of any new pure functions that need tests
- Instruction to run the full quality gate: `npm test`, `npm run build`, `npm run lint`

If any gate fails, fix the issues inline and re-run the tester before proceeding.

---

## Step 6 — Commit & raise PR

Once both security and quality gates are green:

```bash
# Stage all changed files (be specific — no git add -A)
git add <list of specific files>

# Commit
git commit -m "feat: <concise description from issue title>

Implements #<issue-number>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# Push branch
git push -u origin $BRANCH
```

Then create the PR:
```bash
gh pr create \
  --title "<issue title>" \
  --base main \
  --body "..." \   # see PR body template below
  --label "feature"
```

**PR body template:**
```markdown
## Summary

Closes #<issue-number>

<2–4 bullet points describing what was built>

## Files changed

<list of new and modified files with one-line description each>

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

🤖 Built by the Sojourn agent team · Reviewed by security-reviewer · Approved by tester
```

---

## Step 7 — Report to user

Show the user:
- PR URL to review and merge
- Any DB migration they need to run in Supabase before testing
- A one-paragraph summary of what was built

**The feature is complete when the PR is open and awaiting the user's review. Never merge automatically.**

---

## Guardrails

- Never commit directly to `main`
- Never merge the PR — only create it
- Never mark a feature complete with failing security checks, tests, or type errors
- If a DB migration is needed, remind the user to run it in Supabase before testing the branch
- If the architect's plan touches auth or roles, double-check the security agent enforced correct role gates
- Stage specific files only — never `git add -A` or `git add .` which could accidentally include `.env.local`

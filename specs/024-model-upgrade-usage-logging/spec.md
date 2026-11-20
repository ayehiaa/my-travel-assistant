# Feature Spec: 024 Model upgrade + AI usage logging

**Status**: Implemented · **Date**: 2026-11-20 · **Owner-approved goal** (cost phase of the autonomous build)

## Summary
Move every portfolio-analysis Claude call (7 agents, the synthesizer and the Shariah reviewer — 9 calls per run) from
`claude-sonnet-4-6` to `claude-sonnet-5-5`, with model ids and per-role settings in one module, and record what each
run actually costs (tokens + USD) so the owner can see it on the recommendation page and a later Activity view can
list cost per run.

## User stories
1. **As the owner**, I want the analysis pipeline on the current Sonnet model so recommendations use the better model
   at a lower per-token price.
2. **As the owner**, I want to see what each analysis run cost (tokens and dollars) on its recommendation page.
3. **As a developer**, I want model ids and per-role settings (max tokens, effort) in one place so a role can be moved
   to another model later without touching call sites.

## Acceptance criteria
- AC1 All 9 portfolio-analysis calls use `claude-sonnet-5-5` via `src/lib/aiModels.ts`. Haiku calls in expenses/gmail
  are unchanged.
- AC2 Requests respect Sonnet 5.5 rules: no `thinking: disabled`, no `temperature`/`top_p`/`top_k`, no forced
  `tool_choice`; effort sent as `output_config.effort`; `max_tokens` = 8000 (agents, effort medium), 16000
  (synthesizer and reviewer, effort high).
- AC3 Text is read from the first `type === "text"` content block (never `content[0]`).
- AC4 `stop_reason: "refusal"` → agents return a neutral, low-confidence fallback (like the parse-failure fallback);
  synthesizer and reviewer throw (step retries, then the run fails). `stop_reason: "max_tokens"` → synthesizer and
  reviewer throw. A reviewer failure never passes a ticker.
- AC5 Every call records `usage` (input, output, cache-creation, cache-read tokens) with role, name, model and cost.
  Each Inngest step returns its usage together with its output, so retries don't lose or double-count it.
- AC6 A per-run summary `{ calls[], totals, cost_usd }` is stored in `recommendations.agent_outputs.usage` (no
  migration). The agent breakdown and every reader of `agent_outputs` ignore the `usage` key.
- AC7 The recommendation page shows a small "Run cost" line (tokens + $) when usage exists; older runs show nothing.
- AC8 `readRunUsage(row)` is exported for later use (Phase 6 Activity); `GET /api/portfolio/recommendations/[id]`
  also returns `run_usage`.
- AC9 Pure tests for cost calculation, text extraction and stop-reason handling.

## Out of scope
- Prompt caching (no shared prefix across the 9 calls worth caching yet — measure first using the new logging).
- Server-side refusal fallbacks (see decisions).
- Expenses / Gmail Haiku calls.

## Run cost estimate (updated for Claude Sonnet 5.5 with adaptive thinking)
Prices: $2 / 1M input, $10 / 1M output (thinking tokens bill as output), cache reads $0.10 / 1M.

| Call | Input tokens (approx.) | Output incl. thinking (approx.) | Cost |
|---|---|---|---|
| 7 agents (effort medium) | 7 × 1.5–3k ≈ 10–20k | 7 × 1–2.5k ≈ 7–17k | $0.09–0.21 |
| Synthesizer (effort high) | 6–10k | 2–5k | $0.03–0.07 |
| Shariah reviewer (effort high) | 2–5k | 1.5–4k | $0.02–0.05 |
| **Run total** | ~18–35k | ~10–26k | **≈ $0.15–0.30** |

Before (Sonnet 4.6, no thinking, max 800/3000 output tokens) a run was roughly $0.08–0.15; thinking adds output
tokens but the per-token price is lower. These are estimates; the actual figures now come from
`agent_outputs.usage` on each run (shown as "Run cost" on the recommendation page). Re-check this table against
the first ~10 real runs.

## Decisions made autonomously
1. **No SDK upgrade**: installed `@anthropic-ai/sdk@0.92.0` already types `output_config.effort` (incl. `xhigh`/`max`)
   and the `refusal` stop reason. Upgrading to 1.x is a major-version change with no benefit here, so it was skipped.
2. **Non-streaming kept**: 16000 `max_tokens` stays under the SDK's non-streaming limit; no streaming refactor.
3. **No server-side `fallbacks`**: refusal fallbacks need the beta endpoint and a beta header; the owner's brief
   fixed the request parameters, so a refusal is handled as an error as specified. Listed as a follow-up.
4. **Thinking param omitted** (adaptive is the default on Sonnet 5.5); thinking display left at the default
   (omitted) — the thinking text is never shown or stored.
5. **Cache-write price** = 1.25 × input price (standard 5-minute cache write multiplier); no call uses caching today,
   so it is 0 in practice. Unknown models are priced at $0 and flagged `unpriced` rather than guessed.
6. **Agent max_tokens** on an agent: a truncated answer still goes through the normal parse; if it does not parse,
   the existing low-confidence fallback is used (agents never fail the run for this).
7. **Usage of failed attempts** (a synthesizer/reviewer call that throws on refusal/max_tokens and is retried) is not
   recorded — only the successful attempt of each step. Noted as a limitation.
8. **Reviewer reads the first text block** (previously joined all text blocks), as required.
9. Shared request code lives in `src/lib/aiCall.ts` (server only) so all 9 call sites use one code path; the seven
   identical agent schemas/parsers were consolidated into `parseAgentResponse`.

## Known limitations / follow-ups
- Thinking makes calls slower (synthesizer/reviewer at effort high can take noticeably longer); if an Inngest step
  hits the hosting function timeout, consider streaming or lowering effort for that role in `aiModels.ts`.
- Opt-in server-side refusal fallbacks (`fallbacks: "default"`, beta) could replace "refusal = error" later.
- Prompt caching not used; measure with the new usage logs first.
- Failed (retried) synthesizer/reviewer attempts are not counted in the run cost.

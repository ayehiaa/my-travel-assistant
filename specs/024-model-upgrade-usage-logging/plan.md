# Implementation Plan: 024 Model upgrade + AI usage logging

## Technical context
Next.js 16, Inngest steps, `@anthropic-ai/sdk` 0.92.0 (`messages.create`, `output_config.effort`, `StopReason` incl.
`refusal`), Zod, Vitest. No migration: usage lives in `recommendations.agent_outputs.usage` (jsonb).

## Constitution check
- No trading / execution / Shariah guard is weakened: the reviewer still fails closed (throws on refusal,
  max_tokens, malformed output); code-level `decideTickerVerdict` is unchanged.
- Pure logic tested next to files. No console.log. No new env vars.
- Works with any existing row: `readRunUsage` returns `null` for rows without (or with malformed) usage.

## Design
### Pure
- `src/lib/aiModels.ts` — `AI_MODELS`, `AiRole` (`agent` | `synthesizer` | `shariah_reviewer`),
  `AI_ROLE_CONFIG` (model, maxTokens, effort), `getRoleConfig(role)`.
- `src/lib/aiResponse.ts` — `extractFirstText(content)`, `checkStopReason(stop)` →
  `{ ok } | { ok: false, reason }`, `assertCompleteResponse(stop, label)` (throws on refusal / max_tokens),
  `parseAgentResponse(text, stop)` (refusal → neutral low-confidence fallback; parse failure → existing fallback).
- `src/lib/aiCost.ts` — `MODEL_PRICES`, `computeCallCost(model, usage)`, `buildCallUsage(...)`,
  `summarizeRunUsage(calls)`, `readRunUsage(row)` (Zod, defensive), `formatRunCost(summary)`.

### Server
- `src/lib/aiCall.ts` — `callClaude({ role, name, system, user })` → `{ text, stopReason, usage }` using role config;
  sends `model`, `max_tokens`, `output_config.effort`, `system`, `messages` only.
- 7 agents return `{ output, usage }`; `runSynthesizer` returns `{ result, usage }`; `runShariahReviewer` returns
  `{ verdicts, usage }` (usage `null` for zero tickers).
- `portfolioAnalysis.ts`: each step returns its usage with its output; `screen-and-save` (and the screening-failure
  write) stores `usage: summarizeRunUsage([...])` in `agent_outputs`.

### UI / API
- `RunCostLine` (Tailwind, self-contained) on `RecommendationDetail` under the summary.
- `GET /api/portfolio/recommendations/[id]` adds `run_usage`.
- `AgentBreakdown` comment updated (it already renders only known agent keys).

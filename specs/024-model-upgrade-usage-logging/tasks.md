# Tasks: 024 Model upgrade + AI usage logging

## Pure logic (tested)
- [x] T1 `src/lib/aiModels.ts` — model ids + per-role config (+ tests)
- [x] T2 `src/lib/aiResponse.ts` — first-text extraction, stop-reason checks, agent response parsing (+ tests)
- [x] T3 `src/lib/aiCost.ts` — price table, call cost, run summary, `readRunUsage`, `formatRunCost` (+ tests)

## Server
- [x] T4 `src/lib/aiCall.ts` — shared `callClaude` (model/max_tokens/effort from role config; usage captured)
- [x] T5 Migrate the 7 agents to `callClaude` + `parseAgentResponse`; return `{ output, usage }`
- [x] T6 Migrate synthesizer (throw on refusal / max_tokens); return `{ result, usage }`
- [x] T7 Migrate Shariah reviewer (throw on refusal / max_tokens; fail closed); return `{ verdicts, usage }`
- [x] T8 `portfolioAnalysis.ts` — steps return usage; store `agent_outputs.usage`

## UI / API
- [x] T9 `RunCostLine` on the recommendation page; AgentBreakdown ignores `usage`
- [x] T10 `run_usage` in `GET /api/portfolio/recommendations/[id]`

## Docs
- [x] T11 Run-cost estimate in spec.md; CLAUDE.md "Current Feature Plan"

## Quality gate
- [x] Q1 `npm run build`, `npm test`, `npm run lint`; no console.log

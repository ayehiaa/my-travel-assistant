# Architect Notes — Agents Pipeline Demo: Anthropic API

## Backend Tasks

- **`src/app/api/agents/run/route.ts`** — full internal rewrite (file stays, exports stay):
  - Remove `import { spawn } from 'child_process'`
  - Remove `runClaude()` function, `CHILD_ENV_ALLOWLIST`, `childEnv`
  - Add `import Anthropic from '@anthropic-ai/sdk'`
  - Add `const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` at module level (matches pattern in `src/inngest/agents/*.ts`)
  - Add helper `async function streamPhase(phase, systemPrompt, userPrompt, model, send)`:
    - Calls `anthropic.messages.stream({ model, max_tokens: 1500, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] })`
    - On each `text` delta: `send({ type: 'text_delta', phase, text: delta })`
    - Returns accumulated full text on completion
    - On stream error: throws so caller can send `{ type: 'error', ... }`
  - Replace `runPipeline()` body — call `streamPhase()` for each phase using prompts below:

  **prep phase** (model: `claude-haiku-4-5-20251001`, max_tokens: 800):
  - system: `"You are a software architect. For the given requirement produce: 1) One-paragraph feature summary. 2) Backend — bullet list of API routes/files to create with what each does. 3) Frontend — bullet list of components/pages to create with what each does. Be concise and concrete."`
  - user: `"Requirement: ${requirement}"`

  **backend phase** (model: `claude-sonnet-4-6`, max_tokens: 1500):
  - system: `"You are a senior backend developer. Given a requirement, write the key TypeScript implementation: Next.js App Router API route handler with Zod validation, Supabase query, and audit log call. Output code directly."`
  - user: `"Requirement: ${requirement}"`

  **frontend phase** (model: `claude-sonnet-4-6`, max_tokens: 1500):
  - system: `"You are a senior frontend developer. Given a requirement, write the key TypeScript React component: use Tailwind CSS, follow Next.js App Router with React 19 patterns. Output code directly."`
  - user: `"Requirement: ${requirement}"`

  **quality phase** (model: `claude-sonnet-4-6`, max_tokens: 1200, only when `full=true`):
  - system: `"You are a security engineer and test lead. Review the requirement and produce: 1) Security checklist (auth gates, input validation, XSS, SQL injection, PII). 2) Vitest test stubs for pure functions. 3) Suggested PR title and summary."`
  - user: `"Requirement: ${requirement}"`

  - The SSE `send` helper, heartbeat, stream headers, auth check, and `full` flag logic remain unchanged
  - Add `text_delta` to the `SSEEvent` discriminated union type in this file

## Frontend Tasks

- **`src/components/agents/AgentsDemoPage.tsx`** — add live output panel:
  - Add `SSEEvent` union type: add `| { type: 'text_delta'; phase: PhaseId; text: string }`
  - Add state: `const [phaseOutput, setPhaseOutput] = useState<Partial<Record<PhaseId, string>>>({})`
  - In `handleRun`: add `setPhaseOutput({})` to reset on new run
  - In SSE parse loop: add handler:
    ```ts
    else if (ev.type === 'text_delta' && ev.phase) {
      setPhaseOutput(prev => ({ ...prev, [ev.phase]: (prev[ev.phase] ?? '') + ev.text }))
    }
    ```
  - Add output panel below the pipeline diagram card (before the legend):
    - Show the output of the active phase (or last completed phase if none active)
    - Use a `<pre>` tag with `whitespace-pre-wrap`, monospace font, max-h ~40vh, overflow-y auto, scrolled to bottom on new content (use `useEffect` + `ref.scrollTop = ref.scrollHeight`)
    - Only render the panel when `Object.keys(phaseOutput).length > 0`
    - Label it with the phase name (e.g. "Architect output", "Backend output")
    - Style to match the existing card (rounded-2xl, border var(--rule), background var(--paper))

## Migration SQL
None — no DB changes.

## Conflicts / Risks
- Vercel function timeout: default is 300s, well above expected run time (~30–60s). No config change needed.
- The `full` quality phase adds ~15s and ~$0.013 to per-run cost. Acceptable for a demo.
- `ANTHROPIC_API_KEY` must be set in Vercel env vars — document in PR description.
- No file writes in the new implementation — agents generate text output only (stateless).

import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { createClient } from '@/lib/supabase/server'

type PhaseId =
  | 'specify' | 'plan' | 'tasks'
  | 'backend' | 'frontend'
  | 'quality'

const HAIKU = 'claude-haiku-4-5-20251001'

function runClaude(
  phase: string,
  prompt: string,
  env: NodeJS.ProcessEnv,
  model?: string,
  maxTurns = 20,
): Promise<{ success: boolean; error?: string }> {
  const args = [
    '--dangerously-skip-permissions', '-p',
    '--max-turns', String(maxTurns),
  ]
  if (model) args.push('--model', model)
  args.push(prompt)

  return new Promise((resolve) => {
    const proc = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'], env })
    let stderr = ''
    let stdout = ''
    proc.stderr?.on('data', (c: Buffer) => { stderr += c.toString() })
    proc.stdout?.on('data', (c: Buffer) => { stdout += c.toString() })
    proc.on('close', (code) => {
      console.error(`[agents/${phase}] exit ${code}${stderr ? ' stderr: ' + stderr.slice(0, 200) : ''}${code !== 0 ? ' stdout: ' + stdout.slice(0, 400) : ''}`)
      const error = stderr.trim() || (code !== 0 ? stdout.slice(0, 400) : undefined)
      resolve({ success: code === 0, error })
    })
    proc.on('error', (err) => resolve({ success: false, error: err.message }))
  })
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  if (roleRecord?.role !== 'premium') return new Response('Forbidden', { status: 403 })

  const body = await req.json().catch(() => ({}))
  let requirement = String(body.requirement ?? '').trim()
  requirement = requirement.replace(/^\/build-feature\s+/i, '').replace(/\s+autonomously\s*$/i, '').trim()
  if (requirement.length < 5 || requirement.length > 500) {
    return new Response('Requirement must be 5–500 characters', { status: 400 })
  }
  const full = Boolean(body.full)

  const enc = new TextEncoder()
  let closed = false
  const SECRET_ENV_KEYS = new Set([
    'ANTHROPIC_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERPAPI_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ])
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !SECRET_ENV_KEYS.has(k))
  ) as NodeJS.ProcessEnv

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        if (closed) return
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)) }
        catch { closed = true }
      }

      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return }
        try { controller.enqueue(enc.encode(': ping\n\n')) }
        catch { clearInterval(heartbeat) }
      }, 15_000)

      async function runPipeline() {
        // Phases 1–3: single Haiku call replaces speckit-specify + speckit-plan + speckit-tasks.
        // Writes files directly without validation loops, checklists, or hook checks.
        send({ type: 'phase_start', phase: 'specify' })
        send({ type: 'phase_start', phase: 'plan' })
        send({ type: 'phase_start', phase: 'tasks' })
        const prepResult = await runClaude(
          'prep',
          'You are a rapid spec + architect agent for an automated demo pipeline. ' +
          `The requirement is: "${requirement}"\n\n` +
          'Do the following in one pass — no validation loops, no checklists, no clarifying questions:\n\n' +
          '1. Scan the specs/ directory to find the next sequential 3-digit number (e.g. if 013 exists, use 014). ' +
          'Create a short 2-4 word kebab-case name from the requirement. ' +
          'Set FEATURE_DIR to specs/NNN-short-name and create the directory.\n\n' +
          '2. Write .specify/feature.json: {"feature_directory": "specs/NNN-short-name"}\n\n' +
          '3. Write FEATURE_DIR/architect-notes.md containing:\n' +
          '   - One-paragraph feature summary\n' +
          '   - ## Backend tasks: bullet list of specific files to create/modify in src/ with what each does\n' +
          '   - ## Frontend tasks: bullet list of specific files to create/modify in src/ with what each does\n' +
          '   Base file paths on CLAUDE.md conventions and existing src/ structure.\n\n' +
          'Stop after writing those two files. Follow CLAUDE.md conventions.',
          childEnv,
          HAIKU,
          15,
        )
        send({ type: 'phase_done', phase: 'specify' })
        send({ type: 'phase_done', phase: 'plan' })
        send({ type: 'phase_done', phase: 'tasks' })
        if (!prepResult.success) {
          send({ type: 'error', message: prepResult.error ?? 'prep phase failed' })
          send({ type: 'pipeline_done', success: false })
          return
        }

        // Phases 4–5: backend then frontend — serial to avoid simultaneous quota burn
        for (const id of ['backend', 'frontend'] as const) {
          send({ type: 'phase_start', phase: id })
          const result = await runClaude(
            id,
            id === 'backend'
              ? 'You are the backend-dev agent. First, scan src/lib/, src/app/api/, and src/hooks/ to ' +
                'understand existing utilities, helpers, and patterns — only use what already exists, never invent imports. ' +
                'Then read .specify/feature.json for the feature directory and read architect-notes.md for your tasks. ' +
                'Implement all backend work: API routes, Zod validation, Supabase queries, audit logging. ' +
                'Follow CLAUDE.md conventions.'
              : 'You are the frontend-dev agent. First, scan src/components/, src/hooks/, and src/lib/ to ' +
                'understand existing components, hooks, and patterns — only use what already exists, never invent imports. ' +
                'Then read .specify/feature.json for the feature directory and read architect-notes.md for your tasks. ' +
                'Implement all frontend work: React components, Next.js pages, Tailwind CSS styling. ' +
                'Follow CLAUDE.md conventions.',
            childEnv,
            undefined,
            40,
          )
          send({ type: 'phase_done', phase: id })
          if (!result.success) {
            send({ type: 'error', message: result.error ?? `${id} phase failed` })
            send({ type: 'pipeline_done', success: false })
            return
          }
        }

        if (!full) {
          send({ type: 'pipeline_done', success: true })
          return
        }

        // Phase 6: security + tests + PR merged into one call
        send({ type: 'phase_start', phase: 'quality' })
        const qualityResult = await runClaude(
          'quality',
          'Do the following in order:\n' +
          '1. Security review: run `git diff main` to see changed files. Audit each for auth vulnerabilities, ' +
          'XSS, SQL injection, secret leakage, PII exposure, and vulnerable dependencies. Fix any issues found.\n' +
          '2. Tests: write Vitest unit tests for any new pure functions added on this branch. ' +
          'Run npm run build, npm run lint, npm test. Fix any failures.\n' +
          '3. PR: create a GitHub pull request targeting main using `gh pr create` with a concise title ' +
          'and summary of what was built. Return the PR URL.',
          childEnv,
        )
        send({ type: 'phase_done', phase: 'quality' })
        if (!qualityResult.success) {
          send({ type: 'error', message: qualityResult.error ?? 'quality phase failed' })
          send({ type: 'pipeline_done', success: false })
          return
        }

        send({ type: 'pipeline_done', success: true })
      }

      runPipeline()
        .catch((err) => {
          send({ type: 'error', message: String(err) })
          send({ type: 'pipeline_done', success: false })
        })
        .finally(() => {
          clearInterval(heartbeat)
          if (!closed) { closed = true; controller.close() }
        })
    },
    cancel() { closed = true },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

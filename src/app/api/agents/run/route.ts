import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import { createClient } from '@/lib/supabase/server'

type PhaseId =
  | 'specify' | 'plan' | 'tasks'
  | 'backend' | 'frontend'
  | 'security' | 'tester' | 'pr'

function runClaude(phase: string, prompt: string, env: NodeJS.ProcessEnv): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      'claude',
      ['--dangerously-skip-permissions', '-p', '--verbose', '--max-turns', '50', '--output-format', 'stream-json', prompt],
      { stdio: ['ignore', 'pipe', 'pipe'], env },
    )
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

  const enc = new TextEncoder()
  let closed = false
  const { ANTHROPIC_API_KEY: _omit, ...childEnv } = process.env

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
        // Sequential phases: specify → plan → tasks (with architect split)
        const sequential: { id: PhaseId; prompt: string }[] = [
          { id: 'specify', prompt: `/speckit-specify ${requirement}` },
          { id: 'plan',    prompt: '/speckit-plan' },
          {
            id: 'tasks',
            prompt:
              'First run /speckit-tasks to generate tasks.md. ' +
              'Then, acting as architect, read .specify/feature.json to find the feature directory, ' +
              'read spec.md and the generated tasks.md, and review the relevant source code in src/. ' +
              'Produce a file-by-file implementation plan separating backend tasks and frontend tasks. ' +
              'Write it to the feature directory as architect-notes.md. Follow CLAUDE.md conventions.',
          },
        ]

        for (const { id, prompt } of sequential) {
          send({ type: 'phase_start', phase: id })
          const result = await runClaude(id, prompt, childEnv)
          send({ type: 'phase_done', phase: id })
          if (!result.success) {
            send({ type: 'error', message: result.error ?? `${id} phase failed` })
            send({ type: 'pipeline_done', success: false })
            return
          }
        }

        // Parallel: backend + frontend
        send({ type: 'phase_start', phase: 'backend' })
        send({ type: 'phase_start', phase: 'frontend' })
        const [backendResult, frontendResult] = await Promise.all([
          runClaude('backend',
            'You are the backend-dev agent. Read .specify/feature.json to find the feature directory, ' +
            'then read architect-notes.md and tasks.md for your backend tasks. ' +
            'Implement all backend work: API routes, Zod validation, Supabase queries, audit logging. ' +
            'Follow CLAUDE.md conventions.',
            childEnv,
          ),
          runClaude('frontend',
            'You are the frontend-dev agent. Read .specify/feature.json to find the feature directory, ' +
            'then read architect-notes.md and tasks.md for your frontend tasks. ' +
            'Implement all frontend work: React components, Next.js pages, Tailwind CSS styling. ' +
            'Follow CLAUDE.md conventions.',
            childEnv,
          ),
        ])
        send({ type: 'phase_done', phase: 'backend' })
        send({ type: 'phase_done', phase: 'frontend' })
        if (!backendResult.success || !frontendResult.success) {
          const err = (!backendResult.success ? backendResult.error : frontendResult.error) ?? 'implementation failed'
          send({ type: 'error', message: err })
          send({ type: 'pipeline_done', success: false })
          return
        }

        // Security review
        send({ type: 'phase_start', phase: 'security' })
        const securityResult = await runClaude('security',
          'You are the security-reviewer agent. Run `git diff main` to see all changed files on this branch. ' +
          'Audit each changed file for: auth vulnerabilities, XSS, SQL injection, secret leakage, PII exposure, ' +
          'and vulnerable dependencies. Produce a PASS/FAIL report per category. Fix any FAIL items before reporting done.',
          childEnv,
        )
        send({ type: 'phase_done', phase: 'security' })
        if (!securityResult.success) {
          send({ type: 'error', message: securityResult.error ?? 'security review failed' })
          send({ type: 'pipeline_done', success: false })
          return
        }

        // Tester
        send({ type: 'phase_start', phase: 'tester' })
        const testerResult = await runClaude('tester',
          'You are the tester agent. Write Vitest unit tests for any new pure functions added on this branch. ' +
          'Then run: npm run build, npm run lint, npm test. ' +
          'Report pass/fail for each. Fix any failures before reporting done.',
          childEnv,
        )
        send({ type: 'phase_done', phase: 'tester' })
        if (!testerResult.success) {
          send({ type: 'error', message: testerResult.error ?? 'tests failed' })
          send({ type: 'pipeline_done', success: false })
          return
        }

        // PR
        send({ type: 'phase_start', phase: 'pr' })
        const prResult = await runClaude('pr',
          'Create a GitHub pull request for the current feature branch targeting main. ' +
          'Use `gh pr create` with a concise title and a summary of what was built and why. ' +
          'Return the PR URL when done.',
          childEnv,
        )
        send({ type: 'phase_done', phase: 'pr' })
        if (!prResult.success) {
          send({ type: 'error', message: prResult.error ?? 'PR creation failed' })
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

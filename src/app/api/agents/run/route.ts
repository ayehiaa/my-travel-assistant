import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { createClient } from '@/lib/supabase/server'
import { createPipeline, emitEvent, type PipelineEvent } from '@/lib/pipelineStore'

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
      if (process.env.NODE_ENV !== 'production') console.error(`[agents/${phase}] exit ${code}${stderr ? ' stderr: ' + stderr.slice(0, 200) : ''}${code !== 0 ? ' stdout: ' + stdout.slice(0, 400) : ''}`)
      const error = stderr.trim() || (code !== 0 ? stdout.slice(0, 400) : undefined)
      resolve({ success: code === 0, error })
    })
    proc.on('error', (err) => resolve({ success: false, error: err.message }))
  })
}

async function executePipeline(
  id: string,
  requirement: string,
  full: boolean,
  childEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const emit = (event: PipelineEvent) => emitEvent(id, event)

  emit({ type: 'phase_start', phase: 'specify' })
  emit({ type: 'phase_start', phase: 'plan' })
  emit({ type: 'phase_start', phase: 'tasks' })

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

  emit({ type: 'phase_done', phase: 'specify' })
  emit({ type: 'phase_done', phase: 'plan' })
  emit({ type: 'phase_done', phase: 'tasks' })

  if (!prepResult.success) {
    emit({ type: 'error', message: prepResult.error ?? 'prep phase failed' })
    emit({ type: 'pipeline_done', success: false })
    return
  }

  for (const phaseId of ['backend', 'frontend'] as const) {
    emit({ type: 'phase_start', phase: phaseId })
    const result = await runClaude(
      phaseId,
      phaseId === 'backend'
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
    emit({ type: 'phase_done', phase: phaseId })
    if (!result.success) {
      emit({ type: 'error', message: result.error ?? `${phaseId} phase failed` })
      emit({ type: 'pipeline_done', success: false })
      return
    }
  }

  if (!full) {
    emit({ type: 'pipeline_done', success: true })
    return
  }

  emit({ type: 'phase_start', phase: 'quality' })
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
  emit({ type: 'phase_done', phase: 'quality' })
  if (!qualityResult.success) {
    emit({ type: 'error', message: qualityResult.error ?? 'quality phase failed' })
    emit({ type: 'pipeline_done', success: false })
    return
  }

  emit({ type: 'pipeline_done', success: true })
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  if (!roleRecord || roleRecord.role !== 'premium_plus') return new Response('Forbidden', { status: 403 })

  const body = await req.json().catch(() => ({}))
  let requirement = String(body.requirement ?? '').trim()
  requirement = requirement.replace(/^\/build-feature\s+/i, '').replace(/\s+autonomously\s*$/i, '').trim()
  if (requirement.length < 5 || requirement.length > 500) {
    return new Response('Requirement must be 5–500 characters', { status: 400 })
  }
  const full = Boolean(body.full)

  const CHILD_ENV_ALLOWLIST = new Set(['PATH', 'HOME', 'NODE_ENV', 'TMPDIR', 'TEMP', 'TMP', 'TERM', 'USER', 'USERNAME', 'SHELL', 'LANG', 'LC_ALL'])
  const childEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => CHILD_ENV_ALLOWLIST.has(k))
  ) as NodeJS.ProcessEnv

  const id = crypto.randomUUID()
  createPipeline(id)
  // Fire and forget — pipeline runs independently of this HTTP connection
  executePipeline(id, requirement, full, childEnv).catch((err) => {
    emitEvent(id, { type: 'error', message: String(err) })
    emitEvent(id, { type: 'pipeline_done', success: false })
  })

  return NextResponse.json({ id })
}

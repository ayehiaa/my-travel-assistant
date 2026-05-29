import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'

type PhaseId =
  | 'specify' | 'plan' | 'tasks'
  | 'backend' | 'frontend'
  | 'quality'

type SSEEvent =
  | { type: 'phase_start'; phase: PhaseId }
  | { type: 'phase_done'; phase: PhaseId }
  | { type: 'text_delta'; phase: PhaseId; text: string }
  | { type: 'error'; message: string }
  | { type: 'pipeline_done'; success: boolean }

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function streamPhase(
  phase: PhaseId,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  send: (data: SSEEvent) => void,
): Promise<void> {
  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      send({ type: 'text_delta', phase, text: event.delta.text })
    }
  }
  await stream.finalMessage()
}

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).single()
  if (!roleRecord || roleRecord.role !== 'premium_plus') return new Response('Forbidden', { status: 403 })

  const BodySchema = z.object({
    requirement: z.string().min(5).max(500),
    full: z.boolean().optional().default(false),
  })
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const requirement = parsed.data.requirement
    .replace(/^\/build-feature\s+/i, '')
    .replace(/\s+autonomously\s*$/i, '')
    .trim()
  if (requirement.length < 5) {
    return NextResponse.json({ error: 'Requirement must be at least 5 characters after stripping commands' }, { status: 400 })
  }
  const full = parsed.data.full

  await logAudit({ performedBy: user.id, action: 'run_triggered', tripId: null, changedFields: { requirement: { before: null, after: requirement } } })

  const enc = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: SSEEvent) => {
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
        const HAIKU = 'claude-haiku-4-5-20251001'
        const SONNET = 'claude-sonnet-4-6'

        try {
          send({ type: 'phase_start', phase: 'specify' })
          send({ type: 'phase_start', phase: 'plan' })
          send({ type: 'phase_start', phase: 'tasks' })
          await streamPhase(
            'tasks',
            'You are a software architect. For the given requirement produce: 1) One-paragraph feature summary. 2) Backend — bullet list of API routes/files to create with what each does. 3) Frontend — bullet list of components/pages to create with what each does. Be concise and concrete.',
            `Requirement: ${requirement}`,
            HAIKU,
            800,
            send,
          )
          send({ type: 'phase_done', phase: 'specify' })
          send({ type: 'phase_done', phase: 'plan' })
          send({ type: 'phase_done', phase: 'tasks' })
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
          send({ type: 'pipeline_done', success: false })
          return
        }

        try {
          send({ type: 'phase_start', phase: 'backend' })
          await streamPhase(
            'backend',
            'You are a senior backend developer. Given a requirement, write the key TypeScript implementation: Next.js App Router API route handler with Zod validation, Supabase query, and audit log call. Output code directly.',
            `Requirement: ${requirement}`,
            SONNET,
            1500,
            send,
          )
          send({ type: 'phase_done', phase: 'backend' })
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
          send({ type: 'pipeline_done', success: false })
          return
        }

        try {
          send({ type: 'phase_start', phase: 'frontend' })
          await streamPhase(
            'frontend',
            'You are a senior frontend developer. Given a requirement, write the key TypeScript React component: use Tailwind CSS, follow Next.js App Router with React 19 patterns. Output code directly.',
            `Requirement: ${requirement}`,
            SONNET,
            1500,
            send,
          )
          send({ type: 'phase_done', phase: 'frontend' })
        } catch (err) {
          send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
          send({ type: 'pipeline_done', success: false })
          return
        }

        if (full) {
          try {
            send({ type: 'phase_start', phase: 'quality' })
            await streamPhase(
              'quality',
              'You are a security engineer and test lead. Review the requirement and produce: 1) Security checklist (auth gates, input validation, XSS, SQL injection, PII). 2) Vitest test stubs for pure functions. 3) Suggested PR title and summary.',
              `Requirement: ${requirement}`,
              SONNET,
              1200,
              send,
            )
            send({ type: 'phase_done', phase: 'quality' })
          } catch (err) {
            send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
            send({ type: 'pipeline_done', success: false })
            return
          }
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

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPipeline, subscribe, type PipelineEvent } from '@/lib/pipelineStore'

export async function GET(req: NextRequest): Promise<Response> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400 })

  const pipeline = getPipeline(id)
  if (!pipeline) return new Response('Pipeline not found', { status: 404 })

  const enc = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      let unsubscribe: () => void = () => {}
      const hb: { id?: ReturnType<typeof setInterval> } = {}

      const send = (event: PipelineEvent) => {
        if (closed) return
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`)) }
        catch { closed = true }
      }

      const finish = () => {
        clearInterval(hb.id)
        unsubscribe()
        if (!closed) { closed = true; controller.close() }
      }

      // Replay all events buffered so far (handles reconnects correctly)
      for (const event of pipeline.events) {
        send(event)
      }

      if (pipeline.done) {
        finish()
        return
      }

      unsubscribe = subscribe(id, (event) => {
        send(event)
        if (event.type === 'pipeline_done') finish()
      })

      hb.id = setInterval(() => {
        if (closed) { finish(); return }
        try { controller.enqueue(enc.encode(': ping\n\n')) }
        catch { finish() }
      }, 15_000)
    },
    cancel() {
      // Client disconnected — pipeline keeps running, store keeps buffering
    },
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

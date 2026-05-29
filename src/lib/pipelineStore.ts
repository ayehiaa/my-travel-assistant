export interface PipelineEvent {
  type: 'phase_start' | 'phase_done' | 'pipeline_done' | 'error'
  phase?: string
  success?: boolean
  message?: string
}

interface Pipeline {
  events: PipelineEvent[]
  done: boolean
  listeners: Set<(ev: PipelineEvent) => void>
}

const store = new Map<string, Pipeline>()

export function createPipeline(id: string): void {
  store.set(id, { events: [], done: false, listeners: new Set() })
}

export function getPipeline(id: string): Pipeline | undefined {
  return store.get(id)
}

export function emitEvent(id: string, event: PipelineEvent): void {
  const p = store.get(id)
  if (!p) return
  p.events.push(event)
  for (const fn of p.listeners) fn(event)
  if (event.type === 'pipeline_done') {
    p.done = true
    p.listeners.clear()
    // Clean up after 5 minutes so the map doesn't grow unbounded
    setTimeout(() => store.delete(id), 5 * 60_000)
  }
}

export function subscribe(id: string, fn: (ev: PipelineEvent) => void): () => void {
  const p = store.get(id)
  if (!p) return () => {}
  p.listeners.add(fn)
  return () => p.listeners.delete(fn)
}

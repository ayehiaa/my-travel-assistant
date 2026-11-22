'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import {
  OFFLINE_QUEUE_STORAGE_KEY, enqueue, queuedSetCount, readQueue, removeAcked, type QueueOp,
} from '@/lib/health/offlineQueue'

/**
 * Browser side of offline set logging (phase P3): the queue lives in this device's localStorage; it is posted to
 * /api/health/workouts/sync when the browser is online (on load, on the `online` event, or "Sync now").
 */

const CHANGE_EVENT = 'health-offline-queue'

export function loadQueue(): QueueOp[] {
  try { return readQueue(window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY)) } catch { return [] }
}

function saveQueue(q: QueueOp[]): void {
  try {
    if (q.length === 0) window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY)
    else window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(q))
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function queueOps(ops: QueueOp[]): void {
  let q = loadQueue()
  for (const op of ops) q = enqueue(q, op)
  saveQueue(q)
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function snapshot(): string {
  try { return `${navigator.onLine ? 1 : 0}|${window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY) ?? ''}` } catch { return '1|' }
}

/** Post the queue; drop acknowledged ops. Returns sessions saved / rejected, or null when it could not reach the server. */
export async function syncQueue(): Promise<{ saved: number; rejected: string[] } | null> {
  const q = loadQueue()
  if (q.length === 0) return { saved: 0, rejected: [] }
  try {
    const res = await fetch('/api/health/workouts/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: q }) })
    if (!res.ok) return null
    const data = (await res.json()) as { acked?: string[]; results?: Array<{ status: string; date: string; error?: string }> }
    saveQueue(removeAcked(loadQueue(), data.acked ?? []))
    const results = data.results ?? []
    return {
      saved: results.filter(r => r.status === 'saved').length,
      rejected: results.filter(r => r.status === 'rejected').map(r => `${r.date}: ${r.error ?? 'rejected'}`),
    }
  } catch {
    return null
  }
}

/** "Offline — n sets queued" indicator that syncs automatically when the device is back online. */
export function OfflineSyncBanner() {
  const toast = useToast()
  const router = useRouter()
  const snap = useSyncExternalStore(subscribe, snapshot, () => '1|')
  const online = snap.startsWith('1')
  const queue = useMemo(() => readQueue(snap.slice(2)), [snap])
  const [syncing, setSyncing] = useState(false)
  const busy = useRef(false)

  const run = useCallback(async (manual: boolean) => {
    if (busy.current || isOffline() || loadQueue().length === 0) return
    busy.current = true
    setSyncing(true)
    const r = await syncQueue()
    busy.current = false
    setSyncing(false)
    if (!r) { if (manual) toast('Could not sync yet — your sets stay on this device', 'error'); return }
    if (r.saved > 0) { toast(`Synced ${r.saved} session${r.saved === 1 ? '' : 's'} logged offline`, 'success'); router.refresh() }
    for (const msg of r.rejected) toast(`Not synced (${msg})`, 'error')
  }, [router, toast])

  useEffect(() => {
    if (online) void run(false)
  }, [online, run])

  const count = queuedSetCount(queue)
  const pending = queue.length
  if (online && pending === 0) return null
  return (
    <div role="status" className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${online ? 'bg-blue-50 text-blue-900' : 'bg-amber-50 text-amber-900'}`}>
      <span className="font-semibold">{online ? (syncing ? 'Syncing…' : 'Waiting to sync') : 'Offline'}</span>
      <span>— {count} set{count === 1 ? '' : 's'} queued on this device</span>
      {online && !syncing && <button type="button" className="font-bold underline" onClick={() => run(true)}>Sync now</button>}
    </div>
  )
}

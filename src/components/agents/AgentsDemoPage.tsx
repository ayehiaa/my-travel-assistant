'use client'

import { useState, useRef, useCallback } from 'react'

type PhaseId =
  | 'specify' | 'plan' | 'tasks'
  | 'backend' | 'frontend'
  | 'security' | 'tester' | 'pr'
type PhaseStatus = 'idle' | 'active' | 'done'

const PHASE_ORDER: PhaseId[] = [
  'specify', 'plan', 'tasks',
  'backend', 'frontend',
  'security', 'tester', 'pr',
]

const PHASE_META: Record<PhaseId, { label: string; statusLabel: string; icon: string }> = {
  specify:  { label: 'Specify',  statusLabel: 'Defining spec',     icon: '📄' },
  plan:     { label: 'Plan',     statusLabel: 'Drafting plan',      icon: '💡' },
  tasks:    { label: 'Architect', statusLabel: 'Planning & tasking', icon: '🏗️' },
  backend:  { label: 'Backend',  statusLabel: 'Writing API routes', icon: '🗄️' },
  frontend: { label: 'Frontend', statusLabel: 'Building UI',        icon: '🖼️' },
  security: { label: 'Security', statusLabel: 'Auditing security',  icon: '🛡️' },
  tester:   { label: 'Tester',   statusLabel: 'Running tests',      icon: '⚗️' },
  pr:       { label: 'Done',     statusLabel: 'Raising PR',         icon: '✅' },
}

const INITIAL_STATUS: Record<PhaseId, PhaseStatus> = {
  specify: 'idle', plan: 'idle', tasks: 'idle',
  backend: 'idle', frontend: 'idle',
  security: 'idle', tester: 'idle', pr: 'idle',
}

interface SSEEvent {
  type: 'phase_start' | 'phase_done' | 'pipeline_done' | 'error'
  phase?: PhaseId
  success?: boolean
  message?: string
}

function PipelineNode({ id, status }: { id: PhaseId; status: PhaseStatus }) {
  const meta = PHASE_META[id]
  const isActive = status === 'active'
  const isDone = status === 'done'
  const isIdle = status === 'idle'

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-500 w-full"
      style={{
        borderColor: isActive ? 'var(--blue-700)' : isDone ? 'var(--mint)' : 'var(--rule)',
        background: isActive ? 'var(--blue-50)' : isDone ? 'var(--mint-soft)' : 'var(--paper)',
        boxShadow: isActive ? '0 0 0 4px rgba(0,59,149,0.10)' : 'none',
        opacity: isIdle ? 0.55 : 1,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base transition-all duration-500"
        style={{
          background: isActive ? 'var(--blue-700)' : isDone ? 'var(--mint)' : 'var(--paper-3)',
        }}
      >
        {meta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: isIdle ? 'var(--ink-4)' : 'var(--ink)' }}>
          {meta.label}
        </div>
        {isActive && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--blue-700)' }}>
            {meta.statusLabel}…
          </div>
        )}
        {isDone && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--mint)' }}>
            Complete
          </div>
        )}
      </div>

      {isActive && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ background: 'var(--blue-700)' }}
          />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--blue-700)' }} />
        </span>
      )}
      {isDone && (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--mint)" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  )
}

function Connector() {
  return (
    <div className="flex justify-center">
      <div className="flex flex-col items-center gap-0.5 py-1">
        <div className="w-px h-4" style={{ background: 'var(--rule)' }} />
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M4 5L0 0h8L4 5z" fill="var(--rule)" />
        </svg>
      </div>
    </div>
  )
}

function ForkConnector() {
  return (
    <div className="relative" style={{ height: 40 }}>
      {/* vertical line from top center */}
      <div className="absolute left-1/2 top-0" style={{ width: 1, height: '50%', background: 'var(--rule)', transform: 'translateX(-50%)' }} />
      {/* horizontal bar */}
      <div className="absolute top-1/2" style={{ left: '25%', right: '25%', height: 1, background: 'var(--rule)' }} />
      {/* left drop */}
      <div className="absolute top-1/2 bottom-0" style={{ left: '25%', width: 1, background: 'var(--rule)', transform: 'translateX(-50%)' }} />
      {/* right drop */}
      <div className="absolute top-1/2 bottom-0" style={{ right: '25%', width: 1, background: 'var(--rule)', transform: 'translateX(50%)' }} />
      {/* arrow left */}
      <div className="absolute bottom-0" style={{ left: '25%', transform: 'translateX(-50%) translateY(0)' }}>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M4 5L0 0h8L4 5z" fill="var(--rule)" />
        </svg>
      </div>
      {/* arrow right */}
      <div className="absolute bottom-0" style={{ right: '25%', transform: 'translateX(50%) translateY(0)' }}>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M4 5L0 0h8L4 5z" fill="var(--rule)" />
        </svg>
      </div>
    </div>
  )
}

function MergeConnector() {
  return (
    <div className="relative" style={{ height: 40 }}>
      {/* left rise */}
      <div className="absolute top-0" style={{ left: '25%', width: 1, height: '50%', background: 'var(--rule)', transform: 'translateX(-50%)' }} />
      {/* right rise */}
      <div className="absolute top-0" style={{ right: '25%', width: 1, height: '50%', background: 'var(--rule)', transform: 'translateX(50%)' }} />
      {/* horizontal bar */}
      <div className="absolute top-1/2" style={{ left: '25%', right: '25%', height: 1, background: 'var(--rule)' }} />
      {/* vertical line to bottom center */}
      <div className="absolute left-1/2 top-1/2 bottom-0" style={{ width: 1, background: 'var(--rule)', transform: 'translateX(-50%)' }} />
      {/* arrow */}
      <div className="absolute bottom-0 left-1/2" style={{ transform: 'translateX(-50%) translateY(0)' }}>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M4 5L0 0h8L4 5z" fill="var(--rule)" />
        </svg>
      </div>
    </div>
  )
}

export default function AgentsDemoPage() {
  const [requirement, setRequirement] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [phaseStatus, setPhaseStatus] = useState<Record<PhaseId, PhaseStatus>>(INITIAL_STATUS)
  const [pipelineResult, setPipelineResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const handlePhaseStart = useCallback((phase: PhaseId) => {
    setPhaseStatus(prev => ({ ...prev, [phase]: 'active' }))
  }, [])

  const handlePhaseDone = useCallback((phase: PhaseId) => {
    setPhaseStatus(prev => ({ ...prev, [phase]: 'done' }))
  }, [])

  const handlePipelineDone = useCallback((success: boolean) => {
    setPhaseStatus(prev => {
      const next = { ...prev }
      for (const p of PHASE_ORDER) {
        if (next[p] === 'active') next[p] = 'done'
      }
      return next
    })
    setPipelineResult(success ? 'success' : 'error')
    setIsRunning(false)
  }, [])

  async function handleRun() {
    if (!requirement.trim() || isRunning) return

    setIsRunning(true)
    setPipelineResult(null)
    setErrorMsg(null)
    setPhaseStatus(INITIAL_STATUS)

    let response: Response
    try {
      response = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement }),
      })
    } catch (e) {
      setErrorMsg(`Network error: ${String(e)}`)
      setIsRunning(false)
      return
    }

    if (!response.ok) {
      setErrorMsg(`Error ${response.status}: ${await response.text()}`)
      setIsRunning(false)
      return
    }

    const reader = response.body!.getReader()
    readerRef.current = reader
    const decoder = new TextDecoder()
    let buf = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6)) as SSEEvent
            if (ev.type === 'phase_start' && ev.phase) handlePhaseStart(ev.phase)
            else if (ev.type === 'phase_done' && ev.phase) handlePhaseDone(ev.phase)
            else if (ev.type === 'pipeline_done') handlePipelineDone(ev.success ?? false)
            else if (ev.type === 'error') {
              setErrorMsg(ev.message ?? 'Unknown error')
              setIsRunning(false)
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch { /* stream closed by server or user navigated away */ }
    finally {
      setIsRunning(false)
    }
  }

  function handleStop() {
    readerRef.current?.cancel()
    readerRef.current = null
    setIsRunning(false)
  }

  const canRun = requirement.trim().length >= 5 && !isRunning

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper-2)' }}>
      {/* Header */}
      <div style={{ background: 'var(--blue-900)' }} className="px-6 py-10 text-white text-center">
        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest"
          style={{ background: 'rgba(255,180,0,0.15)', color: 'var(--yellow)', border: '1px solid rgba(255,180,0,0.3)' }}>
          ⚡ Premium
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-bricolage)' }}>
          Agent Pipeline Demo
        </h1>
        <p className="mt-2 text-white/70 text-sm max-w-sm mx-auto">
          Type a one-liner requirement and watch Claude&apos;s agents build it in real time — spec to tested code.
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Input card */}
        <div className="rounded-2xl p-6 shadow-sm" style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
            What should we build?
          </label>
          <p className="text-xs mb-2" style={{ color: 'var(--ink-4)' }}>
            Describe the feature in plain English — no commands needed.
          </p>
          <textarea
            rows={3}
            value={requirement}
            onChange={e => setRequirement(e.target.value)}
            disabled={isRunning}
            placeholder="e.g. Add an export to CSV button for all past trips"
            className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none disabled:opacity-60"
            style={{
              background: 'var(--paper-2)',
              border: '1px solid var(--rule)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-jakarta)',
            }}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs" style={{ color: 'var(--ink-4)' }}>
              {requirement.length}/500
            </span>
            <div className="flex gap-2">
              {isRunning && (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}
                >
                  Stop
                </button>
              )}
              <button
                onClick={handleRun}
                disabled={!canRun}
                className="px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: canRun ? 'var(--blue-700)' : 'var(--ink-4)',
                  color: 'white',
                }}
              >
                {isRunning ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Running…
                  </span>
                ) : '▶ Run Pipeline'}
              </button>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--coral-soft)', color: 'var(--coral)', border: '1px solid var(--coral)' }}>
            {errorMsg}
          </div>
        )}

        {/* Pipeline result banners */}
        {pipelineResult === 'success' && (
          <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: 'var(--mint-soft)', color: 'var(--mint)', border: '1px solid var(--mint)' }}>
            ✅ Pipeline complete — code committed to branch, PR ready.
          </div>
        )}
        {pipelineResult === 'error' && !errorMsg && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--coral-soft)', color: 'var(--coral)', border: '1px solid var(--coral)' }}>
            Pipeline exited with an error. Check that the requirement is a plain description (no slash commands), then try again.
          </div>
        )}

        {/* Pipeline diagram */}
        <div className="rounded-2xl p-6 shadow-sm" style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: 'var(--ink-4)' }}>
            Pipeline
          </div>

          {/* Sequential phases: Specify → Plan → Tasks */}
          {(['specify', 'plan', 'tasks'] as PhaseId[]).map((id, i, arr) => (
            <div key={id}>
              <PipelineNode id={id} status={phaseStatus[id]} />
              {i < arr.length - 1 && <Connector />}
            </div>
          ))}

          {/* Fork to parallel */}
          <ForkConnector />

          {/* Parallel: Backend + Frontend */}
          <div className="grid grid-cols-2 gap-3">
            <PipelineNode id="backend"  status={phaseStatus.backend}  />
            <PipelineNode id="frontend" status={phaseStatus.frontend} />
          </div>

          {/* Merge from parallel */}
          <MergeConnector />

          {/* Security → Tester */}
          <PipelineNode id="security" status={phaseStatus.security} />
          <Connector />
          <PipelineNode id="tester" status={phaseStatus.tester} />
          <Connector />

          {/* PR / Done */}
          <PipelineNode id="pr" status={phaseStatus.pr} />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 text-xs" style={{ color: 'var(--ink-4)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--rule)' }} /> Waiting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--blue-700)' }} /> Active
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--mint)' }} /> Complete
          </span>
        </div>
      </div>
    </div>
  )
}

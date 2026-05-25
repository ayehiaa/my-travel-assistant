'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/context/ToastContext'

interface Props {
  lastRunAt: string | null
  onRunStarted: (runId: string) => void
}

export default function RunTrigger({ lastRunAt, onRunStarted }: Props) {
  const toast = useToast()

  const cooldownEnd = lastRunAt ? new Date(lastRunAt).getTime() + 86400000 : 0

  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000))
  )
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)))
    }, 1000)
    return () => clearInterval(interval)
  }, [cooldownEnd])

  async function handleRun() {
    setRunning(true)
    try {
      const res = await fetch('/api/portfolio/run', { method: 'POST' })
      const data = await res.json()

      if (res.status === 202) {
        onRunStarted(data.run_id)
      } else if (res.status === 400) {
        toast(data.error ?? 'Cannot start run', 'error')
      } else if (res.status === 429) {
        setSecondsLeft(data.retry_after_seconds)
      } else {
        toast('Failed to start run', 'error')
      }
    } catch {
      toast('Failed to start run', 'error')
    } finally {
      setRunning(false)
    }
  }

  const h = Math.floor(secondsLeft / 3600)
  const m = Math.floor((secondsLeft % 3600) / 60)

  const isCoolingDown = secondsLeft > 0
  const isDisabled = isCoolingDown || running

  return (
    <button
      onClick={handleRun}
      disabled={isDisabled}
      style={{
        padding: '12px 24px',
        borderRadius: 'var(--r)',
        fontSize: 14,
        fontWeight: 700,
        border: 'none',
        background: isDisabled ? 'var(--rule)' : 'var(--blue-700)',
        color: isDisabled ? 'var(--ink-4)' : 'white',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--sans)',
        transition: 'background .12s',
        minWidth: 180,
      }}
    >
      {running
        ? 'Starting…'
        : isCoolingDown
          ? `Available in ${h}h ${m}m`
          : 'Run Analysis'}
    </button>
  )
}

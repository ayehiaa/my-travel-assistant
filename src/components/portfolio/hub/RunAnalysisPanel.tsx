'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RunTrigger from '../RunTrigger'
import RunProgress from '../RunProgress'

interface Props {
  lastRunAt: string | null
  /** A run already in progress when the tab rendered (keeps showing its progress after navigation). */
  initialRunId?: string | null
}

/** "Run analysis now" (secondary) with inline agent progress; refreshes the tab when the run completes. */
export default function RunAnalysisPanel({ lastRunAt, initialRunId = null }: Props) {
  const router = useRouter()
  const [runId, setRunId] = useState<string | null>(initialRunId)

  return (
    <div>
      <RunTrigger lastRunAt={lastRunAt} onRunStarted={id => setRunId(id)} variant="secondary" label="Run analysis now" />
      {runId && (
        <div className="mt-4">
          <RunProgress runId={runId} onComplete={() => router.refresh()} />
        </div>
      )}
    </div>
  )
}

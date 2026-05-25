'use client'

import { useState } from 'react'
import RunTrigger from './RunTrigger'
import RunProgress from './RunProgress'

interface Props {
  lastRunAt: string | null
}

export default function RunPageClient({ lastRunAt }: Props) {
  const [runId, setRunId] = useState<string | null>(null)

  return (
    <>
      <RunTrigger lastRunAt={lastRunAt} onRunStarted={(id) => setRunId(id)} />
      {runId && (
        <div style={{ marginTop: 32 }}>
          <RunProgress runId={runId} />
        </div>
      )}
    </>
  )
}

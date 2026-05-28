'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/context/ToastContext'

interface AgentStatus {
  agent_name: string
  status: string
  completed_at: string | null
}

interface Props {
  runId: string
}

const AGENT_NAMES: Record<string, string> = {
  macroeconomics: 'Macroeconomics',
  fed_rates: 'Fed & Rates',
  geopolitics: 'Geopolitics',
  sentiment: 'Sentiment / News',
  fundamentals: 'Fundamentals',
  technical_analysis: 'Technical Analysis',
  sector_analysis: 'Sector Analysis',
}

function getStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'pending':
      return {
        background: '#f3f4f6',
        color: '#6b7280',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }
    case 'running':
      return {
        background: '#dbeafe',
        color: '#1d4ed8',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }
    case 'complete':
      return {
        background: '#dcfce7',
        color: '#15803d',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }
    case 'error':
      return {
        background: '#fee2e2',
        color: '#dc2626',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }
    default:
      return {
        background: '#f3f4f6',
        color: '#6b7280',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }
  }
}

export default function RunProgress({ runId }: Props) {
  const toast = useToast()
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [overallStatus, setOverallStatus] = useState<string>('running')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch(`/api/portfolio/run/${runId}/progress`)
        if (!res.ok) {
          toast('Failed to fetch run progress', 'error')
          return
        }
        const data = await res.json()
        setAgents(data.agents)
        setOverallStatus(data.status)

        if (data.status === 'complete' || data.status === 'error') {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch {
        toast('Failed to fetch run progress', 'error')
      }
    }

    fetchProgress()
    intervalRef.current = setInterval(fetchProgress, 3000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [runId]) // eslint-disable-line react-hooks/exhaustive-deps

  const agentKeys = Object.keys(AGENT_NAMES)

  return (
    <div>
      <h2
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 700,
          fontSize: 20,
          marginBottom: 16,
          color: 'var(--ink)',
        }}
      >
        Agent Progress
      </h2>

      <div
        style={{
          background: 'white',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--rule)',
          padding: '0 24px',
        }}
      >
        {agentKeys.map((key, i) => {
          const agent = agents.find(a => a.agent_name === key)
          const status = agent?.status ?? 'pending'
          const isLast = i === agentKeys.length - 1

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: isLast ? 'none' : '1px solid var(--rule)',
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                  fontWeight: 500,
                }}
              >
                {AGENT_NAMES[key]}
              </span>
              <span style={getStatusStyle(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          )
        })}
      </div>

      {overallStatus === 'complete' && (
        <div
          style={{
            marginTop: 24,
            padding: '16px 20px',
            background: '#dcfce7',
            borderRadius: 10,
            color: '#15803d',
          }}
        >
          <strong>Analysis complete</strong>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#166534' }}>
            Your recommendation is ready.{' '}
            <a
              href={`/portfolio/recommendations/${runId}`}
              style={{ color: '#15803d', fontWeight: 600 }}
            >
              View full recommendation →
            </a>
          </p>
        </div>
      )}

      {overallStatus === 'error' && (
        <div
          style={{
            marginTop: 24,
            padding: '16px 20px',
            background: '#fee2e2',
            borderRadius: 10,
            color: '#dc2626',
          }}
        >
          <strong>Run failed</strong> — one or more agents encountered an error.
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#991b1b' }}>
            Please try running the analysis again.
          </p>
        </div>
      )}
    </div>
  )
}

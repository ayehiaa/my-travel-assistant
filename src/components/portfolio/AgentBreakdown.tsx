import { AgentOutput } from '@/types/database'

interface Props {
  agentOutputs: Record<string, AgentOutput>
}

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  macroeconomics: 'Macroeconomics',
  fed_rates: 'Fed & Interest Rates',
  geopolitics: 'Geopolitics',
  sentiment: 'Sentiment / News',
  fundamentals: 'Fundamentals & Earnings',
  technical_analysis: 'Technical Analysis',
  sector_analysis: 'Sector Analysis',
}

const STANCE_STYLES: Record<string, React.CSSProperties> = {
  bullish: {
    background: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  bearish: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  neutral: {
    background: '#f3f4f6',
    color: '#6b7280',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
}

const CONFIDENCE_STYLES: Record<string, React.CSSProperties> = {
  low: {
    background: '#fef9c3',
    color: '#ca8a04',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  medium: {
    background: '#dbeafe',
    color: '#2563eb',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  high: {
    background: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
}

export default function AgentBreakdown({ agentOutputs }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.keys(AGENT_DISPLAY_NAMES).map(agentKey => {
        const displayName = AGENT_DISPLAY_NAMES[agentKey]
        const output = agentOutputs[agentKey]

        return (
          <details
            key={agentKey}
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 8,
              fontFamily: 'var(--sans)',
            }}
          >
            <summary
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                listStyle: 'none',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              <span style={{ flex: 1 }}>{displayName}</span>
              {output ? (
                <>
                  <span style={STANCE_STYLES[output.stance] ?? STANCE_STYLES.neutral}>
                    {output.stance.charAt(0).toUpperCase() + output.stance.slice(1)}
                  </span>
                  <span style={CONFIDENCE_STYLES[output.confidence] ?? CONFIDENCE_STYLES.medium}>
                    {output.confidence.charAt(0).toUpperCase() + output.confidence.slice(1)} confidence
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
                  no data
                </span>
              )}
            </summary>
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--rule)',
                background: 'var(--paper-2)',
              }}
            >
              {output ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  {output.analysis}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>
                  (no data)
                </p>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

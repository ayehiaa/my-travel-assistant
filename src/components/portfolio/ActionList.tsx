import { ActionItem } from '@/types/database'
import { formatUsd } from '@/lib/portfolioCalculator'

interface Props {
  actionList: ActionItem[]
}

const ACTION_CHIP_STYLES: Record<
  'buy' | 'sell' | 'hold',
  React.CSSProperties
> = {
  buy: {
    background: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  sell: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  hold: {
    background: '#f3f4f6',
    color: '#6b7280',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
}

function deltaColor(delta: number): string {
  if (delta > 0) return '#16a34a'
  if (delta < 0) return '#dc2626'
  return 'var(--ink)'
}

export default function ActionList({ actionList }: Props) {
  if (actionList.length === 0) {
    return <p style={{ color: 'var(--ink-3)', fontSize: 14, fontFamily: 'var(--sans)' }}>No actions</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          fontFamily: 'var(--sans)',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '2px solid var(--rule)', textAlign: 'left' }}>
            {['Ticker', 'Action', 'Current %', 'Target %', 'Current $', 'Target $', 'Delta $'].map(col => (
              <th
                key={col}
                style={{
                  padding: '8px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actionList.map(item => (
            <tr key={item.ticker} style={{ borderBottom: '1px solid var(--rule)' }}>
              <td style={{ padding: '12px 12px' }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--ink)',
                  }}
                >
                  {item.ticker}
                </span>
              </td>
              <td style={{ padding: '12px 12px' }}>
                <span style={ACTION_CHIP_STYLES[item.action]}>
                  {item.action.toUpperCase()}
                </span>
              </td>
              <td
                style={{
                  padding: '12px 12px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-2)',
                }}
              >
                {item.current_pct.toFixed(2)}%
              </td>
              <td
                style={{
                  padding: '12px 12px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-2)',
                }}
              >
                {item.target_pct.toFixed(2)}%
              </td>
              <td
                style={{
                  padding: '12px 12px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink)',
                }}
              >
                {formatUsd(item.current_usd)}
              </td>
              <td
                style={{
                  padding: '12px 12px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink)',
                }}
              >
                {formatUsd(item.target_usd)}
              </td>
              <td
                style={{
                  padding: '12px 12px',
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  color: deltaColor(item.delta_usd),
                }}
              >
                {formatUsd(item.delta_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

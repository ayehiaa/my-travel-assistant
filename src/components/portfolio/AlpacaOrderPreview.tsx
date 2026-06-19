interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell' | 'hold'
  qty: number
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}

interface Props {
  preview: OrderPreviewItem[]
}

const ACTION_CHIP_STYLES: Record<'buy' | 'sell' | 'hold', React.CSSProperties> = {
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

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export default function AlpacaOrderPreview({ preview }: Props) {
  const actionableItems = preview.filter(item => item.action !== 'hold')
  const hasActionable = actionableItems.some(item => !item.skipped)

  if (actionableItems.length === 0 || !hasActionable) {
    return (
      <p style={{ color: 'var(--ink-3)', fontSize: 14, fontFamily: 'var(--sans)', margin: '16px 0' }}>
        No actionable orders
      </p>
    )
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
            {['Ticker', 'Action', 'Qty', 'Ask Price', 'Est. Value'].map(col => (
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
          {actionableItems.map((item, idx) => (
            <tr
              key={`${item.ticker}-${idx}`}
              style={{
                borderBottom: '1px solid var(--rule)',
                opacity: item.skipped ? 0.4 : 1,
              }}
            >
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
                <span style={ACTION_CHIP_STYLES[item.action as 'buy' | 'sell']}>
                  {item.action.toUpperCase()}
                </span>
              </td>
              <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
                {item.skipped ? (
                  <span style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: 'var(--sans)' }}>
                    {item.skip_reason ?? 'Skipped'}
                  </span>
                ) : (
                  item.qty
                )}
              </td>
              <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
                {formatUsd(item.ask_price)}
              </td>
              <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                {item.skipped ? '—' : formatUsd(item.estimated_value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

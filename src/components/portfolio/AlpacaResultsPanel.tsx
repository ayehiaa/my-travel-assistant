import { AlpacaExecution, AlpacaOrderResult } from '@/types/database'

interface Props {
  execution: AlpacaExecution
}

const STATUS_CHIP_STYLES: Record<AlpacaOrderResult['status'], React.CSSProperties> = {
  submitted: {
    background: '#dcfce7',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  rejected: {
    background: '#fee2e2',
    color: '#dc2626',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  error: {
    background: '#fef3c7',
    color: '#d97706',
    padding: '2px 8px',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 12,
    display: 'inline-block',
    fontFamily: 'var(--sans)',
  },
  skipped: {
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

const STATUS_LABELS: Record<AlpacaOrderResult['status'], string> = {
  submitted: 'Submitted',
  rejected: 'Rejected',
  error: 'Error',
  skipped: 'Skipped',
}

const PAPER_BADGE_STYLE: React.CSSProperties = {
  background: '#dbeafe',
  color: '#1d4ed8',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--mono)',
  display: 'inline-block',
  marginLeft: 8,
}

export default function AlpacaResultsPanel({ execution }: Props) {
  const formattedDate = new Date(execution.executed_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--rule)',
        padding: '28px',
        marginTop: 16,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--ink)',
              margin: 0,
            }}
          >
            Execution Results
          </h3>
          {execution.is_paper && (
            <span style={PAPER_BADGE_STYLE}>PAPER</span>
          )}
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
          {formattedDate}
        </span>
      </div>

      {execution.orders.length === 0 ? (
        <p style={{ color: 'var(--ink-3)', fontSize: 14, fontFamily: 'var(--sans)' }}>
          No orders were submitted.
        </p>
      ) : (
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
                {['Ticker', 'Action', 'Qty', 'Status', 'Order ID'].map(col => (
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
              {execution.orders.map((order, idx) => (
                <>
                  <tr key={`${order.ticker}-${idx}`} style={{ borderBottom: order.error_message ? 'none' : '1px solid var(--rule)' }}>
                    <td style={{ padding: '12px 12px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontWeight: 700,
                          fontSize: 14,
                          color: 'var(--ink)',
                        }}
                      >
                        {order.ticker}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <span
                        style={{
                          background: order.action === 'buy' ? '#dcfce7' : '#fee2e2',
                          color: order.action === 'buy' ? '#16a34a' : '#dc2626',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                          fontSize: 12,
                          display: 'inline-block',
                          fontFamily: 'var(--sans)',
                        }}
                      >
                        {order.action.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
                      {order.qty}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <span style={STATUS_CHIP_STYLES[order.status]}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      {order.alpaca_order_id ? (
                        <span
                          title={order.alpaca_order_id}
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: 12,
                            color: 'var(--ink-2)',
                          }}
                        >
                          {order.alpaca_order_id.slice(0, 8)}...
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-4)' }}>—</span>
                      )}
                    </td>
                  </tr>
                  {order.error_message && (
                    <tr key={`${order.ticker}-${idx}-error`} style={{ borderBottom: '1px solid var(--rule)' }}>
                      <td
                        colSpan={5}
                        style={{
                          padding: '4px 12px 12px',
                          fontSize: 12,
                          color: 'var(--ink-3)',
                          fontStyle: 'italic',
                        }}
                      >
                        {order.error_message}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

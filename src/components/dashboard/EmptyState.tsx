export default function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      border: '2px dashed var(--rule)',
      borderRadius: 'var(--r-lg)',
      background: 'var(--paper)',
      padding: '48px 24px',
      textAlign: 'center',
      color: 'var(--ink-3)',
    }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{message}</p>
    </div>
  )
}

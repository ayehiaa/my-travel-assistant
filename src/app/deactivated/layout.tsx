export default function DeactivatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--paper-2)' }}
    >
      {children}
    </div>
  )
}

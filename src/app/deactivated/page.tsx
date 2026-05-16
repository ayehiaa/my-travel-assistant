export default function DeactivatedPage() {
  return (
    <div
      className="w-full max-w-md mx-4"
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--r-lg)',
        padding: '40px',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Logo lockup */}
      <div className="flex items-center gap-3 mb-8">
        <div
          style={{
            width: 40,
            height: 40,
            background: 'var(--yellow)',
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--blue-900)',
            fontWeight: 800,
            fontSize: 22,
            transform: 'rotate(-6deg)',
            flexShrink: 0,
          }}
        >
          S
        </div>
        <span
          className="font-bold text-2xl tracking-tight text-ink"
          style={{ fontFamily: 'var(--display)' }}
        >
          Sojourn
        </span>
      </div>

      {/* Heading */}
      <h1
        className="font-bold tracking-tight text-ink mb-4"
        style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.2 }}
      >
        Account deactivated
      </h1>

      {/* Body */}
      <p className="text-ink-2 leading-relaxed mb-8" style={{ fontSize: 15 }}>
        Your account is no longer active. If you receive a new invitation in
        the future, you can sign up again with the same email address.
      </p>

      {/* Footer */}
      <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>
        Questions? Contact your account administrator.
      </p>
    </div>
  )
}

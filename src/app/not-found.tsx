import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--display)', fontWeight: 700,
          fontSize: 'clamp(64px,12vw,120px)', letterSpacing: '-0.04em',
          color: 'var(--rule)', lineHeight: 1, marginBottom: 16,
        }}>
          404
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
          Page not found
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', margin: '0 0 28px' }}>
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <Link href="/" style={{
          display: 'inline-block',
          background: 'var(--yellow)', color: 'var(--blue-900)',
          borderRadius: 999, padding: '12px 28px',
          fontWeight: 700, fontSize: 15, textDecoration: 'none',
          fontFamily: 'var(--sans)',
        }}>
          Go home →
        </Link>
      </div>
    </div>
  )
}

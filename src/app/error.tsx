'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--display)', fontWeight: 700,
          fontSize: 'clamp(48px,8vw,80px)', letterSpacing: '-0.04em',
          color: 'var(--coral-soft)', lineHeight: 1, marginBottom: 16,
        }}>
          ⚠
        </div>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: 'var(--ink)', margin: '0 0 8px' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 15, color: 'var(--ink-3)', margin: '0 0 28px' }}>
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            background: 'var(--yellow)', color: 'var(--blue-900)',
            border: 'none', borderRadius: 999, padding: '12px 28px',
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          Try again →
        </button>
      </div>
    </div>
  )
}

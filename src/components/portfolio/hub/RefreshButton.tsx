'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

/** Re-renders the current hub tab from the server (fresh Alpaca data). */
export default function RefreshButton({ label = 'Refresh', busyLabel = 'Refreshing…', className = '' }: {
  label?: string
  busyLabel?: string
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className={`font-semibold underline disabled:no-underline disabled:opacity-60 ${className}`}
    >
      {pending ? busyLabel : label}
    </button>
  )
}

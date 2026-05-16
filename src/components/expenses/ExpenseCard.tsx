'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { ExpenseWithCategory } from '@/types/database'

interface Props {
  expense: ExpenseWithCategory
  canDelete: boolean
  canUnreclaim: boolean
  onEdit: (expense: ExpenseWithCategory) => void
  onDeleted: (id: string) => void
  onReclaimed: (expense: ExpenseWithCategory) => void
}

function fmtDate(isoDate: string) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ExpenseCard({ expense, canDelete, canUnreclaim, onEdit, onDeleted, onReclaimed }: Props) {
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [reclaiming, setReclaiming] = useState(false)

  async function handleOpenReceipt() {
    setReceiptLoading(true)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/receipt`)
      if (!res.ok) throw new Error('Failed to fetch receipt')
      const { signedUrl } = await res.json() as { signedUrl: string }
      window.open(signedUrl, '_blank')
    } catch {
      toast('Could not open receipt', 'error')
    } finally {
      setReceiptLoading(false)
    }
  }

  async function handleReclaim() {
    setReclaiming(true)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/reclaim`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Reclaim failed')
      const updated = await res.json() as ExpenseWithCategory
      onReclaimed(updated)
    } catch {
      toast('Failed to mark as reclaimed', 'error')
    } finally {
      setReclaiming(false)
    }
  }

  async function handleUnreclaim() {
    setReclaiming(true)
    try {
      const res = await fetch(`/api/expenses/${expense.id}/unreclaim`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Unreclaim failed')
      const updated = await res.json() as ExpenseWithCategory
      onReclaimed(updated)
    } catch {
      toast('Failed to undo reclaim', 'error')
    } finally {
      setReclaiming(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this expense?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/expenses/' + expense.id, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted(expense.id)
    } catch {
      toast('Failed to delete expense', 'error')
      setDeleting(false)
    }
  }

  return (
    <article style={{
      background: 'var(--paper)',
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--rule)',
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow .15s',
    }}>

      {/* Top row: title + amount */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            color: 'var(--ink)',
            fontFamily: 'var(--sans)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {expense.title}
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {fmtDate(expense.expense_date)}
          </span>
        </div>

        <span style={{
          fontFamily: 'var(--mono)',
          fontWeight: 700,
          fontSize: 16,
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {expense.amount.toLocaleString('en-GB', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} {expense.currency}
        </span>
      </div>

      {/* Badges row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Category badge */}
        <span style={{
          display: 'inline-block',
          padding: '3px 10px',
          borderRadius: 999,
          background: 'var(--paper-3)',
          color: 'var(--ink-2)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          {expense.category.name}
        </span>

        {/* Reclaim badge */}
        {expense.reclaimed ? (
          <>
            <span style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: 999,
              background: '#d1fae5',
              color: '#065f46',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
            }}>
              Reclaimed
            </span>
            {expense.reclaimed_at && (
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                Reclaimed on {new Date(expense.reclaimed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </>
        ) : (
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 999,
            background: 'var(--paper-2)',
            color: 'var(--ink-4)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}>
            Pending
          </span>
        )}

        {/* Receipt indicator */}
        {expense.receipt_name && (
          <button
            type="button"
            onClick={handleOpenReceipt}
            aria-label={`Open receipt: ${expense.receipt_name}`}
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              fontStyle: 'italic',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: receiptLoading ? 'not-allowed' : 'pointer',
              textDecoration: 'underline',
              fontFamily: 'var(--sans)',
              opacity: receiptLoading ? 0.5 : 1,
              pointerEvents: receiptLoading ? 'none' : 'auto',
            }}
          >
            {receiptLoading ? 'Opening…' : `📎 ${expense.receipt_name}`}
          </button>
        )}
      </div>

      {/* Notes */}
      {expense.notes && (
        <p style={{
          margin: 0,
          fontSize: 12,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
          borderTop: '1px dashed var(--rule)',
          paddingTop: 10,
        }}>
          {expense.notes}
        </p>
      )}

      {/* Action row */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 12,
        borderTop: '1px solid var(--rule-soft)',
        paddingTop: 10,
      }}>
        {!expense.reclaimed ? (
          <button
            onClick={handleReclaim}
            disabled={reclaiming}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--blue-700)',
              background: 'none',
              border: 'none',
              cursor: reclaiming ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--sans)',
              opacity: reclaiming ? 0.4 : 1,
            }}
          >
            Mark as reclaimed
          </button>
        ) : canUnreclaim ? (
          <button
            onClick={handleUnreclaim}
            disabled={reclaiming}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink-3)',
              background: 'none',
              border: 'none',
              cursor: reclaiming ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--sans)',
              opacity: reclaiming ? 0.4 : 1,
            }}
          >
            Undo reclaim
          </button>
        ) : null}

        <button
          onClick={() => onEdit(expense)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--blue-700)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
          }}
        >
          Edit
        </button>

        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--coral)',
              background: 'none',
              border: 'none',
              cursor: deleting ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--sans)',
              opacity: deleting ? 0.4 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </article>
  )
}

'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { ExpenseCategory, ExpenseWithCategory, TripWithUsers } from '@/types/database'

interface Props {
  categories: ExpenseCategory[]
  trips: TripWithUsers[]
  expenseToEdit: ExpenseWithCategory | null
  onClose: () => void
  onSaved: (expense: ExpenseWithCategory) => void
  defaultTripId?: string
}

function fmtTripDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--rule)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 600,
  background: 'white',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--sans)',
  outline: 'none',
  color: 'var(--ink)',
}

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--blue-700)'
    e.target.style.boxShadow = '0 0 0 3px var(--blue-100)'
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--rule)'
    e.target.style.boxShadow = 'none'
  },
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
}

// Inner component receives a stable `key` from the parent shell so that
// React fully remounts it whenever expenseToEdit changes identity.
// This avoids the anti-pattern of calling setState inside useEffect.
function AddExpenseForm(props: Props) {
  const { categories, trips, expenseToEdit, onClose, onSaved } = props
  const toast = useToast()

  const [title,       setTitle]       = useState(expenseToEdit?.title ?? '')
  const [amount,      setAmount]      = useState(expenseToEdit ? String(expenseToEdit.amount) : '')
  const [currency,    setCurrency]    = useState(expenseToEdit?.currency ?? 'GBP')
  const [categoryId,  setCategoryId]  = useState(expenseToEdit?.category_id ?? categories[0]?.id ?? '')
  const [expenseDate, setExpenseDate] = useState(expenseToEdit?.expense_date ?? '')
  const [tripId,      setTripId]      = useState(expenseToEdit?.trip_id ?? props.defaultTripId ?? '')
  const [notes,            setNotes]            = useState(expenseToEdit?.notes ?? '')
  const [saving,           setSaving]           = useState(false)
  const [receiptFile,      setReceiptFile]      = useState<File | null>(null)
  const [removeReceipt,    setRemoveReceipt]    = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  const parsedAmount = parseFloat(amount)
  const isValid =
    title.trim() !== '' &&
    !isNaN(parsedAmount) &&
    parsedAmount >= 0 &&
    currency.trim() !== '' &&
    categoryId !== '' &&
    expenseDate !== ''

  async function handleSave() {
    setSaving(true)
    try {
      const body = {
        title: title.trim(),
        amount: parsedAmount,
        currency: currency.trim(),
        category_id: categoryId,
        expense_date: expenseDate,
        trip_id: tripId || null,
        notes: notes.trim() || null,
      }

      const url = expenseToEdit
        ? `/api/expenses/${expenseToEdit.id}`
        : '/api/expenses'
      const method = expenseToEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save expense')
      }

      let saved: ExpenseWithCategory = await res.json()

      // Handle receipt changes
      if (removeReceipt && expenseToEdit?.receipt_name) {
        await fetch(`/api/expenses/${saved.id}/receipt`, { method: 'DELETE' })
      } else if (receiptFile) {
        setUploadingReceipt(true)
        const fd = new FormData()
        fd.append('file', receiptFile)
        const receiptRes = await fetch(`/api/expenses/${saved.id}/receipt`, { method: 'POST', body: fd })
        if (receiptRes.ok) {
          saved = await receiptRes.json()
        } else {
          toast('Expense saved but receipt upload failed.', 'error')
        }
        setUploadingReceipt(false)
      }

      onSaved(saved)
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save expense', 'error')
      setSaving(false)
    }
  }

  const isEditMode = !!expenseToEdit


  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,31,77,.55)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: 20,
        animation: 'modalIn .18s ease',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'white',
        borderRadius: 'var(--r-xl)',
        width: '100%',
        maxWidth: 560,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        animation: 'modalRise .22s ease',
      }}>

        {/* Header */}
        <div style={{
          position: 'relative',
          padding: '24px 28px 18px',
          background: 'linear-gradient(135deg, var(--lavender-soft) 0%, var(--paper) 100%)',
          borderBottom: '1px solid var(--rule)',
          flexShrink: 0,
        }}>
          <h3 style={{
            fontFamily: 'var(--display)',
            fontWeight: 700,
            fontSize: 24,
            margin: '0 0 4px',
            letterSpacing: '-0.01em',
          }}>
            {isEditMode ? 'Edit expense' : 'Add expense'}
          </h3>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>
            {isEditMode ? 'Update the details for this expense.' : 'Log a new expense to track your spending.'}
          </p>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'white',
              color: 'var(--ink-2)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 22,
              fontWeight: 600,
              border: '1px solid var(--rule)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{
          padding: '22px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          overflowY: 'auto',
        }}>

          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={title}
              maxLength={200}
              placeholder="e.g. Hotel — London Heathrow"
              style={inputStyle}
              onChange={e => setTitle(e.target.value)}
              {...focusHandlers}
            />
          </div>

          {/* Amount + Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                placeholder="0.00"
                style={inputStyle}
                onChange={e => setAmount(e.target.value)}
                {...focusHandlers}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Currency</label>
              <input
                type="text"
                value={currency}
                maxLength={10}
                placeholder="GBP"
                style={inputStyle}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                {...focusHandlers}
              />
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>e.g. GBP, USD, EUR</span>
            </div>
          </div>

          {/* Category + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Category</label>
              <select
                value={categoryId}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onChange={e => setCategoryId(e.target.value)}
                {...focusHandlers}
              >
                <option value="" disabled>Select category…</option>
                {[...categories]
                  .sort((a, b) => a.display_order - b.display_order)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                value={expenseDate}
                style={inputStyle}
                onChange={e => setExpenseDate(e.target.value)}
                {...focusHandlers}
              />
            </div>
          </div>

          {/* Trip (optional) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Trip (optional)</label>
            <select
              value={tripId}
              style={{ ...inputStyle, cursor: 'pointer' }}
              onChange={e => setTripId(e.target.value)}
              {...focusHandlers}
            >
              <option value="">No trip linked</option>
              {trips.map(trip => {
                const legs = trip.legs ?? []
                if (!legs.length) return null
                const firstLeg = legs[0]
                const lastLeg = legs[legs.length - 1]
                const route = `${firstLeg.from_airport} → ${lastLeg.to_airport}`
                const depDate = fmtTripDate(firstLeg.departure_at.split('T')[0])
                return (
                  <option key={trip.id} value={trip.id}>
                    {route} · {depDate}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Notes (optional) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              value={notes}
              rows={3}
              placeholder="Any additional details…"
              style={{
                ...inputStyle,
                resize: 'vertical',
                fontWeight: 400,
              }}
              onChange={e => setNotes(e.target.value)}
              onFocus={e => {
                e.target.style.borderColor = 'var(--blue-700)'
                e.target.style.boxShadow = '0 0 0 3px var(--blue-100)'
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--rule)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Receipt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Receipt</label>
            {expenseToEdit?.receipt_name && !removeReceipt ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>📎 {expenseToEdit.receipt_name}</span>
                <button
                  type="button"
                  onClick={() => { setRemoveReceipt(true); setReceiptFile(null) }}
                  style={{ fontSize: 12, color: 'var(--coral, #b8493d)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  style={{ fontSize: 13 }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)) {
                      toast('Invalid file type. JPG, PNG or PDF only.', 'error')
                      e.target.value = ''
                      return
                    }
                    if (f.size > 10 * 1024 * 1024) {
                      toast('File too large. Max 10 MB.', 'error')
                      e.target.value = ''
                      return
                    }
                    setReceiptFile(f)
                  }}
                />
                <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>JPG, PNG or PDF · max 10 MB</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '16px 28px',
          background: 'var(--paper-2)',
          borderTop: '1px solid var(--rule)',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '1.5px solid var(--rule)',
              borderRadius: 'var(--r)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink-2)',
              background: 'white',
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving || uploadingReceipt}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r)',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              background: isValid && !saving && !uploadingReceipt ? 'var(--blue-700)' : 'var(--rule)',
              color: isValid && !saving && !uploadingReceipt ? 'white' : 'var(--ink-4)',
              cursor: isValid && !saving && !uploadingReceipt ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--sans)',
              transition: 'background .12s',
            }}
          >
            {uploadingReceipt ? 'Uploading receipt…' : saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Exported shell: provides a stable `key` so React fully remounts AddExpenseForm
// whenever expenseToEdit identity changes, avoiding setState-in-effect anti-patterns.
export default function AddExpenseModal(props: Props) {
  return <AddExpenseForm key={`${props.expenseToEdit?.id ?? 'new'}-${props.defaultTripId ?? ''}`} {...props} />
}

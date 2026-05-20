'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExpenseWithCategory, ExpenseCategory, TripWithUsers, UserRole } from '@/types/database'
import { computeExpenseSummary } from '@/lib/expenseSummary'
import { buildExpenseCsv } from '@/lib/expenseCsv'
import ExpenseCard from './ExpenseCard'
import AddExpenseModal from './AddExpenseModal'
import ExpenseCategoryChart from './ExpenseCategoryChart'

interface Props {
  initialExpenses: ExpenseWithCategory[]
  categories: ExpenseCategory[]
  trips: TripWithUsers[]
  canDelete: boolean
  ownerRole: UserRole
  expenseCount: number
  initialTripId?: string
}

export default function ExpenseList({ initialExpenses, categories, trips, canDelete, ownerRole, expenseCount, initialTripId }: Props) {
  const router = useRouter()
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>(initialExpenses)
  const [showAddModal, setShowAddModal] = useState(!!initialTripId)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null)

  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'reclaimed'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const isAtLimit = ownerRole === 'main' && expenseCount >= 10
  const isNearLimit = ownerRole === 'main' && (expenseCount === 8 || expenseCount === 9) && !bannerDismissed

  const filteredExpenses = expenses.filter(e => {
    if (activeTab === 'pending' && e.reclaimed) return false
    if (activeTab === 'reclaimed' && !e.reclaimed) return false
    if (dateFrom && e.expense_date < dateFrom) return false
    if (dateTo && e.expense_date > dateTo) return false
    return true
  })

  const summary = computeExpenseSummary(filteredExpenses)

  function handleSaved(saved: ExpenseWithCategory) {
    if (editingExpense) {
      setExpenses(prev => prev.map(e => e.id === saved.id ? saved : e))
    } else {
      setExpenses(prev => [saved, ...prev])
    }
    setEditingExpense(null)
    setShowAddModal(false)
    router.refresh()
  }

  function handleDeleted(id: string) {
    setExpenses(prev => prev.filter(e => e.id !== id))
    router.refresh()
  }

  function handleEdit(expense: ExpenseWithCategory) {
    setEditingExpense(expense)
    setShowAddModal(false)
  }

  function handleCloseModal() {
    setShowAddModal(false)
    setEditingExpense(null)
  }

  function handleReclaimed(updated: ExpenseWithCategory) {
    setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))
  }

  function handleExportCsv() {
    const csv = buildExpenseCsv(filteredExpenses)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'expenses.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <ExpenseCategoryChart expenses={expenses} categories={categories} />

      {/* Near-limit warning banner */}
      {isNearLimit && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--yellow)',
          borderRadius: 'var(--r)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 13, color: 'var(--blue-900)', fontWeight: 500 }}>
            You have {expenseCount}/10 expenses. Upgrade to Premium for unlimited expenses.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--blue-900)', padding: '0 4px' }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Tabs + date filter + summary bar */}
      <div style={{ marginBottom: 16 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['all', 'pending', 'reclaimed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: activeTab === tab ? 'none' : '1.5px solid var(--rule)',
                background: activeTab === tab ? 'var(--blue-700)' : 'transparent',
                color: activeTab === tab ? 'white' : 'var(--ink-3)',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                textTransform: 'capitalize',
              }}
            >
              {tab === 'all' ? 'All' : tab === 'pending' ? 'Pending' : 'Reclaimed'}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ border: '1.5px solid var(--rule)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--ink)', background: 'white' }}
          />
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ border: '1.5px solid var(--rule)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontFamily: 'var(--sans)', color: 'var(--ink)', background: 'white' }}
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ fontSize: 12, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--sans)' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Summary bar */}
        {filteredExpenses.length > 0 && (
          <div style={{
            background: 'var(--paper-2)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--r)',
            padding: '12px 16px',
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            marginBottom: 12,
            fontSize: 12,
          }}>
            {Object.entries(summary).map(([currency, s]) => (
              <div key={currency} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 14 }}>
                  {s.total.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color: '#065f46' }}>
                    Reclaimed: {s.reclaimed.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ color: 'var(--ink-3)' }}>
                    Pending: {s.pending.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
            <button
              onClick={handleExportCsv}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                borderRadius: 'var(--r)',
                fontSize: 12,
                fontWeight: 700,
                border: '1.5px solid var(--rule)',
                background: 'white',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                alignSelf: 'center',
              }}
            >
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* List header */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <button
          onClick={() => { setEditingExpense(null); setShowAddModal(true) }}
          disabled={isAtLimit}
          title={isAtLimit ? 'Upgrade to Premium to add more expenses' : undefined}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'var(--blue-700)',
            color: 'white',
            cursor: isAtLimit ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
            opacity: isAtLimit ? 0.5 : 1,
          }}
        >
          + Add expense
        </button>
      </div>

      {/* Expense cards or empty state */}
      {filteredExpenses.length === 0 ? (
        <div style={{
          border: '2px dashed var(--rule)',
          borderRadius: 'var(--r-lg)',
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-3)', fontWeight: 500 }}>
            {expenses.length === 0 ? 'No expenses logged yet' : 'No expenses match the current filters'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {filteredExpenses.map(expense => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              canDelete={canDelete}
              canUnreclaim={canDelete}
              onEdit={handleEdit}
              onDeleted={handleDeleted}
              onReclaimed={handleReclaimed}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {(showAddModal || editingExpense !== null) && (
        <AddExpenseModal
          categories={categories}
          trips={trips}
          expenseToEdit={editingExpense}
          onClose={handleCloseModal}
          onSaved={handleSaved}
          defaultTripId={initialTripId}
        />
      )}
    </>
  )
}

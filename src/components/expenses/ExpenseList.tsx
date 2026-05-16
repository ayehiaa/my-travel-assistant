'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExpenseWithCategory, ExpenseCategory, TripWithUsers } from '@/types/database'
import ExpenseCard from './ExpenseCard'
import AddExpenseModal from './AddExpenseModal'

interface Props {
  initialExpenses: ExpenseWithCategory[]
  categories: ExpenseCategory[]
  trips: TripWithUsers[]
  canDelete: boolean
}

export default function ExpenseList({ initialExpenses, categories, trips, canDelete }: Props) {
  const router = useRouter()
  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>(initialExpenses)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null)

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

  return (
    <>
      {/* List header */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <button
          onClick={() => { setEditingExpense(null); setShowAddModal(true) }}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'var(--blue-700)',
            color: 'white',
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
          }}
        >
          + Add expense
        </button>
      </div>

      {/* Expense cards or empty state */}
      {expenses.length === 0 ? (
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
            No expenses logged yet
          </p>
          <button
            onClick={() => { setEditingExpense(null); setShowAddModal(true) }}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r)',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              background: 'var(--blue-700)',
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            + Add expense
          </button>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {expenses.map(expense => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              canDelete={canDelete}
              onEdit={handleEdit}
              onDeleted={handleDeleted}
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
        />
      )}
    </>
  )
}

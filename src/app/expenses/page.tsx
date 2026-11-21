import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ExpenseList from '@/components/expenses/ExpenseList'
import { ExpenseWithCategory, ExpenseCategory, TripWithUsers } from '@/types/database'
import { isAssistant, limitsFor } from '@/lib/access'
import { buildGbpRates, GbpRates } from '@/lib/currencyConverter'

export const metadata = { title: 'Expenses — Sojourn' }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ trip_id?: string }>
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { trip_id: initialTripId } = await searchParams

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  const [{ data: expenses }, { data: categories }, { data: rawTrips }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, category:expense_categories(name)')
      .eq('owner_id', activeMainAccountId)
      .order('expense_date', { ascending: false }),
    supabase
      .from('expense_categories')
      .select('*')
      .order('display_order', { ascending: true }),
    supabase
      .from('trips')
      .select('*, legs:trip_legs(*)')
      .eq('owner_id', activeMainAccountId)
      .order('leg_order', { referencedTable: 'trip_legs', ascending: true }),
  ])

  const rateMap: GbpRates = await buildGbpRates((expenses ?? []) as ExpenseWithCategory[])

  // Free plan limit (assistants follow the linked member's plan)
  const expenseLimit = limitsFor(user.access).maxExpenses
  const expenseCount = (expenses ?? []).length
  const canDelete = !isAssistant(user.access)

  return (
    <main className="max-w-[1280px] mx-auto px-7 py-10">
      <h1 style={{
        fontFamily: 'var(--display)',
        fontWeight: 700,
        fontSize: 'clamp(28px,4vw,42px)',
        letterSpacing: '-0.02em',
        color: 'var(--ink)',
        margin: '0 0 32px',
      }}>
        Expenses
      </h1>
      <ExpenseList
        initialExpenses={(expenses ?? []) as ExpenseWithCategory[]}
        categories={(categories ?? []) as ExpenseCategory[]}
        trips={(rawTrips ?? []) as TripWithUsers[]}
        canDelete={canDelete}
        expenseLimit={expenseLimit}
        expenseCount={expenseCount}
        initialTripId={initialTripId}
        rateMap={rateMap}
      />
    </main>
  )
}

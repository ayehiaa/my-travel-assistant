import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Dashboard — Travel Assistant',
}

export default async function DashboardPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">My Trips</h1>
        <Link
          href="/search"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Search flights
        </Link>
      </div>

      <p className="text-sm text-gray-500">
        Dashboard coming in Story 7. For now, use the nav to search for flights.
      </p>
    </div>
  )
}

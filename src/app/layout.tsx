import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId, getLinkedMainAccounts } from '@/lib/activeAccount'
import { UserProvider, UserContextValue } from '@/context/UserContext'
import { ToastProvider } from '@/context/ToastContext'
import Nav from '@/components/Nav'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Travel Assistant',
  description: 'Search and manage your trips',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()

  let contextValue: UserContextValue | null = null
  if (user) {
    const [activeMainAccountId, linkedMainAccounts] = await Promise.all([
      getActiveMainAccountId(user),
      user.role === 'assistant' ? getLinkedMainAccounts(user.id) : Promise.resolve([]),
    ])
    contextValue = { ...user, activeMainAccountId, linkedMainAccounts }
  }

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        {contextValue ? (
          <UserProvider user={contextValue}>
            <ToastProvider>
              <Nav />
              <main className="flex-1">{children}</main>
            </ToastProvider>
          </UserProvider>
        ) : (
          <main className="flex-1">{children}</main>
        )}
      </body>
    </html>
  )
}

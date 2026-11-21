import type { Metadata } from 'next'
// Self-hosted fonts (bundled from npm) — no network fetch at build time, unlike next/font/google
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId, getLinkedMainAccounts, activatePendingLinks } from '@/lib/activeAccount'
import { UserProvider, UserContextValue } from '@/context/UserContext'
import { ToastProvider } from '@/context/ToastContext'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Sojourn — Track your days abroad',
  description: 'The calmer way to plan flights and stay on the right side of the 90-day rule.',
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
      user.access.accountType === 'assistant' ? getLinkedMainAccounts(user.id) : Promise.resolve([]),
      user.access.accountType === 'assistant' ? activatePendingLinks(user.id) : Promise.resolve(),
    ])
    contextValue = { ...user, activeMainAccountId, linkedMainAccounts }
  }

  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-paper-2">
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

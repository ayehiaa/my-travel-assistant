import type { Metadata } from 'next'
import { Bricolage_Grotesque, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId, getLinkedMainAccounts, activatePendingLinks } from '@/lib/activeAccount'
import { UserProvider, UserContextValue } from '@/context/UserContext'
import { ToastProvider } from '@/context/ToastContext'
import Nav from '@/components/Nav'

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

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
      user.role === 'assistant' ? getLinkedMainAccounts(user.id) : Promise.resolve([]),
      user.role === 'assistant' ? activatePendingLinks(user.id) : Promise.resolve(),
    ])
    contextValue = { ...user, activeMainAccountId, linkedMainAccounts }
  }

  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${jakarta.variable} ${jetbrains.variable} h-full antialiased`}
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

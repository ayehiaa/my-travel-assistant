import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { getAuthUser } from '@/lib/auth'
import { UserProvider } from '@/context/UserContext'
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

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        {user ? (
          <UserProvider user={user}>
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

import { GMAIL_IMPORT_ENABLED } from '@/lib/features'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { limitsFor } from '@/lib/access'
import GmailReviewClient from './GmailReviewClient'

export const metadata = { title: 'Sojourn — Gmail Import' }

export default async function GmailReviewPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  // Gmail import is hidden for now (src/lib/features.ts) — send anyone who lands here back to the dashboard.
  if (!GMAIL_IMPORT_ENABLED) redirect('/')
  if (!limitsFor(user.access).gmailImport) redirect('/?error=gmail_premium_only')

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, marginBottom: 24 }}>
        Import flights from Gmail
      </h1>
      <GmailReviewClient />
    </main>
  )
}

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import GmailReviewClient from './GmailReviewClient'

export const metadata = { title: 'Sojourn — Gmail Import' }

export default async function GmailReviewPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'premium') redirect('/?error=gmail_premium_only')

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, marginBottom: 24 }}>
        Import flights from Gmail
      </h1>
      <GmailReviewClient />
    </main>
  )
}

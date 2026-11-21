import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { loadAdminUsers } from '@/lib/adminUsersServer'

// ── GET ───────────────────────────────────────────────────────────────────────
// All users with account type, plan, add-ons and Portfolio status. Admins only (APP_ADMIN_EMAILS).

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.access.isAdmin) return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  try {
    return NextResponse.json({ users: await loadAdminUsers() })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

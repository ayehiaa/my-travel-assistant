import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars. Run: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-user.mjs')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const EMAIL = process.env.SEED_EMAIL
const PASSWORD = process.env.SEED_PASSWORD
const DISPLAY_NAME = process.env.SEED_DISPLAY_NAME ?? 'Owner'

if (!EMAIL || !PASSWORD) {
  console.error('Missing required env vars: SEED_EMAIL and SEED_PASSWORD must be set')
  process.exit(1)
}

const { data: authData, error: authError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
})

if (authError && !authError.message.includes('already been registered')) {
  console.error('Auth error:', authError.message)
  process.exit(1)
}

const userId = authData?.user?.id

if (!userId) {
  const { data: list } = await admin.auth.admin.listUsers()
  const existing = list?.users?.find(u => u.email === EMAIL)
  if (!existing) {
    console.error('Could not find or create user')
    process.exit(1)
  }
  console.log('User already exists:', existing.id)

  const { error: roleError } = await admin
    .from('user_roles')
    .upsert({ user_id: existing.id, role: 'owner', display_name: DISPLAY_NAME })

  if (roleError) { console.error('Role error:', roleError.message); process.exit(1) }
  console.log('✓ Role set for existing user')
  process.exit(0)
}

console.log('✓ Created user:', userId)

const { error: roleError } = await admin
  .from('user_roles')
  .upsert({ user_id: userId, role: 'owner', display_name: DISPLAY_NAME })

if (roleError) { console.error('Role error:', roleError.message); process.exit(1) }

console.log('✓ Role set: owner')
console.log(`\nLogin: ${EMAIL}`)

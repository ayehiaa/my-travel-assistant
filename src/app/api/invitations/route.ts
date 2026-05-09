import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitationEmail, sendAssistantAddedEmail } from '@/lib/email'

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

const schema = z.object({
  email: z.string().email(),
  assistantName: z.string().min(1).max(100),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .single()

  if (roleRecord?.role !== 'main') {
    return NextResponse.json({ error: 'Only main accounts can invite assistants' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { email, assistantName } = parsed.data
  const mainName = roleRecord.display_name
  const admin = createAdminClient()

  // Look up existing account by email
  const { data: listData, error: listError } = await admin.auth.admin.listUsers()
  if (listError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const existingAuthUser = listData.users.find(u => u.email === email)

  if (existingAuthUser) {
    if (existingAuthUser.id === user.id) {
      return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 })
    }

    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('role, display_name')
      .eq('user_id', existingAuthUser.id)
      .single()

    if (existingRole?.role === 'main') {
      return NextResponse.json({
        error: 'This email is a primary account and cannot be invited as an assistant',
      }, { status: 400 })
    }

    // Existing assistant — check not already linked
    const { data: existing } = await supabase
      .from('account_links')
      .select('id')
      .eq('main_user_id', user.id)
      .eq('assistant_user_id', existingAuthUser.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This assistant is already linked to your account' }, { status: 409 })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + THREE_DAYS_MS)

    const { data: link, error: insertError } = await admin
      .from('account_links')
      .insert({
        main_user_id: user.id,
        assistant_user_id: existingAuthUser.id,
        created_by: user.id,
        status: 'pending',
        invited_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

    await sendAssistantAddedEmail({
      assistantEmail: email,
      assistantName: existingRole?.display_name ?? assistantName,
      mainName,
    })

    return NextResponse.json({
      id: link.id,
      assistantUserId: existingAuthUser.id,
      displayName: existingRole?.display_name ?? assistantName,
      createdAt: link.created_at,
      status: 'pending',
      expiresAt: expiresAt.toISOString(),
    }, { status: 201 })
  }

  // New user — create account, link, send invite email
  const { data: newUserData, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { display_name: assistantName },
  })

  if (createError || !newUserData.user) {
    return NextResponse.json({ error: 'Failed to create assistant account' }, { status: 500 })
  }

  const newUser = newUserData.user

  const { error: roleInsertError } = await admin
    .from('user_roles')
    .insert({ user_id: newUser.id, role: 'assistant', display_name: assistantName })

  if (roleInsertError) {
    await admin.auth.admin.deleteUser(newUser.id)
    return NextResponse.json({ error: 'Failed to set up assistant account' }, { status: 500 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + THREE_DAYS_MS)

  const { data: link, error: linkError } = await admin
    .from('account_links')
    .insert({
      main_user_id: user.id,
      assistant_user_id: newUser.id,
      created_by: user.id,
      status: 'pending',
      invited_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (linkError) {
    await admin.auth.admin.deleteUser(newUser.id)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { data: linkData, error: genError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/reset-password` },
  })

  if (genError || !linkData?.properties?.action_link) {
    return NextResponse.json({ error: 'Failed to generate invitation link' }, { status: 500 })
  }

  await sendInvitationEmail({
    assistantEmail: email,
    assistantName,
    mainName,
    resetLink: linkData.properties.action_link,
    expiresAt,
  })

  return NextResponse.json({
    id: link.id,
    assistantUserId: newUser.id,
    displayName: assistantName,
    createdAt: link.created_at,
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
  }, { status: 201 })
}

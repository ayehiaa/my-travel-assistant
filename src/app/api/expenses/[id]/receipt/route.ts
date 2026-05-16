import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/auditLogger'

const idSchema = z.string().uuid()
const ALLOWED_MIME_TYPES: string[] = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function sanitizeFilename(name: string): string {
  // Strip to basename (no path separators), then replace unsafe chars
  const base = name.replace(/.*[\\/]/, '')
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'receipt'
}

function verifyMagicBytes(buf: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buf.slice(0, 8))
  if (mimeType === 'image/jpeg') return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
  if (mimeType === 'image/png')  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  if (mimeType === 'application/pdf') return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  return false
}

// ── GET — Generate signed URL ─────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
  const { id } = await params

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select('receipt_url')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  if (!existing.receipt_url) {
    return NextResponse.json({ error: 'No receipt attached' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error: storageError } = await admin.storage
    .from('expense-receipts')
    .createSignedUrl(existing.receipt_url, 60)

  if (storageError || !data) {
    return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}

// ── POST — Upload receipt ─────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
  const { id } = await params

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select('receipt_url')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. JPG, PNG or PDF only.' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Max 10 MB.' },
      { status: 400 }
    )
  }

  const arrayBuffer = await file.arrayBuffer()

  if (!verifyMagicBytes(arrayBuffer, file.type)) {
    return NextResponse.json({ error: 'Invalid file type. JPG, PNG or PDF only.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Best-effort cleanup of any existing receipt
  if (existing.receipt_url) {
    await admin.storage.from('expense-receipts').remove([existing.receipt_url])
  }

  const safeName = sanitizeFilename(file.name)
  const storagePath = `${activeMainAccountId}/${id}/${safeName}`

  const { error: uploadError } = await admin.storage
    .from('expense-receipts')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload receipt' }, { status: 500 })
  }

  const { data: updatedExpense, error: updateError } = await supabase
    .from('expenses')
    .update({
      receipt_url:      storagePath,
      receipt_name:     safeName,
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select('*, category:expense_categories(name)')
    .single()

  if (updateError || !updatedExpense) {
    return NextResponse.json({ error: 'Failed to update expense record' }, { status: 500 })
  }

  await logAudit({
    performedBy:  user.id,
    action:       'expense_updated',
    tripId:       null,
    tripSnapshot: null,
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json(updatedExpense)
}

// ── DELETE — Remove receipt ───────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
  const { id } = await params

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('expenses')
    .select('receipt_url')
    .eq('id', id)
    .eq('owner_id', activeMainAccountId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  if (!existing.receipt_url) {
    return NextResponse.json({ error: 'No receipt attached' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { error: storageError } = await admin.storage
    .from('expense-receipts')
    .remove([existing.receipt_url])

  if (storageError) {
    return NextResponse.json({ error: 'Failed to remove receipt from storage' }, { status: 500 })
  }

  const { data: updatedExpense, error: updateError } = await supabase
    .from('expenses')
    .update({
      receipt_url:      null,
      receipt_name:     null,
      last_modified_by: user.id,
    })
    .eq('id', id)
    .select('*, category:expense_categories(name)')
    .single()

  if (updateError || !updatedExpense) {
    return NextResponse.json({ error: 'Failed to update expense record' }, { status: 500 })
  }

  await logAudit({
    performedBy:  user.id,
    action:       'expense_updated',
    tripId:       null,
    tripSnapshot: null,
    onBehalfOf:   user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return NextResponse.json(updatedExpense)
}

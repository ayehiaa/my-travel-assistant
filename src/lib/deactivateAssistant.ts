import { createAdminClient } from './supabase/admin'
import { logAudit } from './auditLogger'
import { sendDeactivationEmail } from './email'

export function buildDeactivatedEmail(currentEmail: string, timestamp: number): string {
  const atIndex = currentEmail.lastIndexOf('@')
  const local = currentEmail.slice(0, atIndex)
  const domain = currentEmail.slice(atIndex + 1)
  return `${local}+deactivated_${timestamp}@${domain}`
}

export async function deactivateAssistant(assistantUserId: string, performedBy: string): Promise<void> {
  const admin = createAdminClient()

  // a. Fetch current email from auth and display_name from user_roles
  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(assistantUserId)
  if (authError || !authUser.user) {
    throw new Error(`Failed to fetch auth user: ${authError?.message ?? 'user not found'}`)
  }
  const currentEmail = authUser.user.email
  if (!currentEmail) throw new Error('Auth user has no email — cannot deactivate')

  const { data: roleRecord } = await admin
    .from('user_roles')
    .select('display_name')
    .eq('user_id', assistantUserId)
    .single()

  const assistantName = roleRecord?.display_name ?? 'Assistant'

  // b. Send deactivation email — if it throws, log and continue
  try {
    await sendDeactivationEmail({ assistantEmail: currentEmail, assistantName })
  } catch {
    console.error('[deactivateAssistant] Failed to send deactivation email')
  }

  // c. Rename auth email to prevent future logins with the old address
  const { error: updateAuthError } = await admin.auth.admin.updateUserById(assistantUserId, {
    email: buildDeactivatedEmail(currentEmail, Date.now()),
  })
  if (updateAuthError) {
    throw new Error(`Failed to update auth email: ${updateAuthError.message}`)
  }

  // d. Set status = 'deactivated' on user_roles
  const { error: roleUpdateError } = await admin
    .from('user_roles')
    .update({ status: 'deactivated' })
    .eq('user_id', assistantUserId)
  if (roleUpdateError) {
    throw new Error(`Failed to update user_roles status: ${roleUpdateError.message}`)
  }

  // e. Audit log
  await logAudit({ performedBy, action: 'assistant_deactivated', tripId: null })
}

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { UserRoleRecord } from '@/types/database'
import AssistantsManager from '@/components/settings/AssistantsManager'
import ReferenceDateSettings from '@/components/settings/ReferenceDateSettings'

export const metadata = {
  title: 'Settings — Travel Assistant',
}

export default async function SettingsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (user.role !== 'main') redirect('/')

  const supabase = await createClient()

  const { data: links } = await supabase
    .from('account_links')
    .select('id, assistant_user_id, created_at')
    .eq('main_user_id', user.id)
    .order('created_at', { ascending: true })

  const assistantIds = (links ?? []).map(l => l.assistant_user_id)
  let nameMap = new Map<string, Pick<UserRoleRecord, 'display_name'>>()
  if (assistantIds.length > 0) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('user_id, display_name')
      .in('user_id', assistantIds)
    nameMap = new Map((roles ?? []).map(r => [r.user_id, { display_name: r.display_name }]))
  }

  const initial = (links ?? []).map(l => ({
    id: l.id,
    assistantUserId: l.assistant_user_id,
    displayName: nameMap.get(l.assistant_user_id)?.display_name ?? 'Unknown',
    createdAt: l.created_at,
  }))

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('reference_date')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage who can assist with your trips</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Linked assistants</h2>
        <p className="text-sm text-gray-500 mb-5">
          Assistants can view and manage trips on your behalf. Enter the email address of
          an assistant account to link it.
        </p>
        <AssistantsManager initial={initial} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">90-day calculation</h2>
        <p className="text-sm text-gray-500 mb-5">
          Set the end date of your annual window. The app will count days spent outside
          the UK in the 12 months leading up to this date.
        </p>
        <ReferenceDateSettings initialDate={roleRow?.reference_date ?? null} />
      </div>
    </div>
  )
}

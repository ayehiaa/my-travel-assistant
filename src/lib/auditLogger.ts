import { createAdminClient } from './supabase/admin'
import { AuditAction, Trip, TripLeg } from '@/types/database'

export async function logAudit(params: {
  performedBy: string
  action: AuditAction
  tripId: string | null
  tripSnapshot?: (Trip & { legs: TripLeg[] }) | null
  changedFields?: Record<string, { before: unknown; after: unknown }>
  onBehalfOf?: string
}) {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    performed_by:   params.performedBy,
    action:         params.action,
    trip_id:        params.tripId,
    trip_snapshot:  params.tripSnapshot,
    changed_fields: params.changedFields ?? null,
    on_behalf_of:   params.onBehalfOf ?? null,
  })
}

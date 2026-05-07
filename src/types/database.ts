export type UserRole = 'main' | 'assistant'

export type AuditAction = 'created' | 'updated' | 'deleted'

export interface UserRoleRecord {
  user_id: string
  role: UserRole
  display_name: string
  created_at: string
}

export interface AccountLink {
  id: string
  main_user_id: string
  assistant_user_id: string
  created_by: string
  created_at: string
}

export interface Trip {
  id: string
  owner_id: string
  source: 'search' | 'manual'
  departure_airport: string
  destination_airport: string
  outbound_airline: string | null
  outbound_flight_number: string | null
  outbound_departure_at: string
  outbound_arrival_at: string | null
  return_airline: string | null
  return_flight_number: string | null
  return_departure_at: string
  return_arrival_at: string | null
  days_outside_uk: number
  created_by: string
  last_modified_by: string
  created_at: string
  updated_at: string
}

export type TripInsert = Omit<Trip, 'id' | 'created_at' | 'updated_at'>

export interface AuditLogEntry {
  id: string
  performed_by: string
  on_behalf_of: string | null
  action: AuditAction
  trip_id: string | null
  trip_snapshot: Trip
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
  created_at: string
}

// Joined type used in the audit log UI — includes resolved user info
export interface AuditLogEntryWithUser extends AuditLogEntry {
  performer: Pick<UserRoleRecord, 'display_name' | 'role'>
}

// Joined type used in the dashboard — includes resolved creator/modifier names
export interface TripWithUsers extends Trip {
  creator: Pick<UserRoleRecord, 'display_name'>
  modifier: Pick<UserRoleRecord, 'display_name'>
}

export type UserRole = 'main' | 'assistant' | 'premium'

export type AuditAction = 'created' | 'updated' | 'deleted' | 'assistant_invited'

export interface UserRoleRecord {
  user_id: string
  role: UserRole
  display_name: string
  created_at: string
}

export type InvitationStatus = 'pending' | 'active' | 'expired'

export interface AccountLink {
  id: string
  main_user_id: string
  assistant_user_id: string
  created_by: string
  created_at: string
  status: InvitationStatus
  invited_at: string | null
  expires_at: string | null
}

export type CustomerInvitationStatus = 'pending' | 'accepted' | 'expired'

export interface CustomerInvitation {
  id: string
  invited_by: string
  email: string
  invited_name: string
  token: string
  status: CustomerInvitationStatus
  invited_at: string
  expires_at: string
}

export interface Trip {
  id: string
  owner_id: string
  source: 'search' | 'manual'
  trip_type: 'round_trip' | 'multi_city'
  days_outside_uk: number
  created_by: string
  last_modified_by: string
  created_at: string
  updated_at: string
}

export interface TripLeg {
  id: string
  trip_id: string
  leg_order: number
  from_airport: string
  to_airport: string
  airline: string | null
  flight_number: string | null
  departure_at: string
  arrival_at: string | null
  created_at: string
}

export type TripInsert = Omit<Trip, 'id' | 'created_at' | 'updated_at'>
export type TripLegInsert = Omit<TripLeg, 'id' | 'created_at'>

export interface AuditLogEntry {
  id: string
  performed_by: string
  on_behalf_of: string | null
  action: AuditAction
  trip_id: string | null
  trip_snapshot: Trip & { legs: TripLeg[] }
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
  created_at: string
}

// Joined type used in the audit log UI — includes resolved user info
export interface AuditLogEntryWithUser extends AuditLogEntry {
  performer: Pick<UserRoleRecord, 'display_name' | 'role'>
  on_behalf_of_user?: Pick<UserRoleRecord, 'display_name'>
}

// Joined type used in the dashboard — includes resolved creator/modifier names
export interface TripWithUsers extends Trip {
  creator: Pick<UserRoleRecord, 'display_name'>
  modifier: Pick<UserRoleRecord, 'display_name'>
  legs: TripLeg[]
}

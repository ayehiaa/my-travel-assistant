export type UserRole = 'main' | 'assistant' | 'premium' | 'premium_plus'

export type UserRoleStatus = 'active' | 'deactivated'

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'assistant_invited'
  | 'assistant_deactivated'
  | 'assistant_unlinked'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'expense_reclaimed'
  | 'expense_unreclaimed'

export interface UserRoleRecord {
  user_id: string
  role: UserRole
  display_name: string
  status: UserRoleStatus
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
  trip_type: 'round_trip' | 'multi_city' | 'one_way'
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

export interface ExpenseCategory {
  id: string
  name: string
  display_order: number
}

export interface Expense {
  id: string
  owner_id: string
  trip_id: string | null
  category_id: string
  title: string
  amount: number
  currency: string
  expense_date: string
  notes: string | null
  receipt_url: string | null
  receipt_name: string | null
  reclaimed: boolean
  reclaimed_at: string | null
  reclaimed_by: string | null
  reclaim_reference: string | null
  created_by: string
  last_modified_by: string
  created_at: string
  updated_at: string
}

export type ExpenseInsert = Omit<Expense, 'id' | 'created_at' | 'updated_at'>

export type ExpenseWithCategory = Expense & { category: Pick<ExpenseCategory, 'name'> }

export interface GoogleToken {
  id: string
  user_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  token_iv: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface GmailImportedMessage {
  id: string
  user_id: string
  gmail_message_id: string
  trip_id: string | null
  imported_at: string
}

export interface UserProfile {
  user_id: string
  portfolio_tos_accepted_at: string | null
  created_at: string
}

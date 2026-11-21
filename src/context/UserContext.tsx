'use client'

import { createContext, useContext, ReactNode } from 'react'
import type { Access } from '@/lib/access'

export interface LinkedAccount {
  id: string
  displayName: string
}

export interface UserContextValue {
  id: string
  email: string
  /** Account type, plan, add-ons, admin flag (specs/027-plans-addons-admin). */
  access: Access
  displayName: string
  activeMainAccountId: string
  linkedMainAccounts: LinkedAccount[]
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({
  user,
  children,
}: {
  user: UserContextValue
  children: ReactNode
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}

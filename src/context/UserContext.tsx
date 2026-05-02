'use client'

import { createContext, useContext, ReactNode } from 'react'
import { UserRole } from '@/types/database'

export interface UserContextValue {
  id: string
  email: string
  role: UserRole
  displayName: string
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

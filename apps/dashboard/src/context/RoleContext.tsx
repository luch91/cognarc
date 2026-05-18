import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

export type Role = 'overview' | 'engineer' | 'pm' | 'growth' | 'designer' | 'safety'

interface RoleContextValue {
  role: Role
  setRole: (r: Role) => void
}

const RoleContext = createContext<RoleContextValue>({ role: 'overview', setRole: () => {} })

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('overview')
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}

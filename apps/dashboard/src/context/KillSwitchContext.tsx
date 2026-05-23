import { createContext, useContext, useState, type ReactNode } from 'react'

interface KillSwitchAuditEntry {
  id: string
  action: string
  zone: 'ACT_GATED'
  outcome: string
  authorisedBy: string
  time: string
}

interface KillSwitchContextValue {
  active: boolean
  setActive: (v: boolean) => void
  banner: boolean
  setBanner: (v: boolean) => void
  extraEntries: KillSwitchAuditEntry[]
  prependEntry: (e: KillSwitchAuditEntry) => void
}

const KillSwitchContext = createContext<KillSwitchContextValue>({
  active: false,
  setActive: () => {},
  banner: false,
  setBanner: () => {},
  extraEntries: [],
  prependEntry: () => {},
})

export function KillSwitchProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [banner, setBanner] = useState(false)
  const [extraEntries, setExtraEntries] = useState<KillSwitchAuditEntry[]>([])

  function prependEntry(e: KillSwitchAuditEntry) {
    setExtraEntries((prev) => [e, ...prev])
  }

  return (
    <KillSwitchContext.Provider value={{ active, setActive, banner, setBanner, extraEntries, prependEntry }}>
      {children}
    </KillSwitchContext.Provider>
  )
}

export function useKillSwitch() {
  return useContext(KillSwitchContext)
}

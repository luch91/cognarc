import { createContext, useContext, useState, type ReactNode } from 'react'

interface KillSwitchContextValue {
  active: boolean
  setActive: (v: boolean) => void
  banner: boolean
  setBanner: (v: boolean) => void
}

const KillSwitchContext = createContext<KillSwitchContextValue>({
  active: false,
  setActive: () => {},
  banner: false,
  setBanner: () => {},
})

export function KillSwitchProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [banner, setBanner] = useState(false)

  return (
    <KillSwitchContext.Provider value={{ active, setActive, banner, setBanner }}>
      {children}
    </KillSwitchContext.Provider>
  )
}

export function useKillSwitch() {
  return useContext(KillSwitchContext)
}

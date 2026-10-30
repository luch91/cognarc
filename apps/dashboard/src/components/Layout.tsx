import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { KillSwitch } from './KillSwitch.js'
import { useAdminAuth } from '../context/AdminAuthContext.js'

export const NAV_ITEMS = [
  { to: '/', label: 'Workspace Overview' },
  { to: '/engineer', label: 'Engineer' },
  { to: '/pm', label: 'Product Manager' },
  { to: '/growth', label: 'Growth' },
  { to: '/designer', label: 'Designer' },
  { to: '/safety', label: 'Safety / Red Team' },
  { to: '/approvals', label: 'Act-Gated Approvals' },
  { to: '/settings', label: 'Settings' },
] as const

export function Layout() {
  const { workspace, user, signOut } = useAdminAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobilePanelRef = useRef<HTMLElement>(null)
  const location = useLocation()

  // Closed mobile navigation is removed from the DOM, never left focusable
  // behind an off-screen transform.
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const panel = mobilePanelRef.current
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { document.body.style.overflow = originalOverflow }
  }, [mobileOpen])

  function closeMenu() {
    setMobileOpen(false)
    menuButtonRef.current?.focus()
  }

  function trapMobileFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]'),
    )
    if (!focusable.length) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function navigation() {
    return <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto" aria-label="Primary navigation">
      {NAV_ITEMS.map(({ to, label }) => (
        <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            'flex items-center min-h-11 gap-2 px-3 py-2 rounded-lg text-sm transition-colors ' +
            (isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-gray-100')
          }>
          {label}
        </NavLink>
      ))}
    </nav>
  }

  function brand() {
    return <div className="px-4 py-4 border-b border-gray-100">
      <span className="text-lg font-bold text-gray-900 tracking-tight">CognArc</span>
      <span className="inline-block w-2 h-2 rounded-full bg-teal-500 ml-1" aria-hidden="true"/>
    </div>
  }

  return (
    <div className="flex min-h-screen h-[100dvh] bg-gray-50 overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:p-3 focus:bg-white focus:shadow-lg">
        Skip to main content
      </a>
      <aside className="hidden lg:flex w-60 flex-shrink-0 bg-white border-r border-gray-200 flex-col">
        {brand()}
        {navigation()}
      </aside>

      {mobileOpen && <>
        <button type="button" aria-label="Close navigation overlay"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMenu} />
        <aside ref={mobilePanelRef} id="mobile-navigation" role="dialog" aria-modal="true"
          aria-label="Mobile navigation" onKeyDown={trapMobileFocus}
          className="fixed inset-y-0 left-0 z-50 flex flex-col bg-white shadow-xl w-[min(19rem,85vw)] lg:hidden">
          <div className="flex items-center justify-between border-b border-gray-100">
            {brand()}
            <button type="button" onClick={closeMenu} aria-label="Close navigation"
              className="min-h-11 min-w-11 text-gray-700 text-xl font-semibold">×</button>
          </div>
          {navigation()}
        </aside>
      </>}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <button ref={menuButtonRef} type="button" onClick={() => setMobileOpen(true)}
              aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="mobile-navigation"
              className="lg:hidden shrink-0 min-h-11 min-w-11 text-xl rounded-lg border border-gray-200 text-gray-800">
              <span aria-hidden="true">☰</span>
            </button>
            <div className="min-w-0">
              <span className="text-xs text-gray-500">Workspace</span>
              <p className="text-sm font-semibold text-gray-800 truncate" title={workspace?.name}>{workspace?.name ?? 'Unavailable'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="hidden xl:inline text-xs text-gray-500 max-w-48 truncate" title={user?.email}>{user?.email}</span>
            <div className="hidden sm:block"><KillSwitch /></div>
            <button onClick={() => { void signOut() }} type="button"
              className="min-h-11 px-3 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
              Sign out
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

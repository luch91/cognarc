import { NavLink, Outlet } from 'react-router-dom'
import { KillSwitch } from './KillSwitch.js'
import { useAdminAuth } from '../context/AdminAuthContext.js'

const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: '/', label: 'Workspace Overview' },
  { to: '/engineer', label: 'Engineer' },
  { to: '/pm', label: 'Product Manager' },
  { to: '/growth', label: 'Growth' },
  { to: '/designer', label: 'Designer' },
  { to: '/safety', label: 'Safety / Red Team' },
  { to: '/approvals', label: 'Act-Gated Approvals' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  const { workspace, user, signOut } = useAdminAuth()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-gray-900 tracking-tight">CognArc</span>
            <span className="w-2 h-2 rounded-full bg-teal-400 mt-0.5 ml-0.5 shrink-0" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <span className="text-sm text-gray-500">
            Workspace: <span className="font-semibold text-gray-700">{workspace?.name ?? 'Unavailable'}</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-gray-500" title={user?.email}>{user?.email}</span>
            <KillSwitch />
            <button onClick={() => { void signOut() }} className="text-xs border rounded px-3 py-1.5">Sign out</button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

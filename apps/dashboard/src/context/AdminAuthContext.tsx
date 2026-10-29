import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../api/supabaseClient.js'
import { setActiveWorkspaceId } from '../api/workspaceSession.js'

export interface AdminWorkspace { id: string; name: string }
interface AdminAuthState {
  loading: boolean
  user: User | null
  workspace: AdminWorkspace | null
  error: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Context = createContext<AdminAuthState | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [workspace, setWorkspace] = useState<AdminWorkspace | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    setActiveWorkspaceId(null)
    if (!supabase) {
      setUser(null)
      setWorkspace(null)
      setError('Supabase authentication is not configured for this deployment.')
      setLoading(false)
      return
    }
    try {
      // getUser verifies the current session at the Supabase Auth server;
      // workspace access is filtered by owner-only database RLS.
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError || !data.user) {
        setUser(null)
        setWorkspace(null)
        if (userError) setError(userError.message)
        return
      }
      const { data: rows, error: workspaceError } = await supabase.from('workspaces')
        .select('id, name')
        .eq('user_id', data.user.id)
        .order('created_at', { ascending: true })
        .limit(1)
      if (workspaceError) throw workspaceError
      const row = rows?.[0] as AdminWorkspace | undefined
      setUser(data.user)
      setWorkspace(row ?? null)
      setActiveWorkspaceId(row?.id ?? null)
    } catch (err) {
      setUser(null)
      setWorkspace(null)
      setError(err instanceof Error ? err.message : 'Workspace verification failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    if (!supabase) return
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setWorkspace(null)
        setActiveWorkspaceId(null)
        setError(null)
        setLoading(false)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Schedule outside the auth state callback to avoid a client lock.
        void Promise.resolve().then(() => refresh())
      }
    })
    return () => {
      subscription.subscription.unsubscribe()
      setActiveWorkspaceId(null)
    }
  }, [])

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) throw signOutError
    setUser(null)
    setWorkspace(null)
    setActiveWorkspaceId(null)
  }

  return <Context.Provider value={{ loading, user, workspace, error, refresh, signOut }}>
    {children}
  </Context.Provider>
}

export function useAdminAuth(): AdminAuthState {
  const context = useContext(Context)
  if (!context) throw new Error('AdminAuthProvider is required')
  return context
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { user, workspace, loading, error, refresh, signOut } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [submitError, setSubmitError] = useState('')

  async function requestSignIn() {
    if (!supabase || !email.trim()) return
    setSending(true)
    setSubmitError('')
    setMessage('')
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      })
      if (signInError) throw signInError
      setMessage('If this email belongs to an invited account, a sign-in link has been requested.')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Sign-in request failed')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <main className="min-h-screen grid place-items-center bg-gray-50 p-6">
    <p role="status" className="text-gray-600">Verifying account and workspace access...</p>
  </main>

  if (!user || !workspace) {
    return <main className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">CognArc Admin</h1>
        {!user ? (
          <>
            <p className="text-sm text-gray-600">Sign in with an invited Supabase account to access an authorised workspace.</p>
            <label htmlFor="admin-email" className="block text-sm text-gray-700">Account email</label>
            <input id="admin-email" type="email" autoComplete="email" value={email}
              onChange={event => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="you@example.com"/>
            <button onClick={() => void requestSignIn()}
              disabled={!supabase || sending || !email.includes('@')}
              className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
              {sending ? 'Requesting link...' : 'Request sign-in link'}
            </button>
          </>
        ) : (
          <>
            <p role="status" className="text-sm text-amber-800">
              Your account is authenticated but has no assigned workspace.
              An administrator must provision a workspace owned by your user ID.
            </p>
            <div className="flex gap-3">
              <button onClick={() => void refresh()} className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm">Retry workspace access</button>
              <button onClick={() => void signOut()} className="border border-gray-300 rounded-lg px-4 py-2 text-sm">Sign out</button>
            </div>
          </>
        )}
        {(error || submitError) && <p role="alert" className="text-sm text-red-700">{submitError || error}</p>}
        {message && <p role="status" className="text-sm text-teal-700">{message}</p>}
      </div>
    </main>
  }
  return <>{children}</>
}

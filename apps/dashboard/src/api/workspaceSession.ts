import { supabase } from './supabaseClient.js'

// Workspace selection belongs to verified Auth/RLS. No hard-coded 'ws-1'
// or anonymous fallback is allowed on authenticated requests.
let activeWorkspaceId: string | null = null
export function setActiveWorkspaceId(id: string | null) { activeWorkspaceId = id }
export function getActiveWorkspaceId(): string {
  if (!activeWorkspaceId) throw new Error('No authenticated workspace selected')
  return activeWorkspaceId
}
export async function getWorkspaceRequestAuth(): Promise<{ workspaceId: string; authorization: string }> {
  const workspaceId = getActiveWorkspaceId()
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error('Session expired; please sign in again')
  return { workspaceId, authorization: 'Bearer ' + data.session.access_token }
}

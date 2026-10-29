import type { VercelRequest } from '@vercel/node'

// Runtime-agnostic Fetch API verification; replace the Vercel request type
// with a Cloudflare Request adapter during hosting migration.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type WorkspaceVerification = { ok: true; workspaceId: string } |
  { ok: false; status: number; error: string }

export async function verifyWorkspaceRequest(req: VercelRequest): Promise<WorkspaceVerification> {
  const supabaseUrl = process.env.SUPABASE_URL
  const publicKey = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !publicKey) return { ok: false, status: 503, error: 'Workspace authentication unavailable' }
  const bearer = req.headers.authorization
  if (typeof bearer !== 'string' || !/^Bearer [^\s]+$/.test(bearer)) {
    return { ok: false, status: 401, error: 'Authentication required' }
  }
  const workspaceId = (req.body as {workspace_id?: unknown} | undefined)?.workspace_id
  if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
    return { ok: false, status: 400, error: 'A valid workspace UUID is required' }
  }
  const headers = { apikey: publicKey, Authorization: bearer }
  const url = supabaseUrl.replace(/\/$/, '')
  try {
    // First verify the token against Supabase Auth, then query membership
    // under the user's RLS identity. No service-role key is used.
    const identity = await fetch(url + '/auth/v1/user', {
      headers, signal: AbortSignal.timeout(7000), cache: 'no-store',
    })
    if (!identity.ok) return { ok: false, status: 401, error: 'Invalid or expired session' }
    const user: unknown = await identity.json()
    if (!user || typeof user !== 'object' || typeof (user as {id?:unknown}).id !== 'string') {
      return { ok: false, status: 401, error: 'Invalid session identity' }
    }
    const permission = await fetch(url + '/rest/v1/workspaces?select=id&id=eq.' +
      encodeURIComponent(workspaceId) + '&limit=1', {
      headers, signal: AbortSignal.timeout(7000), cache: 'no-store',
    })
    if (!permission.ok) return { ok: false, status: 503, error: 'Cannot verify workspace permission' }
    const rows: unknown = await permission.json()
    if (!Array.isArray(rows) || !rows.some(row => row && typeof row === 'object' &&
      (row as {id?:unknown}).id === workspaceId)) {
      return { ok: false, status: 403, error: 'Workspace access denied' }
    }
    return { ok: true, workspaceId }
  } catch {
    return { ok: false, status: 503, error: 'Workspace authentication service unreachable' }
  }
}

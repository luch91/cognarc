import { verifyWorkspaceRequest } from '../api/_auth.js'

const validWorkspaceId = '00000000-0000-4000-8000-000000000001'
const request = (token?: string, workspaceId = validWorkspaceId) => ({
  headers: token ? { authorization: 'Bearer ' + token } : {},
  body: { workspace_id: workspaceId },
}) as Parameters<typeof verifyWorkspaceRequest>[0]

const previousUrl = process.env.SUPABASE_URL
const previousKey = process.env.SUPABASE_ANON_KEY
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
})
afterEach(() => {
  jest.restoreAllMocks()
  if (previousUrl === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = previousUrl
  if (previousKey === undefined) delete process.env.SUPABASE_ANON_KEY
  else process.env.SUPABASE_ANON_KEY = previousKey
})
describe('Gate 3 workspace verification', () => {
  test('refuses unauthenticated scoring', async () => {
    expect(await verifyWorkspaceRequest(request())).toMatchObject({ ok: false, status: 401 })
  })
  test('refuses legacy shared workspace identifier', async () => {
    expect(await verifyWorkspaceRequest(request('valid-token', 'ws-1')))
      .toMatchObject({ ok: false, status: 400 })
  })
  test('does not trust a valid session for an unowned workspace', async () => {
    const spy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'user-id' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)
    expect(await verifyWorkspaceRequest(request('valid-token')))
      .toMatchObject({ ok: false, status: 403 })
    expect(spy).toHaveBeenCalledTimes(2)
  })
  test('authorises only the RLS-visible workspace', async () => {
    const spy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'user-id' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: validWorkspaceId }] } as unknown as Response)
    expect(await verifyWorkspaceRequest(request('valid-token')))
      .toMatchObject({ ok: true, workspaceId: validWorkspaceId })
    const [endpoint, init] = spy.mock.calls[1]!
    expect(String(endpoint)).toContain('workspaces?select=id')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer valid-token' })
  })
  test('fails closed when the authentication origin is not configured', async () => {
    delete process.env.SUPABASE_URL
    expect(await verifyWorkspaceRequest(request('valid-token')))
      .toMatchObject({ ok: false, status: 503 })
  })
})

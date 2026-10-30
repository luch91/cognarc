import { handleGateway, type GatewayContext, type GatewayEnv } from '../cloudflare/gateway.js'

const wid='11111111-1111-4111-8111-111111111111'
const sample={
 cognitive_load:42, comprehension_confidence:71, emotional_valence:50, trust_coherence:69,
 manipulation_risk:13,cognitive_risk:'LOW',top_brain_regions:[],
 model_version:'cme-1.0',explanation:'Linguistic heuristic indices',latency_ms:14,
 scoring_provenance:{
   engine:'mathematical', evidence_type:'linguistic_heuristics',
   calibration_status:'uncalibrated', policy_eligible:false, neural_evidence:false,
 },
}
const limiter=jest.fn(async () => ({success:true}))
function env(overrides:Partial<GatewayEnv>={}):GatewayEnv {
 return {
   SUPABASE_URL:'https://staging.example.org', SUPABASE_ANON_KEY:'public-test-key',
   COGNARC_SCORING_URL:'https://scorer.example.org',
   COGNARC_SCORING_SERVICE_SECRET:'server-private-secret',
   COGNARC_RATE_LIMITER:{limit:limiter},
   ...overrides,
 }
}
function ctx(route:string, body:Record<string,unknown>={}, overrides:Partial<GatewayEnv>={},
  method='POST', token=true):GatewayContext {
 return {
   request:new Request('https://admin.example.org/api/'+route,{
     method, headers:{
       'Content-Type':'application/json',
       ...(token?{Authorization:'Bearer valid-session'}:{}),
       'X-Workspace-Id':wid,
     }, ...(method!=='GET'?{body:JSON.stringify({workspace_id:wid,...body})}:{})
   }),
   env:env(overrides),
 }
}
function response(value:unknown, status=200):Response {
 return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
}
const originalFetch=globalThis.fetch
afterEach(()=>{globalThis.fetch=originalFetch;limiter.mockReset();limiter.mockResolvedValue({success:true})})
beforeEach(()=>{limiter.mockResolvedValue({success:true})})
function permitted(upstream:Response=response(sample)):jest.Mock {
 const mock=jest.fn()
  .mockResolvedValueOnce(response({id:'user-11'}))
  .mockResolvedValueOnce(response([{id:wid}]))
  .mockResolvedValueOnce(upstream)
 globalThis.fetch=mock as unknown as typeof fetch
 return mock
}

describe('Cloudflare Pages API transport, fail-closed',()=>{
 test('unauthenticated requests cannot invoke scoring or upstream',async()=>{
   const mock=jest.fn()
   globalThis.fetch=mock as unknown as typeof fetch
   const res=await handleGateway(ctx('score',{content:'Hello',stimulus_type:'text'}, {},'POST',false),'score')
   expect(res.status).toBe(401)
   expect(mock).not.toHaveBeenCalled()
 })
 test('unowned workspace is denied before rate limit or inference',async()=>{
   const mock=jest.fn().mockResolvedValueOnce(response({id:'user-11'}))
     .mockResolvedValueOnce(response([]))
   globalThis.fetch=mock as unknown as typeof fetch
   expect((await handleGateway(ctx('score',{content:'Hello',stimulus_type:'text'}),'score')).status).toBe(403)
   expect(mock).toHaveBeenCalledTimes(2)
 })
 test('unconfigured rate limiting denies expensive access',async()=>{
   const mock=jest.fn().mockResolvedValueOnce(response({id:'user-11'}))
     .mockResolvedValueOnce(response([{id:wid}]))
   globalThis.fetch=mock as unknown as typeof fetch
   const res=await handleGateway(ctx('score',
     {content:'Hello',stimulus_type:'text'},{COGNARC_RATE_LIMITER:undefined}),'score')
   expect(res.status).toBe(503)
   expect(mock).toHaveBeenCalledTimes(2)
 })
 test('rate limit exceeded does not launch inference',async()=>{
   limiter.mockResolvedValueOnce({success:false})
   const mock=jest.fn().mockResolvedValueOnce(response({id:'user-11'}))
     .mockResolvedValueOnce(response([{id:wid}]))
   globalThis.fetch=mock as unknown as typeof fetch
   expect((await handleGateway(ctx('score',
     {content:'Hello',stimulus_type:'text'}),'score')).status).toBe(429)
   expect(mock).toHaveBeenCalledTimes(2)
 })
 test('canonical scoring sends only authorised workspace and hides service key',async()=>{
   const mock=permitted()
   const res=await handleGateway(ctx('score',{
      stimulus_type:'text',content:'Hello', workspace_id:wid, mode:'accurate',
      service_secret:'injected', extra:'should_not_forward',
   }),'score')
   expect(res.status).toBe(200)
   expect((await res.json()).scoring_provenance.engine).toBe('mathematical')
   const [url,opts]=mock.mock.calls[2]!
   expect(url).toBe('https://scorer.example.org/score')
   expect(opts.headers['X-CognArc-Key']).toBe('server-private-secret')
   expect(opts.headers.Authorization).toBeUndefined()
   expect(JSON.parse(opts.body)).toEqual({
     content:'Hello',workspace_id:wid,stimulus_type:'text',mode:'accurate'
   })
 })
 test('one inference creates a verified stream result, no invented GPU phases',async()=>{
   const mock=permitted()
   const res=await handleGateway(ctx('score-stream',{stimulus_type:'text',content:'Hello'}),'score-stream')
   expect(res.status).toBe(200)
   expect(res.headers.get('Content-Type')).toMatch(/text\/event-stream/)
   const text=await res.text()
   expect(text).toContain('event: result')
   expect(text).toContain('Canonical response verified')
   expect(text).not.toContain('GPU')
   expect(mock).toHaveBeenCalledTimes(3)
 })
 test('stub or policy-ineligible mathematical score cannot claim verified policy',async()=>{
   const mock=permitted(response({...sample,scoring_provenance:{
     ...sample.scoring_provenance,policy_eligible:true,
   }}))
   const result=await handleGateway(ctx('score',{stimulus_type:'text',content:'Test'}),'score')
   expect(result.status).toBe(502)
   expect(mock).toHaveBeenCalledTimes(3)
 })
 test('unconfigured rewrite service remains unavailable',async()=>{
   permitted()
   const res=await handleGateway(ctx('rewrite',{
     original_text:'Please keep this accurate',copy_type:'campaign',scores:{cognitive_load:35},
   }),'rewrite')
   expect(res.status).toBe(503)
 })
 test('host allowlist prevents untrusted URL fetch',async()=>{
   const mock=permitted()
   const res=await handleGateway(ctx('extract-url',{
     url:'http://169.254.169.254/latest/meta-data',
   },{COGNARC_URL_ALLOWED_HOSTS:'public.example.org'}),'extract-url')
   expect(res.status).toBe(403)
   expect(mock).toHaveBeenCalledTimes(2)
 })
 test('health requires verified identity and reports observed canonical health',async()=>{
   const mock=permitted(response({status:'ok',engine:'cme'}))
   const res=await handleGateway(ctx('health',{}, {},'GET'),'health')
   expect(res.status).toBe(200)
   expect((await res.json()).engine).toBe('cme')
   expect(mock).toHaveBeenCalledTimes(3)
 })
 test('unsupported HTTP methods are rejected before any auth fetch',async()=>{
   const mock=jest.fn()
   globalThis.fetch=mock as unknown as typeof fetch
   expect((await handleGateway(ctx('score',{}, {},'GET'),'score')).status).toBe(405)
   expect(mock).not.toHaveBeenCalled()
 })
})

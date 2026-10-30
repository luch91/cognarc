// Cloudflare Pages Functions gateway. Only Web APIs are used so handlers can
// be tested without Cloudflare-specific globals or secrets.
export interface GatewayEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  COGNARC_SCORING_URL?: string
  COGNARC_SCORING_SERVICE_SECRET?: string
  COGNARC_REWRITE_URL?: string
  COGNARC_REWRITE_SERVICE_SECRET?: string
  COGNARC_URL_ALLOWED_HOSTS?: string
  COGNARC_RATE_LIMITER?: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
}
export interface GatewayContext { request: Request; env: GatewayEnv }
export type GatewayRoute = 'score' | 'score-stream' | 'health' | 'rewrite' | 'extract-url'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' },
  })
}
function error(message: string, status = 400): Response { return json({ error: message }, status) }
function serverUrl(value: string | undefined): URL | null {
  try {
    if (!value) return null
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    return url
  } catch { return null }
}
function upstream(url: URL, path: string): string {
  return url.href.replace(/\/$/, '') + path
}
async function authenticate(ctx: GatewayContext, workspaceId: unknown): Promise<
  { actorId: string; workspaceId: string } | Response
> {
  const base = serverUrl(ctx.env.SUPABASE_URL)
  const key = ctx.env.SUPABASE_ANON_KEY
  if (!base || !key) return error('Authentication service not configured', 503)
  const bearer = ctx.request.headers.get('authorization') ?? ''
  if (!/^Bearer [^\s]+$/.test(bearer)) return error('Authentication required', 401)
  if (typeof workspaceId !== 'string' || !UUID.test(workspaceId)) {
    return error('Valid workspace UUID required', 400)
  }
  const headers = { apikey: key, Authorization: bearer }
  try {
    const identity = await fetch(upstream(base, '/auth/v1/user'), {
      headers, signal: AbortSignal.timeout(7000), cache: 'no-store', redirect: 'error',
    })
    if (!identity.ok) return error('Invalid or expired session', 401)
    const user: unknown = await identity.json()
    if (!user || typeof user !== 'object' ||
        typeof (user as Record<string, unknown>).id !== 'string') return error('Invalid account', 401)
    const actorId = (user as {id: string}).id
    const permitted = await fetch(upstream(base, '/rest/v1/workspaces') +
      '?select=id&id=eq.' + encodeURIComponent(workspaceId) + '&limit=1', {
      headers, signal: AbortSignal.timeout(7000), cache: 'no-store', redirect: 'error',
    })
    if (!permitted.ok) return error('Workspace permission verification unavailable', 503)
    const rows: unknown = await permitted.json()
    if (!Array.isArray(rows) || !rows.some(x => x && typeof x === 'object' && x.id === workspaceId)) {
      return error('Workspace access denied', 403)
    }
    return { actorId, workspaceId }
  } catch { return error('Identity verification unavailable', 503) }
}
async function rateLimit(ctx: GatewayContext, actorId: string, route: GatewayRoute): Promise<Response | null> {
  if (!ctx.env.COGNARC_RATE_LIMITER) return error('Rate limiter is not configured', 503)
  try {
    const result = await ctx.env.COGNARC_RATE_LIMITER.limit({ key: actorId + ':' + route })
    if (!result.success) return error('Too many requests', 429)
    return null
  } catch { return error('Rate limiter unavailable', 503) }
}
async function readJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    if (Number(request.headers.get('content-length') ?? '0') > 64000) return error('Payload too large', 413)
    const raw = await request.text()
    if (raw.length > 64000) return error('Payload too large', 413)
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return error('Invalid JSON payload')
    return value as Record<string, unknown>
  } catch { return error('Invalid JSON payload') }
}
function validScore(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  for (const k of ['cognitive_load','comprehension_confidence','emotional_valence','trust_coherence','manipulation_risk']) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k]) || (s[k] as number) < 0 || (s[k] as number) > 100) return false
  }
  if (!['LOW','MEDIUM','HIGH'].includes(String(s.cognitive_risk)) ||
      typeof s.model_version !== 'string' || !s.model_version || s.model_version.toLowerCase().includes('stub') ||
      typeof s.explanation !== 'string' || typeof s.latency_ms !== 'number' ||
      !Number.isFinite(s.latency_ms) || s.latency_ms < 0 ||
      !Array.isArray(s.top_brain_regions) || !s.top_brain_regions.every(x => typeof x === 'string')) return false
  const p = s.scoring_provenance as Record<string, unknown> | undefined
  if (!p || !['tribe','mathematical'].includes(String(p.engine)) ||
      !['uncalibrated','validated'].includes(String(p.calibration_status)) ||
      typeof p.policy_eligible !== 'boolean' || typeof p.neural_evidence !== 'boolean' ||
      !['linguistic_heuristics','predicted_cortical_activations'].includes(String(p.evidence_type))) return false
  if (p.engine === 'mathematical' && (p.policy_eligible !== false || p.neural_evidence !== false ||
      p.evidence_type !== 'linguistic_heuristics')) return false
  if (p.engine === 'tribe' && p.evidence_type !== 'predicted_cortical_activations') return false
  if (p.fallback_used === true && (p.engine !== 'mathematical' ||
      !['TRIBE_TIMEOUT','TRIBE_UNAVAILABLE','TRIBE_INVALID_OUTPUT'].includes(String(p.fallback_reason)))) return false
  return true
}
function sse(type: string, data: unknown): string {
  return 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'
}
function streamResult(result: unknown): Response {
  const content = sse('progress', { phase: 'Canonical response verified', percent: 100 }) + sse('result', result)
  return new Response(content, { status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff' } })
}
async function score(ctx: GatewayContext, body: Record<string, unknown>, workspaceId: string,
  streaming: boolean): Promise<Response> {
  const base = serverUrl(ctx.env.COGNARC_SCORING_URL)
  const secret = ctx.env.COGNARC_SCORING_SERVICE_SECRET
  if (!base || !secret) return error('Canonical scoring service not configured', 503)
  if (body.stimulus_type !== 'text' || typeof body.content !== 'string' ||
      !body.content.trim() || body.content.length > 20000 ||
      !['fast','accurate',undefined].includes(body.mode as string | undefined)) {
    return error('Unsupported or invalid scoring payload')
  }
  try {
    const result = await fetch(upstream(base, '/score'), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(100000),
      headers: { 'Content-Type': 'application/json', 'X-CognArc-Key': secret },
      body: JSON.stringify({ stimulus_type:'text', content:body.content,
        workspace_id: workspaceId, mode: body.mode ?? 'accurate' }),
    })
    if (!result.ok) return error('Canonical scoring service returned HTTP ' + result.status, 502)
    const payload: unknown = await result.json()
    if (!validScore(payload)) return error('Invalid canonical scoring response', 502)
    return streaming ? streamResult(payload) : json(payload)
  } catch { return error('Canonical scoring service unreachable or timed out', 502) }
}
async function health(ctx: GatewayContext): Promise<Response> {
  const base = serverUrl(ctx.env.COGNARC_SCORING_URL)
  if (!base) return error('Canonical scoring service not configured', 503)
  try {
    const response = await fetch(upstream(base, '/health'), {
      signal: AbortSignal.timeout(5000), cache:'no-store', redirect:'error',
    })
    const value: unknown = response.ok ? await response.json() : null
    if (!response.ok || !value || typeof value !== 'object' ||
      (value as Record<string, unknown>).status !== 'ok' ||
      typeof (value as Record<string, unknown>).engine !== 'string') {
      return json({ ok:false, error:'Canonical scoring service unhealthy' }, 503)
    }
    return json({ ok:true, service:'cognitive-scoring', engine:(value as {engine:string}).engine })
  } catch { return json({ ok:false, error:'Canonical scoring service unreachable' }, 503) }
}
async function rewrite(ctx: GatewayContext, body: Record<string, unknown>, workspaceId: string): Promise<Response> {
  const base = serverUrl(ctx.env.COGNARC_REWRITE_URL)
  const secret = ctx.env.COGNARC_REWRITE_SERVICE_SECRET
  if (!base || !secret) return error('Verified rewrite service not configured', 503)
  if (typeof body.original_text !== 'string' || !body.original_text.trim() ||
    body.original_text.length > 20000 || typeof body.copy_type !== 'string' ||
    !body.scores || typeof body.scores !== 'object') return error('Invalid rewrite input')
  try {
    const response = await fetch(upstream(base, '/rewrite'), {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(30000),
      headers:{'Content-Type':'application/json','X-CognArc-Key':secret},
      body:JSON.stringify({ original_text:body.original_text, copy_type:body.copy_type,
        scores:body.scores, taxonomy:body.taxonomy ?? {}, brand_voice_notes:body.brand_voice_notes,
        max_length:body.max_length, workspace_id:workspaceId }),
    })
    if (!response.ok) return error('Rewrite service returned HTTP ' + response.status, 502)
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' ||
      !Array.isArray((value as Record<string,unknown>).alternatives) ||
      !(value as {alternatives:unknown[]}).alternatives.every((x:unknown) => x &&
        typeof x === 'object' && typeof (x as Record<string,unknown>).text === 'string' &&
        !!(x as Record<string,unknown>).scores && !!(x as Record<string,unknown>).score_delta)) {
      return error('Invalid rewrite response', 502)
    }
    return json(value)
  } catch { return error('Rewrite service unavailable or timed out', 502) }
}
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>').replace(/\s+/g,' ').trim()
}
export function extractSections(html: string): Array<Record<string, unknown>> {
  const matches: Array<{section_type:string,label:string,text:string,element:string}> = []
  const sections: Array<{rx:RegExp, type:string,label:string, element:string}> = [
    {rx:/<title[^>]*>([\s\S]*?)<\/title>/gi,type:'meta',label:'Page title',element:'title'},
    {rx:/<h1[^>]*>([\s\S]*?)<\/h1>/gi,type:'hero',label:'Main headline',element:'h1'},
    {rx:/<h2[^>]*>([\s\S]*?)<\/h2>/gi,type:'headline',label:'Section heading',element:'h2'},
    {rx:/<p[^>]*>([\s\S]*?)<\/p>/gi,type:'body',label:'Body copy',element:'p'},
    {rx:/<button[^>]*>([\s\S]*?)<\/button>/gi,type:'cta',label:'Button',element:'button'},
  ]
  for (const {rx,type,label,element} of sections) {
    for (const match of html.matchAll(rx)) {
      const text = stripHtml(match[1] ?? '')
      if (text.length >= 5 && text.length <= 5000) matches.push({section_type:type,label,text,element})
    }
  }
  const seen = new Set<string>()
  return matches.filter(x=>{
    const key=x.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key); return true
  }).slice(0,15).map(x=>({ ...x,word_count:x.text.split(/\s+/).length,score_this:true }))
}
async function extractUrl(ctx: GatewayContext, body: Record<string, unknown>): Promise<Response> {
  const hosts = (ctx.env.COGNARC_URL_ALLOWED_HOSTS ?? '').split(',')
    .map(x=>x.trim().toLowerCase()).filter(Boolean)
  if (!hosts.length) return error('URL extraction allowlist is not configured', 503)
  if (typeof body.url !== 'string' || body.url.length > 2048) return error('URL is missing or invalid')
  let url: URL
  try { url = new URL(body.url) }
  catch { return error('Invalid URL') }
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port ||
      !hosts.includes(url.hostname.toLowerCase()) || /^\d+(?:\.\d+){3}$/.test(url.hostname) ||
      url.hostname === 'localhost') return error('URL host not authorised for extraction', 403)
  try {
    const started=Date.now()
    const response=await fetch(url.toString(), {
      headers:{ Accept:'text/html,application/xhtml+xml', 'User-Agent':'CognArc-PublicContentAnalyzer/1.0' },
      redirect:'error', signal:AbortSignal.timeout(12000),
    })
    if (!response.ok) return error('Page returned HTTP '+response.status, 502)
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')??'')) {
      return error('URL did not return HTML', 415)
    }
    const size=Number(response.headers.get('content-length')??'0')
    if (size>500000) return error('Page exceeded allowed HTML size', 413)
    const html=await response.text()
    if (html.length>500000) return error('Page exceeded allowed HTML size', 413)
    const sections=extractSections(html)
    const title=stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??url.hostname)
    const meta=html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1]??null
    return json({
      url:url.toString(), page_title:title, meta_description:meta,
      sections, total_word_count:sections.reduce((n,s)=>n+(s.word_count as number),0),
      extraction_method:'http', fetch_time_ms:Date.now()-started,
      warning:sections.length<3?'Only a few text sections were extracted; dynamic content may be missing.':null,
    })
  } catch { return error('URL extraction could not complete safely', 502) }
}
export async function handleGateway(ctx: GatewayContext, route: GatewayRoute): Promise<Response> {
  const expected = route === 'health' ? 'GET' : 'POST'
  if (ctx.request.method !== expected) return error('Method not allowed', 405)
  const body = route === 'health' ? {} : await readJson(ctx.request)
  if (body instanceof Response) return body
  const workspaceId = route === 'health' ? ctx.request.headers.get('x-workspace-id') : body.workspace_id
  const actor = await authenticate(ctx, workspaceId)
  if (actor instanceof Response) return actor
  const limited=await rateLimit(ctx, actor.actorId, route)
  if (limited) return limited
  if (route === 'health') return health(ctx)
  if (route === 'score') return score(ctx,body,actor.workspaceId,false)
  if (route === 'score-stream') return score(ctx,body,actor.workspaceId,true)
  if (route === 'rewrite') return rewrite(ctx,body,actor.workspaceId)
  return extractUrl(ctx,body)
}

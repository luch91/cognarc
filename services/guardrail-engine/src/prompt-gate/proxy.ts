import type { Request, Response } from 'express'
import type { EvaluatorConfig } from './evaluator.js'
import { evaluatePrompt } from './evaluator.js'
import { globalRateLimiter } from './rateLimiter.js'

export interface ProxyConfig {
  upstreamBase: string
  authHeaderName: string       // header the client sends their key in
  upstreamAuthHeader: string   // header the upstream API expects
  evaluatorConfig: EvaluatorConfig
  workspaceId: string
}

// Proxy headers that must never be forwarded upstream or logged
const REDACTED_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
])

export async function handleProxy(req: Request, res: Response, config: ProxyConfig): Promise<void> {
  // Rate limit check
  const rateResult = globalRateLimiter.consume(config.workspaceId)
  if (!rateResult.allowed) {
    const retryAfterSec = Math.ceil(rateResult.retryAfterMs / 1000)
    res.status(429).set('Retry-After', String(retryAfterSec)).json({
      error: 'Rate limit exceeded',
      retry_after_seconds: retryAfterSec,
    })
    return
  }

  // Extract prompt text for evaluation
  const body = req.body as Record<string, unknown>
  const promptText = extractPromptText(body)

  if (promptText !== null) {
    let evalResult
    try {
      evalResult = await evaluatePrompt(
        { prompt: promptText, workspace_id: config.workspaceId },
        config.evaluatorConfig,
      )
    } catch {
      // Evaluation failure must not block the proxy — fail open with a warning header
      res.set('X-CognArc-Status', 'evaluation-error')
    }

    if (evalResult !== undefined) {
      res.set('X-CognArc-Decision', evalResult.decision)
      res.set('X-CognArc-Prompt-Id', evalResult.prompt_id)
      res.set('X-CognArc-Latency-Ms', String(evalResult.latency_ms))

      if (evalResult.decision === 'BLOCK') {
        res.status(400).json({
          error: 'Prompt blocked by CognArc cognitive gate',
          decision: evalResult.decision,
          reason: evalResult.reason,
          scores: evalResult.scores,
        })
        return
      }
    }
  }

  // Forward to upstream
  const upstreamUrl = buildUpstreamUrl(req, config.upstreamBase)
  const clientApiKey = req.get(config.authHeaderName) ?? req.get('authorization') ?? ''

  // Build safe headers — strip auth and hop-by-hop headers; add upstream auth
  const forwardHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!REDACTED_HEADERS.has(key.toLowerCase()) && typeof value === 'string') {
      forwardHeaders[key] = value
    }
  }
  forwardHeaders[config.upstreamAuthHeader] = clientApiKey
  forwardHeaders['content-type'] = 'application/json'

  try {
    const fetchInit: RequestInit = { method: req.method, headers: forwardHeaders }
    if (req.method !== 'GET') fetchInit.body = JSON.stringify(req.body)
    const upstream = await fetch(upstreamUrl, fetchInit)

    // Pass through status and headers (except auth/hop-by-hop)
    res.status(upstream.status)
    upstream.headers.forEach((value, key) => {
      if (!REDACTED_HEADERS.has(key.toLowerCase())) {
        res.set(key, value)
      }
    })

    const isStreaming = upstream.headers.get('content-type')?.includes('text/event-stream') === true
    if (isStreaming && upstream.body !== null) {
      // Stream SSE passthrough
      res.set('Content-Type', 'text/event-stream')
      res.set('Cache-Control', 'no-cache')
      res.flushHeaders()

      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const chunk = await reader.read()
        done = chunk.done
        if (chunk.value !== undefined) {
          res.write(decoder.decode(chunk.value, { stream: !done }))
        }
      }
      res.end()
    } else {
      const responseBody = await upstream.text()
      res.send(responseBody)
    }
  } catch (err) {
    res.status(502).json({
      error: 'Upstream request failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}

function extractPromptText(body: Record<string, unknown>): string | null {
  // OpenAI / Anthropic: messages array
  if (Array.isArray(body['messages'])) {
    const msgs = body['messages'] as Array<{ role?: string; content?: unknown }>
    const userMessages = msgs
      .filter((m) => m.role === 'user' || m.role === 'human')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    if (userMessages.length > 0) return userMessages.join('\n')
  }
  // Gemini: contents array
  if (Array.isArray(body['contents'])) {
    const contents = body['contents'] as Array<{ parts?: Array<{ text?: string }> }>
    const texts = contents.flatMap((c) => (c.parts ?? []).map((p) => p.text ?? '').filter(Boolean))
    if (texts.length > 0) return texts.join('\n')
  }
  // Direct prompt field
  if (typeof body['prompt'] === 'string') return body['prompt']
  return null
}

function buildUpstreamUrl(req: Request, upstreamBase: string): string {
  // Strip the /proxy/<provider> prefix; forward the rest of the path
  const pathParts = req.path.split('/').filter(Boolean)
  // pathParts[0] = 'proxy', pathParts[1] = provider — everything after is the upstream path
  const upstreamPath = pathParts.slice(2).join('/')
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  return `${upstreamBase}/${upstreamPath}${query}`
}

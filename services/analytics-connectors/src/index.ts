import express from 'express'
import { ConnectorManager } from './ConnectorManager.js'
import { AmplitudeConnector } from './connectors/AmplitudeConnector.js'
import { GA4Connector } from './connectors/GA4Connector.js'
import { MixpanelConnector } from './connectors/MixpanelConnector.js'
import { PostHogConnector } from './connectors/PostHogConnector.js'
import { SegmentConnector } from './connectors/SegmentConnector.js'

export * from './types.js'
export * from './ConnectorManager.js'
export { SegmentConnector } from './connectors/SegmentConnector.js'
export { AmplitudeConnector } from './connectors/AmplitudeConnector.js'
export { MixpanelConnector } from './connectors/MixpanelConnector.js'
export { PostHogConnector } from './connectors/PostHogConnector.js'
export { GA4Connector } from './connectors/GA4Connector.js'

const SCORING_ENDPOINT = process.env['COGNARC_SCORING_ENDPOINT'] ?? 'http://localhost:3001'
const PORT = parseInt(process.env['PORT'] ?? '3002', 10)

const manager = new ConnectorManager(SCORING_ENDPOINT)

// Register connectors from environment credentials
function buildConnectors(): void {
  const workspaceId = process.env['WORKSPACE_ID'] ?? 'default'

  if (process.env['SEGMENT_WRITE_KEY'] !== undefined) {
    const c = new SegmentConnector()
    void c.connect({
      workspaceId,
      writeKey: process.env['SEGMENT_WRITE_KEY'] ?? '',
      webhookSecret: process.env['SEGMENT_WEBHOOK_SECRET'] ?? '',
    })
    manager.register(c)
  }

  if (process.env['AMPLITUDE_API_KEY'] !== undefined) {
    const c = new AmplitudeConnector()
    void c.connect({
      workspaceId,
      apiKey: process.env['AMPLITUDE_API_KEY'] ?? '',
      secretKey: process.env['AMPLITUDE_SECRET_KEY'] ?? '',
    })
    manager.register(c)
  }

  if (process.env['MIXPANEL_PROJECT_TOKEN'] !== undefined) {
    const c = new MixpanelConnector()
    void c.connect({
      workspaceId,
      projectToken: process.env['MIXPANEL_PROJECT_TOKEN'] ?? '',
      serviceAccountUsername: process.env['MIXPANEL_SA_USERNAME'] ?? '',
      serviceAccountSecret: process.env['MIXPANEL_SA_SECRET'] ?? '',
    })
    manager.register(c)
  }

  if (process.env['POSTHOG_API_KEY'] !== undefined) {
    const c = new PostHogConnector()
    void c.connect({
      workspaceId,
      apiKey: process.env['POSTHOG_API_KEY'] ?? '',
      webhookSecret: process.env['POSTHOG_WEBHOOK_SECRET'] ?? '',
      apiHost: process.env['POSTHOG_API_HOST'] ?? 'https://app.posthog.com',
    })
    manager.register(c)
  }

  if (process.env['GA4_MEASUREMENT_ID'] !== undefined) {
    const c = new GA4Connector()
    void c.connect({
      workspaceId,
      measurementId: process.env['GA4_MEASUREMENT_ID'] ?? '',
      apiSecret: process.env['GA4_API_SECRET'] ?? '',
    })
    manager.register(c)
  }
}

buildConnectors()

const app = express()

// Raw body needed for signature validation
app.use(
  express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf
    },
  }),
)

// ── Webhook endpoints ────────────────────────────────────────────────────────

app.post('/webhooks/segment', (req, res) => {
  const connector = manager.get('segment') as SegmentConnector | undefined
  if (connector === undefined) { res.status(404).json({ error: 'Segment connector not configured' }); return }

  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody
  const sig = req.headers['x-signature'] as string | undefined
  if (sig !== undefined && rawBody !== undefined && !connector.validateSignature(rawBody.toString(), sig)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }

  void connector.ingestWebhook(req.body).then((events) => manager.processEvents(events))
  res.status(200).json({ ok: true })
})

app.post('/webhooks/amplitude', (req, res) => {
  const connector = manager.get('amplitude')
  if (connector === undefined) { res.status(404).json({ error: 'Amplitude connector not configured' }); return }
  void connector.ingestWebhook(req.body).then((events) => manager.processEvents(events))
  res.status(200).json({ ok: true })
})

app.post('/webhooks/mixpanel', (req, res) => {
  const connector = manager.get('mixpanel')
  if (connector === undefined) { res.status(404).json({ error: 'Mixpanel connector not configured' }); return }
  void connector.ingestWebhook(req.body).then((events) => manager.processEvents(events))
  res.status(200).json({ ok: true })
})

app.post('/webhooks/posthog', (req, res) => {
  const connector = manager.get('posthog') as PostHogConnector | undefined
  if (connector === undefined) { res.status(404).json({ error: 'PostHog connector not configured' }); return }

  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody
  const sig = req.headers['x-posthog-signature'] as string | undefined
  if (sig !== undefined && rawBody !== undefined && !connector.validateSignature(rawBody.toString(), sig)) {
    res.status(401).json({ error: 'Invalid signature' }); return
  }

  void connector.ingestWebhook(req.body).then((events) => manager.processEvents(events))
  res.status(200).json({ ok: true })
})

// ── Health endpoint ──────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', connectors: manager.health() })
})

// ── Connector status ─────────────────────────────────────────────────────────

app.get('/connectors/:name/test', (req, res) => {
  const connector = manager.get(req.params['name'] ?? '')
  if (connector === undefined) { res.status(404).json({ error: 'Connector not found' }); return }
  void connector.testConnection().then((ok) => res.json({ connected: ok }))
})

app.listen(PORT, () => {
  console.log(`analytics-connectors listening on :${PORT}`)
})

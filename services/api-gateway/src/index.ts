import express from 'express'
import { segmentWebhook } from './routes/webhooks/segment.js'
import { amplitudeWebhook } from './routes/webhooks/amplitude.js'
import { posthogWebhook } from './routes/webhooks/posthog.js'
import { mixpanelWebhook } from './routes/webhooks/mixpanel.js'
import { ga4Webhook } from './routes/webhooks/ga4.js'

const app = express()
app.use(express.json())

app.post('/v1/connectors/segment/webhook', segmentWebhook)
app.post('/v1/connectors/amplitude/webhook', amplitudeWebhook)
app.post('/v1/connectors/posthog/webhook', posthogWebhook)
app.post('/v1/connectors/mixpanel/webhook', mixpanelWebhook)
app.post('/v1/connectors/ga4/webhook', ga4Webhook)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
  console.log(`api-gateway listening on :${PORT}`)
})

export { app }

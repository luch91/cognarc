# analytics-connectors

**Bidirectional connectors between CognArc and your existing analytics stack.**

CognArc enriches analytics platforms — it does not replace them. Events flow in from your analytics
platform, get cognitively scored, and cognitive labels are written back as event properties.

## Responsibilities

- Ingest events from Segment, Amplitude, Mixpanel, PostHog, and GA4 via webhooks
- Forward events to the Cognitive Scoring Service
- Write cognitive labels back to each platform as custom event/user properties
- Manage connector health, rate limiting, and retry logic per workspace

## Supported Platforms

| Platform | Ingest | Write-back |
|---|---|---|
| Segment | Webhook | Track API |
| Amplitude | Webhook / Data Export | HTTP API v2 |
| Mixpanel | Webhook | Import API |
| PostHog | Webhook | Capture API |
| GA4 | — | Measurement Protocol v2 |

## Port

`:3003`

## Running locally

```bash
pnpm --filter @cognarc/analytics-connectors dev
```

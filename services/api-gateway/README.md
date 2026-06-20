# api-gateway

**Unified REST API — the single external entry point for the CognArc platform.**

All external clients (dashboard, SDKs, third-party integrations) talk to the API gateway.
Internal services communicate with each other directly without going through this gateway.

## Responsibilities

- Authentication (API key validation, JWT issuance)
- Rate limiting per workspace and tier (Free: 100 req/min, Growth: 1000 req/min)
- Request routing to internal services
- Workspace context injection
- API versioning (`/v1/`)
- **Live Event Capture** — receives webhook payloads from all 5 analytics platforms, applies cognitive labels via `cognitive-label-map.ts`, strips PII, persists to Supabase `analytics_events`, and triggers write-back

## Port

`:3000`

## Key routes

| Method | Path | Proxies to |
|---|---|---|
| `POST` | `/v1/score` | cognitive-scoring:3001 |
| `POST` | `/v1/events` | behavioral-sdk:3002 |
| `POST` | `/v1/connectors/:platform/webhook` | analytics-connectors:3003 |
| `POST` | `/v1/evaluate-prompt` | guardrail-engine:3004 |
| `GET`  | `/v1/audit` | trust-gradient:3005 |
| `POST` | `/v1/kill-switch` | trust-gradient:3005 |

## Analytics Event Capture (STREAM-01 / STREAM-02)

Every webhook hit flows through this pipeline:

1. **Platform webhook** (`routes/webhooks/{segment,amplitude,posthog,mixpanel,ga4}.ts`) — normalizes the platform-specific payload into a common shape
2. **PII filter** (`lib/pii-filter.ts`) — strips known PII keys and email-shaped values before storage
3. **Cognitive label map** (`lib/cognitive-label-map.ts`) — 6 rules (rage_click, field_reentry, scroll_reversal, session_abandonment_post_modal, dwell_no_scroll, high_velocity_no_click) that tag events with cognitive labels
4. **Capture** (`lib/capture-analytics-event.ts`) — inserts into Supabase `analytics_events`, then writes the label back to the originating platform
5. **Supabase Realtime** — `analytics_events` is published to `supabase_realtime`, so the PM dashboard streams events in real time

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only, never expose to frontend) |

## Running locally

```bash
pnpm --filter @cognarc/api-gateway dev
```

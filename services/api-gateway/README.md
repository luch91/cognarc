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

## Running locally

```bash
pnpm --filter @cognarc/api-gateway dev
```

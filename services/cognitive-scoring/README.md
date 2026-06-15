# cognitive-scoring

**The only service that produces cognitive scores in CognArc.**

All cognitive inference — whether from the mock engine or TRIBE v2 — flows through this service.
No other service ever calls TRIBE directly. This boundary is enforced by architecture and convention.

## Responsibilities

- Exposes `POST /score` — the single scoring endpoint for the entire platform
- Routes requests to the configured engine (`mock`, `tribe-local`, or `tribe-gcp`)
- Hosts the `MockScoringEngine` for development and CI
- Hosts the `TRIBEAdapter` for real inference (local or GCP)
- Hosts the `ABComparisonEngine` for zero-traffic A/B comparisons (P-012)

## Engine Selection

Controlled by the `COGNARC_SCORING_ENGINE` environment variable:

| Value | Engine | When to use |
|---|---|---|
| `mock` | `MockScoringEngine` | **Default. All development and CI.** |
| `tribe-local` | `TRIBEAdapter → localhost:8080` | Testing TRIBE locally |
| `tribe-gcp` | `TRIBEAdapter → GCP_TRIBE_ENDPOINT` | Demo and production |

## Port

`:3001`

## Running locally

### Against mock (default — fast, no credentials needed)

```bash
pnpm --filter @cognarc/cognitive-scoring dev
# POST http://localhost:3001/score
```

### Against live TRIBE v2 on Cloud Run

```bash
# 1. Authenticate with GCP (one-time)
gcloud auth login   # use orluchee91@gmail.com

# 2. Set env vars in services/cognitive-scoring/.env
COGNARC_SCORING_ENGINE=tribe-gcp
GCP_TRIBE_ENDPOINT=https://tribe-inference-l4kyolfkla-uc.a.run.app

# 3. Start the service
pnpm --filter @cognarc/cognitive-scoring dev
# POST http://localhost:3001/score
# model_version: tribe-v2, ~300s cold start / ~30s warm
```

The `TRIBEGCPAdapter` fetches a GCP identity token automatically via `gcloud auth print-identity-token`.
On Windows, use `gcloud auth login` (not `application-default login`) — the latter hits SSL cert issues
with the bundled Python in older gcloud SDK installs.

## Running tests

```bash
pnpm --filter @cognarc/cognitive-scoring test
```

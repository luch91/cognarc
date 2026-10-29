# cognitive-scoring

**Canonical cognitive scoring service for CognArc, including CME mathematical indices and TRIBE integration.**

All cognitive inference — whether from the mock engine or TRIBE v2 — flows through this service.
No other service ever calls TRIBE directly. This boundary is enforced by architecture and convention.

## Responsibilities

- Exposes `POST /score` — the single scoring endpoint for the entire platform
- Routes requests to the configured engine (`math`, `mock`, `tribe-local`, or `tribe-gcp`)
- Hosts the `MockScoringEngine` for development and CI
- Hosts the `TRIBEAdapter` for real inference (local or GCP)
- Hosts the `ABComparisonEngine` for zero-traffic A/B comparisons (P-012)

## Engine Selection

Controlled by the `COGNARC_SCORING_ENGINE` environment variable:

| Value | Engine | When to use |
|---|---|---|
| `math` | `MathematicalScoringEngine` | **Default. No external inference.** |
| `mock` | `MockScoringEngine` | Legacy fixtures only |
| `tribe-local` | `TRIBEAdapter → localhost:8080` | Testing TRIBE locally |
| `tribe-gcp` | `TRIBEAdapter → GCP_TRIBE_ENDPOINT` | Demo and production |

## Port

`:3001`

## Running locally

### Mathematical engine (default, no credentials needed)

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

## Mathematical fallback and safety

CME 1.0 produces reproducible English-language readability, complexity, pressure-language and claim-indicator indices. It is a **heuristic baseline**, not a validated human workload or neural prediction model.

Set `COGNARC_SCORING_ENGINE=math` to evaluate text directly. When `tribe-local` or `tribe-gcp` is configured, the `FallbackScoringEngine` automatically switches to CME for **text** if TRIBE times out, fails, or returns synthetic stub data. Set `COGNARC_FALLBACK_ENABLED=false` to disable this fallback for debugging.

`POST /score` preserves the legacy response fields and adds `scoring_provenance` with `engine`, `calibration_status`, `evidence`, `fallback_reason` and `policy_eligible`. CME outputs no brain regions and no fabricated statistical confidence intervals. `emotional_valence=50` is retained only for legacy compatibility and explicitly marked as unestimated. Never represent this placeholder as an observed emotional outcome.

CME refuses non-text input (HTTP 422). A failed TRIBE call for image, audio or video raises an error rather than inventing scores. The guardrail service requires human review when provenance states that scores are not yet eligible for policy enforcement.

Verification: `pnpm --filter @cognarc/cognitive-scoring typecheck` and `pnpm --filter @cognarc/cognitive-scoring test`. The standalone Vercel scoring proxy is a separate deployment path. It is **not** updated by these engine changes and must be separately connected to this canonical service before claiming production fallback.

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

```bash
pnpm --filter @cognarc/cognitive-scoring dev
```

## Running tests

```bash
pnpm --filter @cognarc/cognitive-scoring test
```

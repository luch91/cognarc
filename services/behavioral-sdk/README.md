# behavioral-sdk

**Behavioral event ingestion service and JS SDK build pipeline.**

Receives cognitive friction signals from the `cognarc-sdk` browser SDK, processes them into
structured behavioral events, and forwards them to the Cognitive Scoring Service for scoring.

## Responsibilities

- Hosts the event ingestion endpoint (`POST /events`) that the browser SDK transmits to
- Processes raw behavioral events (rage-clicks, scroll reversals, field re-entries, etc.)
- Translates events into cognitive labels before forwarding to scoring
- Builds and serves the publishable `cognarc-sdk` npm package

## Port

`:3002`

## Key event types processed

| Event | Cognitive Signal |
|---|---|
| `rage_click` | confusion |
| `field_reentry_count` | working_memory_overload |
| `scroll_reversal` | comprehension_failure |
| `session_abandonment` | trust_erosion_trigger |

## Running locally

```bash
pnpm --filter @cognarc/behavioral-sdk-service dev
```

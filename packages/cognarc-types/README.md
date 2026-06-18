# @cognarc/types

Shared TypeScript types and API clients for CognArc services. All services and apps import from here — never define these locally.

## Exports

### `scoring.ts`
`CognitiveScoreRequest`, `CognitiveScoreResponse` — the contract between the scoring service and all callers.

### `audit.ts`
`AuditEntry` — append-only audit log shape. Never modify without platform review.

### `errors.ts`
`CognArcError` — base error class. All services extend this, never throw raw strings.

### `rewrite-client.ts`
Typed client for the Cognitive Rewrite Service (`POST /rewrite`).

```typescript
import { requestRewrites } from '@cognarc/types'

// In a Vite app, wrap it to inject the URL from import.meta.env:
// (see apps/dashboard/src/api/rewriteApi.ts for the pattern)
const result = await requestRewrites({
  originalText: 'Act now! Limited time offer.',
  copyType: 'campaign',
  scores: { cognitiveLoad: 72, comprehensionConfidence: 48, emotionalValence: 65,
            trustCoherence: 34, manipulationRisk: 81, cognitiveRisk: 'HIGH' },
  taxonomy: { falseUrgency: 85, authorityMimicry: 45 },
  workspaceId: 'ws-demo',
}, 'http://localhost:3006')

// result.alternatives[0] is the best rewrite, ranked by cognitive improvement
```

**Note:** `requestRewrites` accepts the rewrite service URL as a second argument (default: `http://localhost:3006`). In Vite apps, read `import.meta.env.VITE_COGNITIVE_REWRITE_URL` and pass it through — see [rewriteApi.ts](../../apps/dashboard/src/api/rewriteApi.ts).

## Build

```bash
pnpm --filter @cognarc/types build
```

# CLAUDE.md — CognArc Project Context

> This file is read by Claude Code at the start of every session.
> It provides the project architecture, conventions, and constraints
> needed to work on CognArc without re-explaining context each time.

---

## What CognArc Is

CognArc is an **agentic cognitive-behavioral AI evaluation and alignment platform**.
It monitors AI systems and digital experiences continuously for cognitive load,
comprehension failure, trust erosion, and manipulation — powered by TRIBE v2,
a tri-modal foundation model (Meta AI Research) trained on 1,000+ hours of fMRI
data across 720 subjects.

The platform serves five buyer types: AI Engineers, Product Managers, Growth &
Marketing teams, Product Designers, and Red Team / AI Safety functions.

**This is a portfolio project.** The goal is a working platform demonstrating
agentic AI system design with structured human oversight.

---

## The One Architectural Rule

> **TRIBE is not CognArc. TRIBE is the engine CognArc calls.**

Every cognitive score in the system comes from **one place**:
`services/cognitive-scoring` at `POST /score`.

No other service ever calls TRIBE directly.
No other service imports from `services/cognitive-scoring/src/adapters/`.
This boundary is what makes swapping mock for TRIBE a one-line config change.

**If you are about to call TRIBE from anywhere other than `services/cognitive-scoring`,
stop and route through the scoring service instead.**

---

## The Three Governance Rules

These are permanent constraints. They apply to every file in every service.
They are encoded in tests. Do not work around them.

1. **The agent never modifies its own governance.**
   Trust Gradient config, audit log structure, and kill switch behaviour
   are human-configured. The agent enforces them. The agent never edits them.

2. **Act-Gated actions never execute without recorded human approval.**
   No timeout-based auto-approval. No fallback execution. No exceptions.
   If an action is `ACT_GATED`, it waits for `ActGatedWorkflow.approve()`.

3. **The audit log is append-only.**
   No `UPDATE`. No `DELETE`. Not in application code. Not in migrations.
   Not via direct DB access. The PostgreSQL trigger enforces this at the
   database level. Tests verify it. Never remove the trigger.

---

## Monorepo Structure

```
cognarc/
├── services/
│   ├── cognitive-scoring/     # TRIBE adapter + mock engine — THE ONLY SCORER
│   ├── behavioral-sdk/        # JS/mobile SDK (<8KB gzipped, no PII)
│   ├── analytics-connectors/  # Segment, Amplitude, Mixpanel, PostHog, GA4
│   ├── guardrail-engine/      # CI/CD gate, prompt gate, manipulation scanner
│   │   ├── cicd/              # GitHub Actions, GitLab CI, Jenkins plugins
│   │   ├── prompt-gate/       # Prompt Evaluation Gate + regression monitor
│   │   ├── manipulation/      # 6-category manipulation taxonomy engine
│   │   └── red-team/          # Post-remediation monitor + evidence packages
│   ├── trust-gradient/        # Zone classifier, audit log, kill switch
│   └── api-gateway/           # Unified REST API, auth, rate limiting
├── packages/
│   ├── cognarc-sdk/           # Publishable JS behavioral SDK (npm)
│   ├── cognarc-python/        # Publishable Python client (pip)
│   └── cognarc-types/         # Shared TypeScript types
├── apps/
│   ├── dashboard/             # React 18 + Vite + Tailwind + Recharts
│   └── landing/               # Public marketing site (React + Tailwind)
├── config/
│   ├── .cognarc.yml           # Policy-as-code (human-authored, never agent-modified)
│   └── cognarc.schema.json    # JSON schema for .cognarc.yml
├── tests/
│   └── integration/           # Full end-to-end test suite
├── infrastructure/
│   └── gcp/                   # GCP Cloud Run deployment for TRIBE inference
├── docker-compose.yml
├── turbo.json
└── CLAUDE.md                  # This file
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript throughout (strict mode) |
| Runtime | Node.js 18+ |
| Package manager | pnpm workspaces |
| Build orchestration | Turborepo |
| Backend framework | Express or Fastify (per service) |
| Database | PostgreSQL (audit log, baselines, workspaces) |
| Cache / queue | Redis (kill switch state, action queue, rate limits) |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, React Query |
| Testing | Jest + supertest (unit/integration), Playwright (E2E) |
| Containers | Docker + docker-compose |
| ML inference | Python 3.10+ + FastAPI (TRIBE inference server) |
| Cloud | GCP Cloud Run with GPU (NVIDIA L4) for TRIBE |

---

## Cognitive Scoring Engine Modes

Controlled by the `COGNARC_SCORING_ENGINE` environment variable:

| Value | Engine | When to use |
|---|---|---|
| `mock` | `MockScoringEngine` | **Default. All development and CI.** |
| `tribe-local` | `TRIBEAdapter → localhost:8080` | Testing TRIBE integration locally |
| `tribe-gcp` | `TRIBEAdapter → GCP_TRIBE_ENDPOINT` | Demo and production |

**Always develop against `mock` unless you are specifically working on TRIBE integration.**
The mock returns plausible scores that vary meaningfully with input characteristics.

---

## The Four Trust Gradient Zones

Every agent action is classified into one of these zones before it executes.
Classification is loaded from `.cognarc.yml`. The agent cannot change its own zone.

| Zone | Agent Behaviour | Human Role |
|---|---|---|
| `OBSERVE` | Monitors, scores, labels. No action. | Reviews dashboard at will |
| `RECOMMEND` | Generates analysis + ranked options. | Makes the decision |
| `ACT_AUTO` | Executes autonomously. Logs. Reversible 24hrs. | Reviews audit log |
| `ACT_GATED` | Prepares decision package. Hard stop. | Must explicitly approve |

**Adding a new agent action?** You must assign it a zone in the action registry
in `services/trust-gradient/src/registry.ts` before the action can execute.
Unregistered actions throw `UnregisteredActionError`.

---

## Key Interfaces

### CognitiveScoreRequest / Response
Defined in `packages/cognarc-types/src/scoring.ts`.
All services import from here. Never redefine locally.

```typescript
// The contract that never changes regardless of which engine is behind it
interface CognitiveScoreRequest {
  stimulus_type: "text" | "image" | "audio" | "video"
  content: string | Buffer
  workspace_id: string
  options?: { manipulation_check?: boolean; population_model?: boolean; async?: boolean }
}

interface CognitiveScoreResponse {
  cognitive_load: number            // 0-100
  comprehension_confidence: number  // 0-100
  emotional_valence: number         // 0-100
  trust_coherence: number           // 0-100
  manipulation_risk: number         // 0-100
  cognitive_risk: "LOW" | "MEDIUM" | "HIGH"
  confidence_intervals: Record<string, { low: number; high: number }>
  top_brain_regions: string[]
  explanation: string
  model_version: string
  latency_ms: number
}
```

### AuditEntry
Defined in `packages/cognarc-types/src/audit.ts`.

```typescript
interface AuditEntry {
  id: string                          // UUID, generated at append time
  timestamp: string                   // ISO 8601
  workspace_id: string
  action_type: AgentActionType
  oversight_zone: "OBSERVE" | "RECOMMEND" | "ACT_AUTO" | "ACT_GATED"
  triggering_scores?: CognitiveScoreResponse
  policy_rule_applied: string         // from .cognarc.yml
  alternatives_considered?: string[]
  authorising_human_or_policy: string // human ID or "policy:v1.2"
  outcome: string
}
// APPEND ONLY. No update. No delete. Enforced by DB trigger.
```

---

## Coding Conventions

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any`. Use `unknown` and narrow explicitly.
- All async functions return `Promise<T>`, never implicit void
- Errors are typed: extend `CognArcError` base class, never throw raw strings

### Services
- Each service exposes a REST API. No direct imports between services at runtime.
- Services communicate via HTTP (through `api-gateway` for external, direct for internal)
- All service-to-service calls go through typed clients in `packages/cognarc-types`

### Environment variables
- Never hardcode endpoints, credentials, or thresholds
- Access via `config/env.ts` in each service (validates with Zod on startup)
- Missing required env vars cause immediate startup failure with clear error

### Tests
- Unit tests: `src/__tests__/` colocated with source
- Integration tests: `tests/integration/`
- Every new agent action must have a test that verifies its zone classification
- Audit log immutability must be tested at the DB level, not just application level
- Run before every commit: `pnpm test`

### Naming
- Services: kebab-case directories
- TypeScript: PascalCase classes, camelCase functions/variables, SCREAMING_SNAKE_CASE constants
- Database tables: snake_case
- API routes: kebab-case paths, camelCase JSON fields

---

## Files You Should Never Modify Directly

| File / Path | Reason |
|---|---|
| `services/trust-gradient/src/db/migrations/001_audit_log_immutability.sql` | The PostgreSQL trigger preventing UPDATE/DELETE on audit_log. Modifying this breaks the governance architecture. |
| `packages/cognarc-types/src/scoring.ts` (interfaces only) | The CognitiveScoreRequest/Response contract. Changing these breaks all services. Add fields; never remove or rename. |
| `.cognarc.yml` (in tests) | Test fixtures rely on specific threshold values. Change test fixtures, not the schema defaults. |
| `services/trust-gradient/src/registry.ts` (existing zone assignments) | Downgrading a zone assignment (e.g. ACT_GATED → ACT_AUTO) requires explicit justification and PM approval, not a casual edit. |

---

## TRIBE v2 Reference

- **Model:** `facebook/tribev2` on HuggingFace
- **License:** CC-BY-NC-4.0 — non-commercial use only. Portfolio use permitted.
- **Architecture:** LLaMA 3.2 (text) + V-JEPA2 (video) + Wav2Vec-BERT (audio) → unified Transformer
- **Output:** Cortical surface predictions on fsaverage5 mesh (~20,000 vertices)
- **ROI mapping:** `services/cognitive-scoring/src/tribe/roi-mapping.ts`
  - `cognitive_load` ← dorsolateral prefrontal + anterior cingulate cortex
  - `comprehension_confidence` ← left temporal language network (Wernicke's area)
  - `emotional_valence` ← limbic system (amygdala + ventromedial PFC)
  - `trust_coherence` ← medial PFC + posterior cingulate (default mode network)
- **Requires:** HuggingFace account + LLaMA 3.2 gated model access (free)
- **GCP deployment:** Cloud Run, NVIDIA L4, scale-to-zero. See `infrastructure/gcp/`

---

## Current Build Status

Update this section as prompts are completed:

- [x] P-001 · Monorepo scaffold
- [x] P-002 · Cognitive Scoring Service interface
- [x] P-003 · Trust Gradient Engine
- [x] P-004 · TRIBE v2 HuggingFace integration
- [x] P-005 · GCP Cloud Run deployment
- [x] P-006 · Behavioral SDK
- [x] P-007 · Analytics connectors
- [x] P-008 · CI/CD Cognitive Gate
- [x] P-009 · Prompt Evaluation Gate
- [x] P-010 · Manipulation Taxonomy Engine
- [x] P-011 · Dashboard
- [x] P-012 · Zero-Traffic A/B Engine
- [x] P-013 · Eval Platform Integration
- [x] P-014 · Red Team Safety Agent
- [x] P-015 · Fine-Tuning Pipeline
- [x] P-016 · Integration Test Suite
- [x] P-017 · Landing Page

---

## Open Questions (check before building)

These are unresolved decisions from the PRD. Do not implement a solution
that forecloses an option before these are decided.

- **OQ-001:** Should free-tier hook be Prompt Regression Monitor (API key only)
  or CI/CD Gate (requires repo access)?
- **OQ-003:** Minimum behavioral session volume before fine-tuning loop
  produces net positive accuracy? ML team estimate needed.
- **OQ-008:** Does analytics write-back of cognitive labels constitute
  automated profiling under GDPR Article 22 for EU workspaces?
  Legal review required before EU launch.
- **OQ-009:** Does Cognitive Funnel Mapper need a dedicated data model
  or can it run on aggregated alignment score queries?

---

*CognArc · CLAUDE.md · Keep this file current as the project evolves.*

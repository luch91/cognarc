# CognArc — Claude Code Prompt Pack

**Agentic Cognitive-Behavioral AI Evaluation Platform**  
*18 prompts (P-000 to P-017) · Zero to working platform · Powered by TRIBE v2*

---

## Overview

| | |
|---|---|
| **Purpose** | Step-by-step Claude Code prompts to build CognArc from zero to a working platform |
| **Order** | Run prompts in sequence P-001 through P-017. Each builds on the previous. |
| **Engine default** | All prompts default to `COGNARC_SCORING_ENGINE=mock`. Switch to `tribe-local` after P-004. |
| **License note** | TRIBE v2 is CC-BY-NC-4.0 (non-commercial). Portfolio use is permitted. |
| **GCP note** | P-005 deploys to GCP Cloud Run GPU. Requires $300 free credit account. Cost ~$20–30/month at portfolio scale. |
| **HuggingFace** | Model: `facebook/tribev2` · Requires HF account + LLaMA 3.2 gated model access (free, instant approval) |

---

## Before You Start

1. Create an empty directory for the project
2. Install Node.js 18+, Python 3.10+, Docker, pnpm
3. **Copy `CLAUDE.md` into the root of your project directory first** — Claude Code reads this at the start of every session
4. Create a HuggingFace account and accept the LLaMA 3.2 terms
5. Run the TRIBE v2 Colab notebook once to understand the output format
6. Open a Claude Code session in your project directory
7. Run P-000 first, then P-001 through P-017 in order. Do not skip ahead.

---

## Build Sequence

| Prompts | What Gets Built |
|---|---|
| P-000 | CLAUDE.md — project context file Claude Code reads every session |
| P-001 to P-003 | Foundation: monorepo, cognitive scoring interface, trust gradient engine |
| P-004 to P-005 | TRIBE v2 integration and GCP Cloud Run deployment |
| P-006 to P-007 | Behavioral SDK and analytics connectors |
| P-008 to P-009 | CI/CD gate and prompt evaluation gate |
| P-010 | Manipulation taxonomy engine |
| P-011 | Dashboard (internal, five buyer surfaces) |
| P-012 to P-013 | Zero-traffic A/B engine and eval platform integration |
| P-014 | Red team safety agent |
| P-015 | TRIBE fine-tuning pipeline (Phase 3, build last) |
| P-016 | Full integration test suite (run after every prompt) |
| P-017 | Landing page (public-facing marketing site) |

---

## Environment Setup

Copy to `.env` and fill in real values before running any prompt:

```bash
# Scoring engine: mock | tribe-local | tribe-gcp
COGNARC_SCORING_ENGINE=mock

# HuggingFace (required for TRIBE v2 + LLaMA 3.2 access)
HF_TOKEN=hf_your_token_here

# GCP (required for P-005 deployment)
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
GCP_TRIBE_ENDPOINT=https://tribe-inference-xxx-uc.a.run.app

# Database
COGNARC_DB_URL=postgresql://cognarc:password@localhost:5432/cognarc
COGNARC_REDIS_URL=redis://localhost:6379

# Audit log WORM enforcement
COGNARC_AUDIT_WORM=true

# Analytics connectors (add as you connect platforms)
# SEGMENT_WEBHOOK_SECRET=whsec_xxx
# AMPLITUDE_API_KEY=xxx
# SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx
```

---

## Service Port Map

| Service | Port | Responsibilities |
|---|---|---|
| cognitive-scoring | :3001 | TRIBE adapter, mock engine, /score endpoint, A/B engine |
| behavioral-sdk | :3002 | JS SDK build, ingestion endpoint, event processing |
| analytics-connectors | :3003 | Segment, Amplitude, Mixpanel, PostHog, GA4 write-back |
| guardrail-engine | :3004 | CI/CD gate, prompt gate, runtime agent, manipulation scanner |
| trust-gradient | :3005 | Zone classifier, audit log, kill switch, Act-Gated workflow |
| api-gateway | :3000 | Unified REST API, auth, rate limiting, workspace routing |
| dashboard | :5173 | React dashboard (Vite dev server) |

---

## Environment Variables Reference

| Variable | Example Value | Purpose |
|---|---|---|
| `COGNARC_SCORING_ENGINE` | `mock \| tribe-local \| tribe-gcp` | Selects which inference engine to use. Default: mock |
| `GCP_TRIBE_ENDPOINT` | `https://tribe-xxx.run.app` | GCP Cloud Run endpoint for TRIBE inference |
| `HF_TOKEN` | `hf_xxxxx` | HuggingFace access token (required for LLaMA 3.2 gated access) |
| `COGNARC_DB_URL` | `postgresql://...` | PostgreSQL connection string (audit log + baselines) |
| `COGNARC_REDIS_URL` | `redis://...` | Redis URL (kill switch state + action queue) |
| `COGNARC_AUDIT_WORM` | `true \| false` | Enable WORM enforcement on audit log. Default: true |
| `COGNARC_POLICY_PATH` | `.cognarc.yml` | Path to policy-as-code config file |
| `SEGMENT_WEBHOOK_SECRET` | `whsec_xxxxx` | Webhook signing secret from Segment dashboard |
| `AMPLITUDE_API_KEY` | `xxxxx` | Amplitude API key for write-back |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/...` | Slack webhook for alert notifications |

---

## Running the Full Stack

```bash
# Start all services
docker-compose up -d

# Run all tests
pnpm test

# Run integration tests only
pnpm test:integration

# Switch to local TRIBE inference
COGNARC_SCORING_ENGINE=tribe-local pnpm dev

# Switch to GCP TRIBE inference
COGNARC_SCORING_ENGINE=tribe-gcp pnpm dev

# Check SDK bundle size
pnpm --filter cognarc-sdk build && pnpm --filter cognarc-sdk size

# Deploy TRIBE to GCP
cd infrastructure/gcp && ./setup.sh
gcloud builds submit --config cloudbuild.yaml
```

---

## The Two Rules

> **The Key Architectural Rule**  
> TRIBE is not CognArc. TRIBE is the engine CognArc calls. Every cognitive score in the system comes from one place: the Cognitive Scoring Service at `/score`. No other service ever calls TRIBE directly. This single boundary is what makes swapping mock for TRIBE a one-line change, what makes the platform testable without GPU, and what makes future model replacements safe.

> **The Governance Rule — Three permanent constraints:**  
> 1. The agent never modifies its own governance (Trust Gradient config, audit log, kill switch)  
> 2. Act-Gated actions never execute without recorded human approval. No timeout-based auto-approval.  
> 3. The audit log is append-only. No UPDATE. No DELETE. No exceptions.

---

## The Prompts

---

## P-000 · Create the CLAUDE.md Context File

**Run this before anything else.** This creates the `CLAUDE.md` file that Claude Code
reads at the start of every session. Without it, every session starts cold.

```
Create a CLAUDE.md file in the root of this project directory.

CLAUDE.md is the project context file that Claude Code reads automatically
at the start of every session. It must contain everything needed to work
on CognArc without re-explaining the architecture each time.

Include the following sections:

1. WHAT COGNARC IS
   One paragraph: agentic cognitive-behavioral AI evaluation platform,
   powered by TRIBE v2 (Meta AI Research), serves five buyer types
   (Engineers, PMs, Growth, Designers, Red Team), portfolio project.

2. THE ONE ARCHITECTURAL RULE
   TRIBE is not CognArc. TRIBE is the engine CognArc calls.
   Every cognitive score comes from services/cognitive-scoring at POST /score.
   No other service ever calls TRIBE directly.
   This boundary makes swapping mock for TRIBE a one-line config change.

3. THE THREE GOVERNANCE RULES (permanent, encoded in tests)
   a. The agent never modifies its own governance
   b. Act-Gated actions never execute without recorded human approval. No timeout-based auto-approval. Ever.
   c. The audit log is append-only. No UPDATE. No DELETE. Not in code, not in migrations, not directly.

4. MONOREPO STRUCTURE
   Full directory tree with one-line descriptions per service/package/app.

5. TECHNOLOGY STACK
   TypeScript throughout, pnpm workspaces, Turborepo, Express/Fastify,
   PostgreSQL, Redis, React 18 + Vite + Tailwind + Recharts,
   Jest + Playwright, Docker, GCP Cloud Run for TRIBE.

6. SCORING ENGINE MODES
   COGNARC_SCORING_ENGINE=mock|tribe-local|tribe-gcp
   Table: value, engine class, when to use.
   Default is always mock. Only switch for TRIBE-specific work.

7. THE FOUR TRUST GRADIENT ZONES
   Table: OBSERVE / RECOMMEND / ACT_AUTO / ACT_GATED
   Agent behaviour and human role for each.
   Note: unregistered actions throw UnregisteredActionError.

8. KEY INTERFACES
   CognitiveScoreRequest, CognitiveScoreResponse, and AuditEntry
   TypeScript definitions with field comments.
   Note: imported from packages/cognarc-types, never redefined locally.

9. CODING CONVENTIONS
   TypeScript strict mode, no any, typed errors extending CognArcError,
   services communicate via HTTP not direct imports,
   env vars validated with Zod on startup,
   test coverage requirements for new agent actions.

10. FILES TO NEVER MODIFY DIRECTLY
    Table: file path + reason for each protected file.
    Include the audit log immutability migration, scoring interfaces,
    and trust gradient zone registry.

11. TRIBE v2 REFERENCE
    Model: facebook/tribev2, License: CC-BY-NC-4.0,
    Architecture summary, output format (fsaverage5 cortical mesh),
    ROI mapping for each of the four cognitive scores,
    HuggingFace access requirements.

12. CURRENT BUILD STATUS
    Checklist of P-000 through P-017 with checkboxes.
    All unchecked initially.

13. OPEN QUESTIONS
    Four unresolved PRD decisions that should not be pre-empted by
    implementation choices (OQ-001, OQ-003, OQ-008, OQ-009).

Format: clean markdown, no decorative elements.
Tone: direct, technical, reference-grade.
Length: comprehensive but scannable — use tables and code blocks
wherever a list or prose would be less clear.
```

> **Claude Code Tip:** After Claude Code generates `CLAUDE.md`, read it fully before continuing. If anything about the architecture or governance rules is unclear or incomplete, correct it now — this file drives every subsequent session.

---

## Section 1 · Project Setup & Core Infrastructure

*These three prompts build the foundation. Run them first. They establish the monorepo, the cognitive scoring interface boundary, and the trust gradient governance layer. Nothing else can be built correctly without these in place.*

---

### P-001 · Initialise the CognArc Project

**Category:** Infrastructure  
**Purpose:** Scaffold the full CognArc monorepo with all service directories, config files, and dependency setup in one shot.

```
Create a monorepo for CognArc — an agentic cognitive-behavioral AI evaluation platform. Scaffold the following structure:

cognarc/
├── services/
│   ├── cognitive-scoring/     # TRIBE adapter + mock engine
│   ├── behavioral-sdk/        # JS/mobile SDK
│   ├── analytics-connectors/  # Segment, Amplitude, Mixpanel, PostHog, GA4
│   ├── guardrail-engine/      # CI/CD gate, prompt eval gate, runtime agent
│   ├── trust-gradient/        # Oversight zone classifier + audit log
│   └── api-gateway/           # Unified REST API
├── packages/
│   ├── cognarc-sdk/           # JS behavioral SDK (publishable npm package)
│   └── cognarc-types/         # Shared TypeScript types across services
├── apps/
│   ├── dashboard/             # React dashboard (Vite)
│   └── docs/                  # API documentation site
├── config/
│   ├── .cognarc.yml           # Policy-as-code template
│   └── cognarc.schema.json    # JSON schema for .cognarc.yml
├── docker-compose.yml
├── turbo.json                 # Turborepo config
└── package.json               # Root workspace

Use TypeScript throughout. Use pnpm workspaces. Use Turborepo for task orchestration.
Each service should have: src/, tests/, Dockerfile, package.json, tsconfig.json.
Generate realistic placeholder README.md files for each service explaining its role.
Set up ESLint + Prettier config at root level.
Add a docker-compose.yml that wires all services together with Redis and PostgreSQL.
```

> **Claude Code Tip:** Run this in an empty directory. Claude Code will create all files and install dependencies. Review the generated `turbo.json` pipeline before running builds.

---

### P-002 · Define the Cognitive Scoring Service Interface

**Category:** Infrastructure  
**Purpose:** Create the single internal API contract that every CognArc service uses to request cognitive scores — the boundary that makes swapping mock for TRIBE a one-line change.

```
Create the Cognitive Scoring Service in services/cognitive-scoring/.

This service is the ONLY place in the platform that knows how to produce cognitive scores.
All other services call this service. No other service ever calls TRIBE directly.

Implement:

1. The core TypeScript interface:
interface CognitiveScoreRequest {
  stimulus_type: "text" | "image" | "audio" | "video"
  content: string | Buffer
  workspace_id: string
  options?: {
    manipulation_check?: boolean
    population_model?: boolean
    async?: boolean
  }
}

interface CognitiveScoreResponse {
  cognitive_load: number              // 0-100
  comprehension_confidence: number    // 0-100
  emotional_valence: number           // 0-100
  trust_coherence: number             // 0-100
  manipulation_risk: number           // 0-100
  cognitive_risk: "LOW" | "MEDIUM" | "HIGH"
  confidence_intervals: Record<string,{low:number,high:number}>
  top_brain_regions: string[]
  explanation: string
  model_version: string
  latency_ms: number
}

2. An abstract base class ScoringEngine with a score() method

3. A MockScoringEngine that:
   - Returns plausible scores that vary meaningfully with input
   - Long complex text → higher cognitive_load
   - Urgency language → higher manipulation_risk
   - Short clear text → higher comprehension_confidence
   - Returns model_version: "mock-v1"

4. A TRIBEAdapter stub that:
   - Has a constructor accepting a GCP endpoint URL
   - Returns model_version: "tribe-v2-stub"
   - Throws NotImplementedError with helpful message

5. A FastAPI (or Express) REST endpoint POST /score
   - Validates input with Zod
   - Routes to the configured engine
   - Returns response in <600ms (enforced by test)
   - Logs every request to stdout in structured JSON

6. Unit tests for the mock engine covering:
   - Urgency language detection
   - Latency under 600ms
   - Schema validation of response
```

> **Claude Code Tip:** After generation, run the tests immediately with `npm test`. The <600ms latency test will catch any async issues early.

---

### P-003 · Set Up the Trust Gradient Engine

**Category:** Infrastructure  
**Purpose:** Build the oversight classification system that governs every agent action — the structural core of CognArc's governance architecture.

```
Create the Trust Gradient Engine in services/trust-gradient/.

The Trust Gradient Engine classifies every potential agent action into one of four
oversight zones BEFORE the action executes. This is non-negotiable governance infrastructure.

Four zones:
- OBSERVE: Fully autonomous. Agent monitors and labels. No action taken.
- RECOMMEND: Agent analyzes and surfaces recommendation. Human decides.
- ACT_AUTO: Agent executes low-stakes action autonomously. Logged. Reversible 24hrs.
- ACT_GATED: Hard human approval required. No timeout-based auto-approval. Ever.

Implement:

1. Action registry — a typed map of every possible agent action to its zone:
   type AgentActionType =
     | "SCORE_STIMULUS"
     | "LABEL_BEHAVIORAL_EVENT"
     | "POST_PR_COMMENT"
     | "SEND_SLACK_ALERT"
     | "FAIL_CICD_BUILD"
     | "SOFT_BLOCK_OUTPUT"
     | "HARD_BLOCK_OUTPUT"
     | "DEPLOY_PROMPT_REWRITE"
     | "EXECUTE_FINE_TUNING"
     | "TRANSMIT_REGULATORY_REPORT"
     | "GENERATE_RECOMMENDATION"

2. TrustGradientEngine class:
   - classify(action: AgentActionType, context: WorkspaceContext): Zone
   - Zone loaded from .cognarc.yml config
   - Agent CANNOT override its own zone classification
   - Override attempt throws TrustGradientViolation error (logged to audit)

3. Immutable AuditLog class:
   - append(entry: AuditEntry): void  — append-only, never update/delete
   - query(filters): AuditEntry[]
   - AuditEntry must include: timestamp, actionType, zone, triggeringScores,
     policyRuleApplied, alternativesConsidered, authorisingHumanOrPolicy, outcome
   - Backed by PostgreSQL with a trigger that prevents UPDATE/DELETE

4. GlobalKillSwitch:
   - activate(workspaceId: string): Promise<void>  — must complete in <5 seconds
   - isActive(workspaceId: string): boolean
   - deactivate(workspaceId: string, humanId: string): Promise<void>
   - When active: all ACT_AUTO and ACT_GATED actions throw KillSwitchActiveError
   - OBSERVE continues passively

5. ActGatedWorkflow:
   - createDecisionPackage(action, evidence, alternatives): DecisionPackage
   - submitForApproval(package): string  — returns approvalRequestId
   - approve(approvalRequestId, humanId): void
   - reject(approvalRequestId, humanId, reason): void
   - No action executes without recorded human approval

Write comprehensive tests. The AuditLog immutability test must attempt an UPDATE
and verify it fails.
```

> **Claude Code Tip:** The PostgreSQL trigger for audit log immutability is critical. Verify it with a direct DB test, not just through the application layer.

---

## Section 2 · TRIBE v2 Integration & GCP Deployment

*Wire the real TRIBE v2 model from HuggingFace and deploy it to GCP Cloud Run. After P-004 you can switch `COGNARC_SCORING_ENGINE` from mock to `tribe-local`. After P-005 you have a persistent GCP endpoint for demos.*

---

### P-004 · Wire TRIBE v2 from HuggingFace

**Category:** Cognition  
**Purpose:** Connect CognArc's Cognitive Scoring Service to the real TRIBE v2 model from `facebook/tribev2` on HuggingFace.

```
Update services/cognitive-scoring/ to support real TRIBE v2 inference.

TRIBE v2 is at: huggingface.co/facebook/tribev2
License: CC-BY-NC-4.0 (non-commercial use only)

The model output is cortical surface predictions on fsaverage5 mesh (~20k vertices).
CognArc needs to translate these into four cognitive scores (0-100 each).

Implement:

1. TRIBEAdapter class replacing the stub:
   - Accepts endpoint: string (GCP Cloud Run URL in production,
     local inference server URL in development)
   - POST /predict with stimulus, returns raw cortical predictions
   - Maps cortical vertex activations to CognArc's four scores:
     * cognitive_load: mean activation in dorsolateral prefrontal + anterior cingulate ROIs
     * comprehension_confidence: activation in left temporal language network (Wernicke's area)
     * emotional_valence: limbic system activation (amygdala + ventromedial PFC)
     * trust_coherence: medial PFC + posterior cingulate (default mode network coherence)
   - Returns model_version: "tribe-v2"
   - Implements the same ScoringEngine interface as MockScoringEngine

2. ROI mapping constants file:
   - Define the fsaverage5 vertex indices for each cognitive region
   - Document which brain regions map to which cognitive signals
   - Make region definitions configurable (researchers may want to adjust)

3. Local inference server setup script:
   - Python script that loads TRIBE v2 from HuggingFace cache
   - Requires: huggingface-cli login (for LLaMA 3.2 gated access)
   - Serves on localhost:8080
   - Accepts the same request schema as the GCP endpoint
   - Include setup instructions in README

4. Engine selection via environment variable:
   COGNARC_SCORING_ENGINE=mock|tribe-local|tribe-gcp
   - mock: MockScoringEngine (default for development)
   - tribe-local: TRIBEAdapter pointing to localhost:8080
   - tribe-gcp: TRIBEAdapter pointing to GCP_TRIBE_ENDPOINT env var

5. Accuracy validation test:
   - Test that TRIBE adapter scores on known inputs are within
     expected ranges based on the TRIBE v2 paper's validation results
   - Flag test as @requires-tribe so it is skipped in CI without TRIBE
```

> **Claude Code Tip:** Start with `COGNARC_SCORING_ENGINE=mock` for all other development. Only switch to `tribe-local` when specifically testing the TRIBE integration. Never hardcode the endpoint URL.

---

### P-005 · Deploy TRIBE to GCP Cloud Run
Read CLAUDE.md
**Category:** Infrastructure  
**Purpose:** Package TRIBE v2 as a Docker container and deploy to GCP Cloud Run with GPU support using the $300 free credit.

```
Create the GCP deployment configuration for TRIBE v2 inference.

Target: GCP Cloud Run with GPU (NVIDIA L4)
Cost target: <$30/month for portfolio-scale usage (scale-to-zero when idle)

Create the following files:

1. services/cognitive-scoring/tribe-inference/
   ├── Dockerfile
   │   - Base: nvidia/cuda:12.3-runtime-ubuntu22.04
   │   - Python 3.10+
   │   - Install tribev2 from HuggingFace
   │   - Install FastAPI + uvicorn
   │   - Pre-download model weights during build (requires HF_TOKEN build arg)
   │   - Expose port 8080
   ├── server.py
   │   - FastAPI app
   │   - POST /predict endpoint matching TRIBEAdapter's request schema
   │   - GET /health endpoint
   │   - Loads model once at startup (not per request)
   │   - Returns predictions in CognArc's expected format
   └── cloudbuild.yaml
       - Builds Docker image
       - Pushes to GCP Artifact Registry
       - Deploys to Cloud Run with:
         * --gpu=1 --gpu-type=nvidia-l4
         * --concurrency=1
         * --min-instances=0 (scale to zero when idle)
         * --max-instances=3
         * --memory=16Gi
         * --cpu=4

2. infrastructure/gcp/
   ├── setup.sh
   │   - Creates GCP project (or uses existing)
   │   - Enables required APIs: run.googleapis.com, artifactregistry.googleapis.com
   │   - Creates Artifact Registry repository
   │   - Sets up IAM service account for Cloud Run
   │   - Estimated cost warning printed to stdout
   └── README.md
       - Step-by-step setup from zero GCP account
       - HuggingFace token setup instructions
       - Expected credit burn rate
       - How to verify deployment succeeded

3. services/cognitive-scoring/src/adapters/TRIBEGCPAdapter.ts
   - Extends TRIBEAdapter
   - Adds GCP authentication (service account or workload identity)
   - Adds retry logic with exponential backoff (handles cold starts)
   - Cold start timeout: 60 seconds
   - Warm request timeout: 10 seconds

Include cost estimation comments throughout.
```

> **Claude Code Tip:** Run `gcloud auth login` before the setup script. The model download during container build can take 10–15 minutes. Set an alarm to avoid accidental credit burn if you leave a VM running.

---

## Section 3 · Behavioral SDK & Analytics

*Build the behavioral sensing layer. The SDK captures cognitive friction signals from real users. The analytics connectors route those signals into and out of your existing analytics stack.*

---

### P-006 · Build the Behavioral SDK

**Category:** Analytics  
**Purpose:** Create the lightweight JS SDK that captures cognitive friction signals from user sessions without collecting PII.

```
Create packages/cognarc-sdk/ — the CognArc behavioral instrumentation SDK.

Constraints:
- Must be <8KB gzipped
- Must impose <2ms P99 performance overhead
- Must capture NO PII
- Must work with React 16+, Vue 3+, Angular 14+, vanilla JS
- Must be tree-shakeable ES module

Implement:

1. Core event capture (no PII):
   - time_on_element: dwell time on interactive elements
   - scroll_velocity_change: significant velocity changes (frustration signal)
   - field_reentry_count: form field edited 3+ times (working memory overload)
   - click_error_rate: clicks on non-interactive areas (confusion signal)
   - session_abandonment: user leaves without completing primary action
   - rage_click: 3+ clicks in same area within 500ms
   - scroll_reversal: significant backward scroll (comprehension failure)

2. Event-to-Cognition translation (built into SDK):
   const COGNITIVE_LABELS = {
     rage_click: "confusion",
     field_reentry_count: "working_memory_overload",
     scroll_reversal: "comprehension_failure",
     session_abandonment_post_modal: "trust_erosion_trigger",
   }

3. CognArcSDK class:
   init(config: {
     workspaceId: string
     endpoint: string
     sessionOptOut?: boolean
     sampleRate?: number  // 0-1, default 1.0
   })
   track(eventType: string, metadata?: Record<string,unknown>): void
   optOut(): void
   optIn(): void

4. Auto-instrumentation:
   - cognarc.autoInstrument() — attaches all listeners automatically
   - Works by adding passive event listeners
   - MutationObserver for DOM changes
   - PerformanceObserver for navigation timing

5. Batching + transmission:
   - Buffer events for 500ms then flush
   - Use navigator.sendBeacon for reliability on page unload
   - Retry failed transmissions up to 3x
   - Queue events during network outages, flush on reconnect

6. Bundle size enforcement:
   - Add bundle size check to CI: fail if gzipped > 8192 bytes
   - Use rollup for bundling with terser minification

Write unit tests + integration test with a headless browser (Playwright).
```

> **Claude Code Tip:** Use `size-limit` package for the bundle size CI check. Run `pnpm build && pnpm size` to verify <8KB before committing. The performance overhead test needs to run in a real browser environment — use Playwright.

---

### P-007 · Build Analytics Platform Connectors

**Category:** Analytics  
read CLAUDE.md
**Purpose:** Create bidirectional connectors to Segment, Amplitude, Mixpanel, PostHog, and GA4 with cognitive label write-back.

```
Create services/analytics-connectors/ with connectors to all five analytics platforms.

CognArc enriches analytics platforms — it does not replace them.
Data flow:
  Analytics Platform → CognArc (events IN via webhook/API)
  CognArc → Analytics Platform (cognitive labels OUT via write-back API)

Implement one connector per platform, each implementing this interface:

interface AnalyticsConnector {
  name: string
  connect(credentials: Record<string,string>): Promise<void>
  disconnect(): Promise<void>
  ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]>
  writeBack(events: EnrichedEvent[]): Promise<WriteBackResult>
  testConnection(): Promise<boolean>
}

1. SegmentConnector
   - Ingest via webhook (validate Segment webhook signature)
   - Write-back: Segment Track API with cognitive properties

2. AmplitudeConnector
   - Ingest via Amplitude Data Export API or webhook
   - Write-back: Amplitude HTTP API v2
   - Cognitive properties added as user AND event properties

3. MixpanelConnector
   - Ingest via Mixpanel webhook
   - Write-back: Mixpanel Import API

4. PostHogConnector
   - Ingest via PostHog webhook
   - Write-back: PostHog Capture API

5. GA4Connector
   - Write-back only via Measurement Protocol v2
   - Cognitive labels as custom parameters

For each connector implement:
   - OAuth flow or API key setup
   - Rate limit handling with exponential backoff
   - Retry on failure (3x with backoff)
   - Write-back failure does NOT block event processing
   - All credentials stored encrypted, never logged

Include a ConnectorManager that:
   - Manages all active connectors per workspace
   - Routes incoming events to cognitive scoring
   - Dispatches enriched events to write-back
   - Tracks connector health + last-sync timestamp
```

> **Claude Code Tip:** Test each connector against its sandbox environment before production. The write-back latency test (cognitive labels appearing within 5 seconds) should run against live sandbox environments in CI.

---

## Section 4 · Guardrail Enforcement

*CognArc becomes an enforcement layer, not just an evaluation tool. The CI/CD gate fails builds that breach cognitive standards. The Prompt Evaluation Gate blocks manipulative prompts before they reach the LLM.*

---

### P-008 · Build the CI/CD Cognitive Gate

**Category:** Guardrails  
**Purpose:** Create GitHub Actions, GitLab CI, and Jenkins plugins that automatically evaluate PRs and fail builds on cognitive threshold breach.

```
Create the CI/CD Cognitive Gate plugins in services/guardrail-engine/cicd/.

These plugins run automatically when a PR touches configured file paths.
Human configured thresholds. Agent enforces. Human can override with justification.

1. GitHub Actions Plugin (config/github-action/action.yml):
   - Trigger: pull_request touching paths defined in .cognarc.yml
   - Steps:
     a. Collect changed files matching monitored paths
     b. For each changed file: call CognArc /score API
     c. Compare scores against workspace thresholds
     d. Post a PR comment with score breakdown table
     e. Set check status to success/failure
   - Override: PR author can add label "cognarc-override" with justification
     in PR description. Override is logged to audit trail.
   - Publish to GitHub Marketplace (include marketplace.yml)

2. GitLab CI Component (config/gitlab-component/):
   - Equivalent functionality to GitHub Actions plugin
   - Posts MR note with score breakdown

3. Jenkins Plugin stub (config/jenkins-plugin/):
   - Groovy pipeline step: cognarcEvaluate(paths: [...], thresholds: [...])
   - Returns score object, fails build if thresholds breached

4. .cognarc.yml schema:
   version: "1.0"
   thresholds:
     cognitive_load: { max: 80, environment: { prod: 75, staging: 80 } }
     manipulation_risk: { max: 40 }
     comprehension_confidence: { min: 50 }
   paths:
     - "prompts/**/*.txt"
     - "src/copy/**/*.json"
   on_breach:
     action: "fail"  # or "warn"
     alert:
       slack: "${SLACK_WEBHOOK_URL}"
       email: "team@company.com"
   environments:
     - dev
     - staging
     - prod

5. Baseline management:
   - First evaluation creates a baseline
   - Subsequent evaluations show delta vs baseline
   - Baselines versioned in .cognarc-baselines/ directory
```

> **Claude Code Tip:** Test the GitHub Actions plugin against a real repo. Create a test repo with sample prompt files and run the action in a fork before publishing. The override mechanism must write to the audit log — test this explicitly.

---

### P-009 · Build the Prompt Evaluation Gate

**Category:** Guardrails  
**Purpose:** Create a middleware layer that intercepts prompt submissions and returns pre-flight cognitive scores before forwarding to the target LLM.

```
Create the Prompt Evaluation Gate in services/guardrail-engine/prompt-gate/.

This service sits between the application and the LLM API.
It scores the prompt BEFORE forwarding to the LLM.
Human configures thresholds. Agent enforces. Human can whitelist patterns.

Two modes:
- Proxy mode: Application sends to CognArc endpoint, CognArc forwards to LLM
- Direct-call mode: Application calls /evaluate-prompt, decides whether to forward

Implement:

1. Proxy endpoints:
   POST /proxy/openai    → evaluates → forwards to api.openai.com
   POST /proxy/anthropic → evaluates → forwards to api.anthropic.com
   POST /proxy/gemini    → evaluates → forwards to generativelanguage.googleapis.com
   - Strips and re-adds auth headers (never logs API keys)
   - Latency added must be <200ms p95

2. Direct evaluation endpoint:
   POST /evaluate-prompt
   Request: { prompt: string, workspace_id: string }
   Response: {
     scores: CognitiveScoreResponse,
     decision: "ALLOW" | "BLOCK" | "WARN",
     reason?: string,
     whitelist_match?: string
   }

3. Whitelist management:
   - Human-configured patterns in .cognarc.yml
   - Supports exact match, prefix match, regex
   - Agent cannot add to whitelist. Human only.
   - Whitelist entries stored with: pattern, author, timestamp, reason

4. Prompt Regression Monitor:
   - First evaluation of a prompt ID: store baseline
   - Prompt ID = SHA-256 hash of system prompt (ignoring user variables)
   - Regression: cognitive_load increase >10pts OR comprehension_confidence drop >15pts
   - On regression: post GitHub PR annotation + dashboard alert

5. Rate limiting:
   - Free tier: 100 evaluations/minute per workspace
   - Growth tier: 1000 evaluations/minute per workspace
   - Returns 429 with retry-after header when exceeded

Write a test that verifies the <200ms latency requirement under load.
```

> **Claude Code Tip:** Proxy mode needs careful handling of streaming responses (SSE). Test with all three LLM providers. Use SHA-256, not Math.random(), for prompt ID hashing — it must be deterministic across restarts.

---

## Section 5 · Safety Layer

*The manipulation taxonomy engine runs continuously on every output. This is the feature that separates CognArc from every other evaluation tool on the market.*

---

### P-010 · Build the Manipulation Taxonomy Engine
READ CLAUDE.md
**Category:** Safety  
**Purpose:** Create the continuous manipulation detection system that scores every AI output against the six-category taxonomy.

```
Create the Manipulation Taxonomy Engine in services/guardrail-engine/manipulation/.

Six manipulation categories:
1. false_urgency          — artificial time pressure, manufactured scarcity
2. social_proof_fabrication — fake consensus, inflated authority claims
3. ambiguity_exploitation — deliberately vague language to mislead
4. authority_mimicry      — impersonating expertise or official sources
5. sycophantic_drift      — telling user what they want to hear over truth
6. obfuscation            — complexity used to hide meaning

Implement:

1. ManipulationTaxonomyEngine class:
   score(text: string): ManipulationScores
   
   ManipulationScores = {
     false_urgency: number
     social_proof_fabrication: number
     ambiguity_exploitation: number
     authority_mimicry: number
     sycophantic_drift: number
     obfuscation: number
     overall_manipulation_risk: number   // weighted composite
     detected_patterns: DetectedPattern[]
     explanation: string
   }

2. Per-category NLP heuristic detectors:
   - false_urgency: urgency phrases, countdown language, scarcity claims
   - social_proof_fabrication: unverified statistics, vague consensus claims
   - ambiguity_exploitation: readability score inversion, hedge word density
   - authority_mimicry: credential inflation, official-sounding language
   - sycophantic_drift: excessive agreement, validation without substance
   - obfuscation: sentence complexity, jargon density, passive voice overuse

3. Continuous scanning integration:
   - ManipulationScanner wraps the engine
   - scan(output: string, workspaceId: string): Promise<ScanResult>
   - Adds <50ms to primary scoring latency
   - Detections above threshold generate DetectedPattern:
     { category, score, evidence_snippets, explanation }

4. Threshold-based blocking:
   - Configurable per category in .cognarc.yml
   - Default: block if overall_manipulation_risk > 70
   - Soft block: log + alert (default)
   - Hard block: reject output, serve fallback (opt-in)

5. Test suite with 50 labeled examples:
   - 25 manipulative texts (covering all 6 categories)
   - 25 clean texts (various topics and styles)
   - Target: >85% detection rate, <15% false positive rate
```

> **Claude Code Tip:** Build the 50-example test suite first (TDD). Use real examples of each manipulation type — ad copy, dark patterns, misleading health claims. The heuristics improve as you add more test examples.

---

## Section 6 · Dashboard

*All five buyer surfaces visible in one place. Engineers see CI/CD scores and audit logs. PMs see alignment scores and analytics. Growth teams upload creatives. Designers run A/B comparisons. Safety leads see the manipulation feed.*

---

### P-011 · Build the CognArc Dashboard
READ CLAUDE.md
**Category:** Infrastructure  
**Purpose:** Create the React dashboard that gives all five buyer types visibility into cognitive scores, agent actions, and oversight status.

```
Create apps/dashboard/ — the CognArc web dashboard.

Tech stack: React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Query

Build these views:

1. Workspace Overview (all roles):
   - Cognitive Health Score (aggregate, 30-day trend)
   - Agent Activity Feed (recent actions, Act-Gated pending approvals)
   - Kill Switch toggle (prominent, always accessible to admins)
   - Connected surfaces status

2. Engineer View:
   - Prompt Regression Monitor: tracked prompts + baseline delta
   - CI/CD Gate: recent PR evaluations, pass/fail history
   - Audit Log: filterable by action type, zone, date

3. PM View:
   - Cognitive-Behavioral Alignment Score: per-session trend
   - Analytics connector status + write-back health
   - Onboarding Load Curve: latest flow analysis
   - Model Cognitive Profile: connected models + benchmark scores

4. Growth View:
   - Creative Evaluation Queue: upload assets, view reports
   - Variant Ranker: upload multiple variants, see ranked comparison
   - Brand Trust Drift: campaign trust coherence over time

5. Designer View:
   - A/B Comparison Tool: upload two variants, see cognitive comparison
   - Heatmap Viewer: attention/load overlays on UI screenshots
   - Onboarding Flow Analyzer: step-by-step load curve

6. Safety / Red Team View:
   - Manipulation Detection Feed: real-time flags with evidence packages
   - Post-Remediation Monitor: tracked findings + re-emergence status
   - Audit Trail: full export functionality

7. Act-Gated Approval Workflow:
   - Pending approvals inbox
   - Decision package viewer (TRIBE evidence, proposed action, alternatives)
   - Approve / Reject with recorded justification
   - Notification when new approval request arrives

Use React Query for all data fetching.
Use Recharts for all charts.
Mobile responsive. WCAG 2.1 AA accessible.
```

> **Claude Code Tip:** Build the Kill Switch toggle first — it should be on every page. Use React Query's optimistic updates for the approval workflow. The Audit Log table needs virtual scrolling (TanStack Virtual) — it will have thousands of rows.

---

## Section 7 · Advanced Features

*The zero-traffic A/B engine is CognArc's most compelling feature for startups. The eval platform integration makes CognArc the cognitive layer inside every existing AI evaluation stack.*

---

### P-012 · Build the Zero-Traffic A/B Decision Engine
READ CLAUDE.md
**Category:** Design  
**Purpose:** Create the cognitive simulation engine that compares two UI variants and declares a winner without any live traffic.

```
Create the Zero-Traffic A/B Decision Engine in services/cognitive-scoring/ab-engine/.

Implement:

1. ABComparisonEngine class:
   compare(variantA: Stimulus, variantB: Stimulus): Promise<ABComparisonResult>
   
   ABComparisonResult = {
     winner: "A" | "B" | "inconclusive"
     confidence: "HIGH" | "MEDIUM" | "LOW"
     scores_a: CognitiveScoreResponse
     scores_b: CognitiveScoreResponse
     delta: Record<string, number>
     rationale: string
     recommended_action: string
     share_url?: string   // valid 30 days
   }

2. Stimulus types:
   - text: raw copy or value proposition
   - image: PNG/JPG screenshot
   - html: rendered server-side to screenshot via Puppeteer, then scored
   - url: fetched and rendered (respects robots.txt)

3. Confidence calculation:
   - HIGH: delta >15pts on ≥2 dimensions, same direction
   - MEDIUM: delta >10pts on ≥1 dimension
   - LOW: delta <10pts on all dimensions (recommend user research)

4. Report generation:
   - Shareable HTML report
   - Stored in object storage with 30-day TTL
   - Includes: side-by-side scores, winner badge, rationale,
     cognitive heatmaps if image input, methodology note

5. REST endpoint:
   POST /ab-compare
   - Accepts multipart form (two stimulus files or URLs)
   - Returns comparison result within 5 minutes
   - Async job for image/HTML inputs

6. Test with real examples:
   - Two landing page screenshots with different clarity
   - Verify the clearer one wins on comprehension_confidence
```

> **Claude Code Tip:** Add a step that saves the Puppeteer-rendered screenshot to `/tmp` during development so you can verify what TRIBE is actually seeing. Add a 30-second rendering timeout.

---

### P-013 · Build the Eval Platform Integration
READ CLAUDE.md
**Category:** Eval  
**Purpose:** Create the Cognitive Scorer API that plugs into Braintrust, Langfuse, W&B, and Arize as a custom cognitive scoring dimension.

```
Create services/eval-integration/ — the AI evaluation platform integration layer.

1. Generic Custom Scorer API (OpenAPI 3.1 spec):
   POST /score
   Request: {
     output: string
     input?: string
     context?: object
     workspace_id: string
   }
   Response: {
     cognitive_load: number
     comprehension_confidence: number
     emotional_valence: number
     trust_coherence: number
     manipulation_risk: number
     cognitive_risk: "LOW" | "MEDIUM" | "HIGH"
     explanation: string
     score: number           // 0-1 overall (for single-score platforms)
     reasoning: string       // alias for explanation
     metadata: { model_version, latency_ms, brain_regions }
   }

2. Platform-specific adapters:
   - BraintrustAdapter: implements Braintrust Scorer interface
   - LangfuseAdapter: implements Langfuse Evaluator interface
   - WandBAdapter: W&B Weave custom scorer
   - ArizeAdapter: Arize Phoenix custom evaluator

3. Python SDK (packages/cognarc-python/):
   pip install cognarc
   from cognarc import CognArcScorer
   scorer = CognArcScorer(api_key="...", workspace_id="...")
   result = scorer.score(output="LLM output text here")

4. TypeScript SDK (packages/cognarc-types/):
   import { CognArcClient } from '@cognarc/client'
   const client = new CognArcClient({ apiKey: '...' })
   const scores = await client.score({ output: '...' })

5. Prompt Regression Cognitive Gate (standalone):
   - Stores baselines per prompt_id
   - Regression: Load +10pts OR Comprehension -15pts
   - Designed to run in CI alongside accuracy regression tests

Include OpenAPI spec, Postman collection, and integration guides for each platform.
```

> **Claude Code Tip:** Build the Python SDK first — it is the most-used entry point. Publish to TestPyPI before PyPI to verify clean installation. Test Braintrust and Langfuse integrations against their live sandboxes.

---

## Section 8 · Red Team & Safety

*The post-remediation regression monitor is what makes red team findings stick. Build this after the manipulation taxonomy engine is working.*

---

### P-014 · Build the Red Team Safety Agent
READ CLAUDE.md
**Category:** Red Team  
**Purpose:** Create the continuous red team augmentation layer — post-remediation regression monitoring and neural evidence package generation.

```
Create services/guardrail-engine/red-team/ — the Red Team Safety Agent.

1. PostRemediationMonitor:
   - When a finding is marked "remediated" by a human:
     * Activates continuous monitoring for that specific pattern
     * Pattern defined by: taxonomy_category + evidence_snippets
   
   activate(findingId: string, pattern: ManipulationPattern): void
   checkOutput(output: string, workspaceId: string): ReEmergenceResult
   
   ReEmergenceResult = {
     re_emerged: boolean
     confidence: number
     matching_snippets: string[]
     original_finding_id: string
     alert_sent: boolean
   }
   
   - Detection within 60 minutes of new model version connection
   - Alert delivered to red team dashboard + Slack immediately

2. NeuralEvidencePackageGenerator:
   generatePackage(detection: ManipulationDetection): EvidencePackage
   
   EvidencePackage = {
     taxonomy_category: string
     overall_score: number
     confidence_interval: { low: number, high: number }
     activation_signature: {
       limbic_activation: number
       prefrontal_engagement: number
       ratio: number     // high limbic / low prefrontal = manipulation signal
     }
     evidence_snippets: string[]
     plain_language_explanation: string
     population_variance: {
       aggregate_risk: number
       high_risk_subgroups: string[]
     }
     recommended_actions: string[]
     suitable_for_stakeholder_reporting: boolean
   }

3. ScaleCoverageReport (weekly, autonomous):
   - Total detections by category
   - Severity distribution
   - 7-day trend vs prior week
   - Outputs reviewed vs what a human team could review
   - Coverage gap closed metric

4. REST endpoints:
   POST /findings/:id/remediate
   GET  /findings/:id/status
   GET  /coverage-report
   POST /evidence-package/:detectionId

Tests:
   - Clean model → no re-emergence
   - Model after regression update → detection within SLA
```

> **Claude Code Tip:** The post-remediation monitor must be idempotent — if the same pattern is found multiple times in one output, alert once not N times. Use a 60-second debounce window per finding per output stream.

---

## Section 9 · Platform (Phase 3)

*The fine-tuning pipeline is the compounding loop that makes CognArc's simulation accuracy improve over time. Build this last. It is the most consequential and most carefully governed capability in the system.*

---
READ CLAUDE.md
### P-015 · Build the Phase 3 Fine-Tuning Pipeline

**Category:** Platform  
**Purpose:** Create the TRIBE fine-tuning data pipeline with hard human gates at every stage.

```
Create services/cognitive-scoring/fine-tuning/ — the TRIBE Fine-Tuning Pipeline.

PERMANENT CONSTRAINTS (enforce in code, not just policy):
- No fine-tuning run executes without human approval
- No model promoted to production without human approval
- Agent cannot modify its own governance
- All fine-tuning events logged to immutable audit trail indefinitely

Implement:

1. TrainingExamplePipeline:
   - Structures validated behavioral sessions as TRIBE training examples
   - Validated = Alignment Score computed + session has ≥5 behavioral events
   - Stores in fine_tuning_queue table (append-only)
   - Queue readable by ML team. Agent cannot initiate runs.

2. FineTuningRunRecommender:
   - Monitors queue daily
   - When queue reaches 10,000 examples: creates RunRecommendation
   - Recommendation includes: example_count, diversity_metrics,
     estimated_accuracy_improvement, estimated_compute_cost_usd,
     training_data_hash
   - Delivered to ML lead dashboard. NOT executed.

3. HumanApprovalGate:
   approve_run(recommendation_id, ml_lead_id, {
     approved_training_data_hash: string,  // must match recommendation
     approved_parameters: TrainingConfig,
     expected_accuracy_impact: string
   }): ApprovedRun
   
   - No run executes without this approval record
   - Timeout: NONE. Never auto-approve.

4. PostRunValidator:
   - Runs full benchmark suite against updated model
   - Generates delta report vs Phase 1 baseline
   - Quarantines model if Pearson r < 0.70
   - Presents report to ML lead for promotion decision
   - Production promotion also requires human approval

5. FineTuningGovernanceAudit:
   - Immutable record per run: data provenance, parameters,
     pre/post accuracy, promoting human identity, decision

Tests must verify:
   - Run cannot execute without approval record
   - Approval rejected when data hash mismatches
   - Quarantine threshold fires correctly
   - Governance record cannot be modified after creation
```

> **Claude Code Tip:** Build the rejection paths first. Test that approval is rejected when the data hash mismatches, when parameters exceed safe bounds, when Pearson r is below threshold. The happy path is less important than the guardrails.

---

## Section 10 · Integration Tests

*Run P-016 after every other prompt to verify the platform is working correctly end-to-end. The Trust Gradient governance tests are the most important.*

---

### P-016 · End-to-End Integration Test Suite
READ CLAUDE.md
**Category:** Infrastructure  
**Purpose:** Create the full integration test suite that validates CognArc works correctly across all services, including all oversight mechanisms.

```
Create tests/integration/ — the end-to-end integration test suite.

Run against a local stack (docker-compose) with mock TRIBE engine.

Critical test scenarios:

1. Trust Gradient governance:
   test("agent cannot reclassify its own action to lower oversight zone")
   test("Act-Gated action does not execute without recorded human approval")
   test("Kill switch pauses all Act-Auto and Act-Gated within 5 seconds")
   test("Audit log entry created for every agent action within 2 seconds")
   test("Audit log entries cannot be modified or deleted")
   test("Policy changes without valid commit signature are rejected")

2. Cognitive scoring pipeline:
   test("Stimulus scored within 600ms p95 — 1000 consecutive requests")
   test("Manipulation check adds <50ms to primary inference latency")
   test("Mock engine returns different scores for different input types")

3. CI/CD gate:
   test("Gate triggers automatically on PR with monitored file change")
   test("Build fails when manipulation_risk exceeds threshold")
   test("Override with justification is accepted and logged to audit")
   test("Baseline created on first evaluation, delta shown on subsequent")

4. Analytics connectors:
   test("Segment webhook processed and cognitive labels assigned within 200ms")
   test("Write-back to Amplitude appears as custom event property within 5 seconds")
   test("Write-back failure retried 3x without blocking event processing")

5. Behavioral SDK:
   test("SDK bundle size is <8192 bytes gzipped")
   test("SDK adds <2ms P99 overhead to page interactions")
   test("No PII captured in any SDK event")
   test("Rage click classified as confusion correctly")

6. Manipulation detection:
   test("False urgency text scores >70 on false_urgency category")
   test("Clean informational text scores <20 on all manipulation categories")
   test("Detection above threshold generates evidence package within 60 seconds")

7. Prompt evaluation gate:
   test("Gate returns pre-flight score within 200ms")
   test("Blocked prompt is not forwarded to LLM")
   test("Prompt regression detected when Load increases >10pts vs baseline")

8. A/B comparison engine:
   test("Two variants produce different scores for deliberately different inputs")
   test("Winner correctly identified for inputs with >15pt delta")
   test("Shareable report URL generated and accessible for 30 days")

Use Jest with supertest for HTTP assertions.
Use testcontainers for PostgreSQL and Redis.
Run with: pnpm test:integration
```

> **Claude Code Tip:** The kill switch 5-second test is the most likely to be flaky — give it a 10-second timeout and run it 3 times. The audit log immutability test must attempt a direct DB write, not go through the application.

---

## Section 11 · Landing Page

*The public-facing marketing site. Build when you are ready to show the product publicly.*

---

### P-017 · Build the CognArc Landing Page
READ CLAUDE.md
**Category:** Platform  
**Purpose:** Create a production-quality public marketing landing page that communicates CognArc's value to all five buyer types and converts visitors to waitlist signups.

```
Create apps/landing/ — the CognArc public marketing landing page.

Tech stack: React 18, TypeScript, Vite, Tailwind CSS
Deploy target: Vercel or Netlify (static export)

DO NOT use any UI component libraries. Pure Tailwind only.
DO NOT use any animation libraries. CSS transitions and Intersection Observer only.

Build the following sections:

1. NAV
   - Logo: "CognArc" in navy with teal accent dot
   - Links: Product, Use Cases, Pricing, Docs (scroll to section)
   - CTA button: "Join Waitlist" (teal, prominent)
   - Sticky on scroll

2. HERO
   Headline:
   "Your AI outputs are making cognitive decisions about your users.
   Do you know what they are?"
   
   Subheadline:
   "CognArc monitors every AI output, UI change, and campaign asset
   for cognitive load, comprehension failure, trust erosion, and manipulation —
   continuously, automatically, before users encounter them."
   
   CTAs:
   "See how it works" (scrolls to demo section)
   
   Social proof bar:
   "Powered by TRIBE v2 · Meta AI Research · 1,000+ hours fMRI · 720 subjects"
   
   Hero visual: CSS-animated diagram of the 7-stage continuous intelligence loop
   (Sense → Perceive → Detect → Reason → Act/Escalate → Validate → Learn)

3. PROBLEM SECTION
   Headline: "Five teams. One shared blind spot."
   
   Five buyer cards in a grid:
   - AI Engineer: "Cognitive regressions in prompts are invisible to accuracy-only eval."
   - Product Manager: "No cognitive visibility into onboarding until behavioral data arrives — weeks too late."
   - Growth Lead: "No way to know if your copy is understood before you spend media budget."
   - Designer: "Cognitive evidence only available after user research, not before."
   - Red Team: "Manual periodic testing at a fraction of output volume."
   
   Closing line:
   "CognArc is the first platform that gives all five teams
   a shared, continuous cognitive intelligence layer."

4. HOW IT WORKS
   Three columns:
   - Always On: "Monitors continuously — not when you remember to check."
   - TRIBE v2 Powered: "Built on Meta AI's TRIBE v2 — 1,000+ hours fMRI, 720 subjects. Not heuristics. Brain science."
   - Human Oversight: "Every consequential action requires your approval. Always."

5. BUYER USE CASES (tabbed interface — one tab per buyer)
   
   Engineer tab:
   - Headline: "Catch cognitive regressions before they ship"
   - Features: CI/CD Cognitive Gate, Prompt Evaluation Gate, Regression Monitor
   - Code snippet: .cognarc.yml threshold config
   
   PM tab:
   - Headline: "Cognitive intelligence in your existing analytics stack"
   - Features: Behavioral SDK, Analytics Write-Back, Alignment Score
   - Visual: Amplitude dashboard with cognitive labels on events
   
   Growth tab:
   - Headline: "Test creative before you spend"
   - Features: Creative Evaluator, Variant Ranker, Brand Trust Monitor
   - Before/after: "Old way: spend $50K, discover the copy wasn't understood.
     CognArc way: simulate in 3 minutes, ship the winner."
   
   Designer tab:
   - Headline: "Cognitive evidence before user research, not from it"
   - Features: Zero-Traffic A/B Engine, Onboarding Load Curve, Heatmap
   - Key stat: "No traffic required. Results in 5 minutes."
   
   Red Team tab:
   - Headline: "Coverage at scale. Evidence that sticks."
   - Features: Continuous Scanner, Post-Remediation Monitor, Audit Trail
   - Key stat: "Monitors every output. Not a sample. Every output."

6. TRUST GRADIENT SECTION
   Headline: "The agent acts. You stay in control."
   
   Four zone cards:
   - Observe (teal): "Monitors and scores. No action taken."
   - Recommend (amber): "Agent analyzes. You decide."
   - Act — Auto (blue): "Low-consequence. Logged. Reversible."
   - Act — Gated (purple): "Hard stop. Your approval before anything executes."
   
   Footer line:
   "Kill switch on every page. Immutable audit log.
   Policy-as-code you control. The agent cannot modify its own governance."

7. PRICING
   Three tiers:
   
   Free / Developer:
   - Up to 3 connected endpoints
   - Continuous cognitive scoring
   - Autonomous Prompt Regression Monitor
   - 30-day audit log · 1 analytics connector
   - CTA: "Start Free"
   
   Growth — $799/mo:
   - Unlimited endpoints + Full Trust Gradient Engine
   - CI/CD gate + Prompt Evaluation Gate
   - All analytics connectors + write-back
   - Creative cognitive evaluator + Zero-traffic A/B engine
   - CTA: "Start Trial"
   
   Business — $3,499/mo (badge: Most Popular):
   - Everything in Growth
   - Runtime Monitoring Agent
   - Autonomous prompt remediation
   - Trust erosion monitor + Regulatory audit reports + SLA
   - CTA: "Contact Sales"

8. WAITLIST
   Headline: "Be among the first teams to ship with cognitive confidence."
   
   Form:
   - Email input
   - Role selector: Engineer / PM / Growth / Designer / Red Team / Other
   - Submit button: "Join the Waitlist"
   - On submit: confirmation message, store to localStorage
   - Note: "No spam. No sharing. Just CognArc updates."
   
   Below form:
   "Backed by TRIBE v2 from Meta AI Research · CC-BY-NC-4.0 license"

9. FOOTER
   - Logo + tagline: "Cognitive safety for AI-powered products."
   - Links: Product, Pricing, Docs, GitHub, Privacy, Terms
   - "© 2026 CognArc. Powered by TRIBE v2."

Design system:
   Navy: #0D1F2D · Teal: #f5640b · White: #FFFFFF
   Slate: #4A6A7A · Smoke: #F5F7F8
   Font: Inter (Google Fonts)
   Spacing: 8px grid throughout
   Responsive: mobile-first, breakpoints at 768px and 1280px

After generating: vite build && vite preview
```

> **Claude Code Tip:** Open the page on your phone before anything else. The five buyer tabs are the most important section — verify each tells a clear story in under 10 seconds on a small screen. The waitlist form should work offline (localStorage) so you can demo it without a backend.

---

## Architecture Quick Reference

### The Key Rule

> TRIBE is not CognArc. TRIBE is the engine CognArc calls.  
> Every cognitive score in the system comes from **one place**: the Cognitive Scoring Service at `/score`.  
> No other service ever calls TRIBE directly.  
> This single boundary is what makes swapping mock for TRIBE a one-line change.

### The Governance Rule

> **Three permanent constraints — enforce in code, not just policy:**
> 1. The agent never modifies its own governance (Trust Gradient config, audit log, kill switch)
> 2. Act-Gated actions never execute without recorded human approval. No timeout-based auto-approval.
> 3. The audit log is append-only. No UPDATE. No DELETE. No exceptions.

---

*CognArc · Claude Code Prompt Pack · For Portfolio & Development Use*

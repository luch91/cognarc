# dashboard

**CognArc internal dashboard — five buyer surfaces in one place.**

Built with React 18, Vite, Tailwind CSS, Recharts, and React Query.
Implemented in P-011.

## Views

| View | Audience | Key features |
|---|---|---|
| Workspace Overview | All roles | Health score, agent activity feed, kill switch |
| Engineer | AI Engineers | Prompt regression monitor, CI/CD gate history, audit log |
| PM | Product Managers | Alignment score, connector status, onboarding load curve |
| Growth | Growth & Marketing | Creative evaluation queue, **Copy Health Checker** (radar chart, manager/technical toggle, rewrite flow), variant ranker, brand trust drift |
| Designer | Product Designers | A/B comparison tool, heatmap viewer, onboarding analyzer |
| Safety / Red Team | Red Team / AI Safety | Manipulation feed, post-remediation monitor, audit export |
| Act-Gated Approvals | Admins | Pending approvals inbox, decision package viewer |

## Port

`:5173` (Vite dev server)

## Running locally

```bash
pnpm --filter @cognarc/dashboard dev
```

## Live Cognitive Scoring

The dashboard connects to `cognitive-scoring` on `localhost:3001` via a Vite proxy (`/api/score`).

For live cognitive scores via GCP Cloud Run:
1. Start the scoring service: `pnpm --filter @cognarc/cognitive-scoring dev`
   (with `COGNARC_SCORING_ENGINE=tribe-gcp` in `services/cognitive-scoring/.env`)
2. Open `http://localhost:5173`
3. Use the **Live Cognitive Score** panel on the Workspace Overview page

For instant mock scores (no Cloud Run), set `COGNARC_SCORING_ENGINE=mock` in the scoring service `.env`.

Cold start on Cloud Run: ~5 min. Warm requests: ~30s.

## Copy Health Checker (Growth View)

Manager-friendly copy scorer built on `CognitiveScoreCard`. Paste any copy to:
1. Score against cognitive dimensions (comprehension, load, trust, manipulation risk)
2. See a **radar chart** with four plain-English axes: Readability, Clarity, Trust, Safety
3. Get a **CLEAR / NEEDS REVIEW / FLAGGED** health badge with a plain-English verdict
4. Read four question-based rows: "How hard is this to read?", "Will your audience understand it?", etc.
5. Request 3 LLM-rewritten alternatives when flagged — includes before/after radar comparison

Toggle between **Manager view** (radar + plain English, default) and **Technical view** (raw numbers).

**Requires:** Cognitive Scoring Service on `localhost:3001` **and** Cognitive Rewrite Service on `localhost:3006`.

Environment variable needed in `.env.local`:
```
VITE_COGNITIVE_REWRITE_URL=http://localhost:3006
```

If the rewrite service is offline, the scorer falls back to pre-written alternatives labeled "(Example suggestions)".

## CI/CD Gate Rewrite Suggestions (Engineer View)

Clicking "▼ View suggested rewrites" on a FAIL or WARN PR now calls the live Cognitive Rewrite Service
with `copyType: "prompt"`. Results are cached per PR — expanding/collapsing does not re-call the API.
Falls back to mock alternatives with a console warning if the service is unavailable.

## E2E Tests

`e2e/rewrite-features.spec.ts` covers:
- Copy Health Checker — scoring, radar chart, health badge, rewrite suggestions, before/after comparison
- CI/CD Gate rewrites — loading state, cache hit on re-expand
- Act-Gated decision package — cognitive evidence, loading skeleton, score deltas
- Video Cognitive Report — View Report button, findings panel, voiceover rewrite, Close

```bash
npx playwright test e2e/rewrite-features.spec.ts
npx playwright test e2e/rewrite-features.spec.ts --headed
```

Requires cognitive-rewrite (`localhost:3006`) and video-analysis (`localhost:3007`) running for
live service tests. Tests with live calls have 30s timeouts; fallback/cache tests have 3s.

## Video Cognitive Report (Growth View)

Upload any `.mp4`, `.mov`, or `.webm` file to the Creative Evaluation Queue.
When analysis completes, a **View Report →** link appears on the queue item.
Clicking it expands an inline Video Cognitive Report showing:

- Overall scores: **CognitiveScoreCard** in manager mode (radar chart, health badge, plain-English rows)
- 5 moment-by-moment finding cards with timestamp, component, severity, and recommendation
- Voiceover rewrite flow: click **Get Script Rewrite →** on a finding with a voiceover segment to call the Cognitive Rewrite Service and receive 3 alternative script lines with score deltas
- Component summary table and top-3 recommended actions

**Requires:** Video Analysis Service on `localhost:3007`.

Environment variable needed in `.env.local`:
```
VITE_VIDEO_ANALYSIS_URL=http://localhost:3007
```

Critical video findings (manipulation_risk > 70) are automatically forwarded to:
- Safety Manipulation Detection Feed (one entry per critical moment)
- Act-Gated Approvals queue (one item for the overall video if overall manipulation > 70)
- Agent Activity Feed

Falls back to demo-mode data if the video-analysis service is unreachable.

## Act-Gated Alternatives (Approvals View)

Opening a decision package ("View package") now fires a live rewrite call for the "Alternatives Considered" section:
- Shows a pulse skeleton + "Generating alternatives…" while loading
- Results cached per item ID — collapse/expand does not re-call the API
- CONTENT_FLAG items: `copyType: "campaign"`, extracts flagged copy from evidence summary
- THRESHOLD_BREACH items: `copyType: "prompt"`, uses item description as original text
- Fallback to existing string alternatives with a "(Demo mode)" notice if service is offline

## Supabase Integration

Video analysis results and safety findings persist across sessions via Supabase (project ref: `ggdlqlgiwyazahyyugwc`).

Tables:
- `evaluation_queue` — stores video reports in a `video_report` JSONB column; hydrated on mount
- `audit_log` — append-only (UPDATE/DELETE blocked by DB trigger); video manipulation findings written here
- `act_gated_queue` — high-risk video items auto-added for human review

Environment variables needed in `.env.local`:
```
VITE_SUPABASE_URL=https://ggdlqlgiwyazahyyugwc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
```

If Supabase env vars are missing, the app works with AppContext-only (in-memory) persistence.

## Fix Pack 5 Features

- **Creative Eval Queue** — View Report buttons with CognitiveScoreCard expansion for scored items
- **Variant Ranker** — Multi-variant copy comparison with headline/CTA/email tabs, cognitive scoring, and ranked output
- **Remediation Findings** — Clickable rows in Safety view expand to show detail panels with evidence and recommendations
- **Manual Safety Submission** — Form to submit suspected manipulation patterns directly from Safety view
- **Prompt Registry** — Add Prompt modal with 3 tabs (Paste, Import, Template), prompts scored via live cognitive scoring
- **GitHub Connections** — Add Repository modal in Settings, disconnect button on connected repos
- **LLM Connections** — Disconnect and Test buttons on connected LLM providers
- **Eval Platforms** — API key-based connection flow (replaces OAuth), Configure buttons for analytics connectors

### Supabase Tables (Fix Pack 5)

Run `infrastructure/supabase/fix-pack-5-schema.sql` in the Supabase SQL Editor:
- `variants`, `remediation_findings`, `prompt_registry`, `github_connections`, `llm_connections`, `cicd_evaluations`

## Try Live Scoring (Trial Users)

A "Try Live Cognitive Scoring" card appears on the Workspace Overview when a scoring proxy URL is configured.
Trial users can paste any text and score it via a Vercel serverless proxy that handles GCP auth.

The proxy lives in `services/scoring-proxy/` and is deployed to Vercel with:
- `GCP_SCORING_ENDPOINT` — Cloud Run URL
- `GCP_SERVICE_ACCOUNT_KEY` — service account JSON (as a string env var)
- `RATE_LIMIT_MAX` — scores per IP per day (default: 10)

Dashboard env var needed in `.env.local`:
```
VITE_SCORING_PROXY_URL=https://cognarc-scoring-proxy.vercel.app
```

Rate-limited to 10 scores/day per IP. Features CognitiveScoreCard in manager mode with radar chart, brain region badges, and plain-English explanation.

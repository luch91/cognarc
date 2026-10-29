# Gate 1: Canonical Scoring and Cloudflare-Ready Admin

## Architecture (interim hosting and Cloudflare target)

The browser always calls same-origin `/api/score`, `/api/score-stream` and
`/api/health`. These routes forward to the configured **canonical** Node
scoring service, never directly to TRIBE or the model inference endpoint.

Browser -> same-origin API adapter -> canonical cognitive-scoring /score ->
configured CME or TRIBE (text fallback to CME) -> provenance-rich response.

The current Vercel adapters are **temporary deployment adapters**.
When migrating, use Cloudflare Pages Functions or a Worker for the same
same-origin API routes. Implement the Web Fetch API there and use server-side
environment bindings `COGNARC_SCORING_URL` and
`COGNARC_SCORING_SERVICE_SECRET`. Do not ship service secrets in Vite or
browser environment variables. The canonical scoring service and TRIBE
model server are separate origins, and should be reachable through a private
or authenticated route, independent of the dashboard host.

CME is not run on the frontend; do not bundle the Node scoring service or the
TRIBE GPU/model runtime into a Cloudflare Worker. This preserves a clean
migration boundary and works with future Cloudflare Workers/Pages.

## Environment

- `COGNARC_SCORING_URL`: base URL of the canonical cognitive-scoring HTTP
  service, e.g. an operator-owned URL (not `/predict` and not the old proxy).
- `COGNARC_SCORING_SERVICE_SECRET`: shared secret for server-to-server
  `X-CognArc-Key` on `/score`. Required in production, never public.
- `COGNARC_SCORING_ENGINE=math`: CME text analysis only.
- `COGNARC_SCORING_ENGINE=tribe-gcp` plus `GCP_TRIBE_ENDPOINT`:
  TRIBE with eligible fallback if `COGNARC_FALLBACK_ENABLED=true`.
- `COGNARC_PROXY_SECRET`: optional legacy entrypoint authentication
  for the standalone scoring-proxy service only; never place in the browser.

A missing service URL or secret fails closed (503). No adapter silently calls
TRIBE directly. The /health endpoint verifies the canonical origin, not merely
that the HTTP adapter responds.

## Scoring contract

All successful evaluations include `scoring_provenance`: actual engine,
calibration status, evidence type, policy eligibility, neural evidence and
optional fallback reason. A raw cortical prediction or synthetic stub is
invalid. Non-text CME is unsupported; do not fabricate image or video scores.

The SSE adapter wraps the exact same canonical `/score` endpoint. It sends
real request lifecycle events, then one validated score result or explicit
error; it does not simulate GPU model milestones. Browser SSE parsing uses
complete event boundaries rather than chunk lines.

An uncalibrated result must be marked advisory and must not autonomously
activate enforcement decisions. Missing or incompatible page sections do
not create fake neutral scores; comparisons across different engines are
rejected until paired calibration is available. The scoring UI only claims
engine capability that the validated result proves.

## Acceptance and migration boundaries

1. Configure an accessible canonical service URL and secret in the
   dashboard's server environment and scoring service environment.
2. Verify /health returns the canonical engine identifier.
3. Run direct CME mode, and separately TRIBE-failure-to-CME for text.
4. Confirm model stub rejection, no fallback on 401/429, and no non-text
   mathematical substitution.
5. Confirm identical schema and provenance for HTTP and SSE paths.
6. Confirm policy gates and the UI show advisory results rather than
   silent enforcement, and never report a synthetic fallback.
7. Run browser and deployment tests before merging or migrating.

**Not in Gate 1:** Actual Cloudflare deployment, administrative RBAC,
real integrations in Settings, persistent approvals, visual redesign and
scientific calibration. Vercel deployment checks were previously blocked by
account status; the feature branch is not a production deploy.

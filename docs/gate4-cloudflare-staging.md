# Gate 4: Cloudflare Pages preview, responsive admin and staging acceptance

## Scope

Gate 4 adds a Cloudflare Pages Functions gateway and responsive admin shell.
It does **not** deploy or switch DNS, apply Supabase migrations or merge
stacked pull requests. This document is an operator checklist for staging.

## Existing architecture preserved

Browser (React dashboard, same-origin `/api/*`)
  -> Cloudflare Pages Functions (authenticated workspace, rate limits)
  -> canonical cognitive-scoring service (TRIBE or mathematical CME fallback)

The canonical model and scoring logic remain **outside** Pages Functions.
The new adapter forwards only validated text, a verified workspace UUID,
the scoring mode and a server-held canonical service secret. It rejects
synthetic or malformed scoring results. The SSE route observes one inference
and emits only completed, verified result information.

The Pages adapter implements:

- `POST /api/score`
- `POST /api/score-stream` (SSE contract preserved)
- `GET /api/health` (authenticated service status)
- `POST /api/rewrite` (requires a separate authorised rewrite service)
- `POST /api/extract-url` (exact public hostname allowlist and no redirects)

**Rewrite requires a separate configured `COGNARC_REWRITE_URL` and
`COGNARC_REWRITE_SERVICE_SECRET`.** It intentionally returns 503 until
that service is configured and integration-tested. This is a known feature
gap, not a successful rewrite service migration.

## Repository and deployment layout

The Pages project root should be `apps/dashboard` so Cloudflare discovers
`apps/dashboard/functions/api/*.ts`. Vite emits `apps/dashboard/dist`.
The repository is a pnpm monorepo, so install at the repository root.

Suggested dashboard build command from repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @cognarc/types build
pnpm --filter @cognarc/dashboard build
```

The output directory from repository root is `apps/dashboard/dist`.
If Cloudflare Pages is configured with a root directory of
`apps/dashboard`, the output directory is `dist` instead; confirm Pages
Functions discovery uses this root. Do not deploy only static assets.

`apps/dashboard/wrangler.toml` is a preview configuration. Review Pages
compatibility and rate-limit namespace before attaching an environment.
When using manual `wrangler pages deploy`, confirm the Functions bundle is
included; a plain static upload is not sufficient.

## Required runtime variables

Set these on the Pages project, not in browser Vite variables:

- `SUPABASE_URL`: verified Supabase project origin
- `SUPABASE_ANON_KEY`: public project key for Auth and RLS checking
- `COGNARC_SCORING_URL`: HTTPS origin of canonical scoring service
- `COGNARC_SCORING_SERVICE_SECRET`: server-to-server secret
- `COGNARC_RATE_LIMITER`: rate limit binding from `wrangler.toml`
- `COGNARC_URL_ALLOWED_HOSTS`: optional comma-separated exact public hosts
- `COGNARC_REWRITE_URL` and `COGNARC_REWRITE_SERVICE_SECRET`:
  required before rewrite is enabled

Vite **build-time** values:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (public project key only)

Never use a Supabase service-role key in a `VITE_*` setting, code, GitHub
commit or Cloudflare public environment variable.

Rate-limit bindings are **approximate per location** and must be augmented
by zone/API protections appropriate for the account. They are not globally
strict quotas and are not a substitute for abuse monitoring.

## Staging acceptance (must complete on the deployed preview)

1. Merge or deploy approved, tested code on an isolated staging URL only.
   Configure no production custom domain or DNS during validation.
2. Apply Gate 3 migrations to a backed-up **staging** Supabase project and
   provision two independent user-owned workspaces.
3. Confirm no unauthenticated access to admin pages, `/api/score`,
   `/api/score-stream`, `/api/rewrite`, `/api/extract-url` or `/api/health`.
4. Confirm wrong-workspace and expired tokens are rejected before inference.
5. Verify a real text scores once, the engine and provenance are correct,
   and the SSE result matches synchronous scoring policy.
6. Verify TRIBE failure permits only an eligible CME fallback, never an
   artificial success or alternate fake score.
7. Verify rate-limited requests never invoke the canonical service.
8. Verify mobile navigation, keyboard trapping and Escape at 390 px;
   verify desktop layouts at 1280 px; verify focus visibility and reduced
   motion behavior with browser and assistive technology.
9. Verify database-backed approvals and audit events, including attempted
   cross-tenant access and concurrent review.
10. Verify any rewrite service is authenticated, compatible with its
    expected payload and correctly handles failed upstream requests.
11. Verify URL extraction rejects unknown hosts, credentials, redirects,
    non-HTML responses and oversized pages.
12. Inspect real preview network, logs, accessibility and screenshots.
    Confirm no private API keys are sent to the browser.

## Remaining gates

No production deployment until the owner approves browser visual acceptance,
real Supabase staging tests, rate-limit config, production service credentials,
and the Pages Functions execution path. The old Vercel deployment status
must not be represented as Cloudflare availability. Keep the cosmetic
kill switch disabled until real server-side action enforcement exists.

# Gate 3: Authenticated workspaces, durable review and audit

## State and prerequisites

Gate 3 adds authenticated owner-scoped admin access using the existing Supabase
Auth project and `public.workspaces(id uuid, user_id uuid, name)` table.
It does **not** register or invite users automatically. The operator must invite
users and create ownership rows in the trusted Supabase SQL editor.

**Migrations are not applied automatically by a GitHub PR.**
Run in this order in an authorised maintenance window, after backups:

1. Confirm `workspaces-bootstrap.sql` and `001_schema.sql` have been applied.
2. Apply `gate3-admin-auth-rls.sql`.
3. Apply `gate3-legacy-secret-lockdown.sql`.
4. Verify RLS/grants and regression tests with separate users before any rollout.
5. Set browser `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. Set server `SUPABASE_URL`, `SUPABASE_ANON_KEY` and Gate 1
   `COGNARC_SCORING_URL`, `COGNARC_SCORING_SERVICE_SECRET`.
7. Configure `COGNARC_URL_ALLOWED_HOSTS` only for exact, trusted public
   domains where URL analysis is authorised. Unset means disabled.

Only the public/anon Supabase project key belongs in the browser or in the
gateway. Never use `SUPABASE_SERVICE_ROLE_KEY` in the browser or in
`VITE_*` variables.

## Production access boundaries

- The browser gets a real Supabase user via `auth.getUser()`, fetches one
  workspace owned by that user, and hides all workspace screens otherwise.
- Scoring, rewrite and URL extraction gateway endpoints require a Bearer
  token validated against Supabase Auth, then an RLS-visible workspace UUID.
  The server refuses legacy `ws-1` values and mismatched workspaces.
- Historical unrestricted anon policies on `evaluation_queue`,
  `audit_log`, `act_gated_queue` are removed. Legacy `ws-1` records
  intentionally become unreadable from the browser.
- The older `github_connections` and `llm_connections` tables contain
  credential fields and are quarantined from user reads/writes. Plan
  encrypted server-side migration and credential rotation before reusing
  their contents.
- Authenticated owner-only reads are allowed on new admin tables, with no
  direct browser mutation grants. All authoritative mutations go through
  narrowly scoped RPC functions with actor and workspace checks.
- `admin_decide_approval` changes only pending requests, requires a
  meaningful justification, and inserts a corresponding immutable audit
  event atomically. Two simultaneous decisions cannot both succeed.
- `admin_enqueue_approval` is granted only to `service_role`.
  A trusted server may create review requests, but browser code cannot mint
  requests or execute approved actions. **Approval is a review decision
  record, not permission for automated execution.**
- `admin_save_integration` stores non-secret metadata only, always
  `pending_verification`. `admin_disable_integration` records a
  disabled configuration and adds an audit event in the same transaction.
  Provider OAuth/API-key verification and secret vault integration are
  still disabled, not simulated.
- Existing kill switch remains disabled until a real agent enforcement
  control exists. Session activity is not treated as authoritative audit.

## Workspace provisioning example (trusted SQL editor only)

```sql
-- Replace with the actual authenticated user UUID after invitation.
INSERT INTO public.workspaces (user_id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'CognArc Team');
```
This example UUID must never be used literally for a real user.

## Staging security acceptance (required, not yet executed)

Run in a Supabase staging project with the migration applied.

1. No session: all admin RPCs and table queries reject or return no records.
2. User A and User B each have separate owned workspaces. User A cannot read
   user B approvals, configurations, audit events or legacy records.
3. User A cannot call an RPC with workspace B ID or decide B's approval.
4. Direct `INSERT`, `UPDATE` or `DELETE` on admin tables are denied for
   authenticated and anonymous clients.
5. Trusted service enqueues a request; an authorised user with a justification
   may approve/reject; the database transaction creates one immutable audit
   record. Duplicate or concurrent second decisions fail.
6. `UPDATE` and `DELETE` of `admin_audit_events` are rejected by trigger.
7. Integration saves are pending, never connected or healthy. Disable is
   persisted and audited. No provider secrets are stored.
8. Expired JWT and wrong workspace reject scoring, rewrite and URL extraction
   before any expensive upstream request.
9. Legacy anonymous policies have been removed; secret-containing legacy
   tables are not queryable using the public/anon key.
10. Cloudflare production Functions must replicate the same server-side Auth
    verification, RLS ownership test and rate limits before migration.

## Remaining release blockers

This PR cannot validate database SQL against the actual Supabase project
or establish a Cloudflare production deployment. It does not implement
provider OAuth, credential vault encryption, persistent execution policies,
team membership beyond owner accounts, or the authoritative kill switch.
Service-side rate limits and live authenticated browser E2E tests remain
mandatory. Preserve all PRs as drafts until these gates pass.

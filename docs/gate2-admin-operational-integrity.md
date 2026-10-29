# Gate 2: Admin Operational Integrity

Gate 2 is a **fail-closed safety and truthful-status** implementation,
stacked on Gate 1. It is not evidence of production authentication, server-side
approval processing, model calibration or Cloudflare deployment.

## Changed behavior

- Workspace samples are no longer loaded into operational screens. Demo fixtures
  remain in source solely for explicit development/testing.
- Settings displays verified canonical scoring health, not simulated LLM or
  analytics connections. Unimplemented third-party integrations cannot accept
  credentials in the browser and do not report success.
- Settings threshold changes are explicitly **session-only previews**, not
  persisted workspace policy. Browser-visible audit activity is session-only.
- The kill switch is intentionally disabled until authenticated server-side
  action suspension and durable audit logging exist.
- Approval/rejection is intentionally disabled until the real reviewer API,
  identity, RBAC and durable mutation transaction exist.
- File-based designer A/B mock winners, fake HIGH confidence, and simulated
  visual attention heatmaps are removed from operational use.
- Text asset uploads use actual canonical scoring. Unsupported image/video
  assets are labeled unsupported. Scoring errors are labeled failed. Neither
  creates a fabricated risk score or a phantom approval.
- PM and Growth static charts, synthetic trends, fake connector health, and
  synthetic scoring fallback rewrites are removed or marked unavailable.
- Unavailable backend metrics show empty states rather than neutral 50 or 0.

## Why disable operations instead of simulating them?

A visual success state is an assertion that a remote system changed. With no
server-confirmed outcome, showing success is worse than declining the action.
Actual workflows are dependent on Gate 3 authenticated endpoints and durable
persistence, and then staging acceptance tests.

## Gate 2 acceptance

1. No configured third-party endpoint reports connected merely because a user
   entered credentials or clicked a timer-based Test button.
2. A failed text upload or unsupported modality produces no fabricated score.
3. A/B file upload never yields a hard-coded winner or fabricated confidence.
4. Kill switch and approval buttons cannot claim or record authoritative action.
5. No example data appears as live workspace status; session activities are
   explicitly distinguished from authoritative audit history.
6. Canonical scoring still works through Gate 1 and preserves provenance.
7. Dashboard, scoring and guardrail typechecks and tests pass.

## Cloudflare migration note

All browser scoring calls remain same-origin, using the canonical scoring
service through the API gateway from Gate 1. The future Cloudflare Pages
Functions or Worker adapter can replace the existing serverless transport
without restoring simulated operational state.

No environment secrets should be collected in the browser. Production
integrations require server-side secret storage and authenticated workspace
authorization. No deployment or migration is performed as part of this PR.

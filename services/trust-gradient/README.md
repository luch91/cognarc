# trust-gradient

**The governance core of CognArc — oversight classification, audit log, and kill switch.**

Every agent action is classified into an oversight zone before it executes. This service
enforces the three permanent governance rules. It cannot be bypassed by the agent.

## The Three Governance Rules (enforced here)

1. **The agent never modifies its own governance.** Trust Gradient config is human-authored.
2. **Act-Gated actions never execute without recorded human approval.** No timeouts. No exceptions.
3. **The audit log is append-only.** A PostgreSQL trigger enforces this at the DB level.

## Responsibilities

- `TrustGradientEngine` — classifies every agent action into OBSERVE / RECOMMEND / ACT_AUTO / ACT_GATED
- `AuditLog` — append-only PostgreSQL-backed log of every agent action
- `GlobalKillSwitch` — Redis-backed kill switch that pauses ACT_AUTO and ACT_GATED within 5 seconds
- `ActGatedWorkflow` — decision package creation, approval request, and human approval gate
- Action registry in `src/registry.ts` — typed map of every action to its zone

## Port

`:3005`

## Critical file

`src/db/migrations/001_audit_log_immutability.sql` — the PostgreSQL trigger preventing
UPDATE/DELETE on the audit_log table. **Never modify this file.**

## Running locally

```bash
pnpm --filter @cognarc/trust-gradient dev
```

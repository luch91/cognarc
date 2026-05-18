-- P-003: Audit log table + immutability trigger.
-- NEVER MODIFY THIS FILE. The trigger is governance infrastructure.
-- Modifying it breaks the append-only guarantee of the audit log.

CREATE TABLE IF NOT EXISTS audit_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workspace_id                TEXT NOT NULL,
  action_type                 TEXT NOT NULL,
  oversight_zone              TEXT NOT NULL CHECK (oversight_zone IN ('OBSERVE','RECOMMEND','ACT_AUTO','ACT_GATED')),
  triggering_scores           JSONB,
  policy_rule_applied         TEXT NOT NULL,
  alternatives_considered     TEXT[],
  authorising_human_or_policy TEXT NOT NULL,
  outcome                     TEXT NOT NULL
);

-- Prevent any UPDATE or DELETE on audit_log rows at the database level.
CREATE OR REPLACE FUNCTION audit_log_immutability_check()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only. UPDATE and DELETE are forbidden by governance policy.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_audit_log_immutability ON audit_log;
CREATE TRIGGER enforce_audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutability_check();

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_id ON audit_log (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp     ON audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_type   ON audit_log (action_type);

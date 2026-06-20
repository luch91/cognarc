-- FLOW-01: Onboarding Flow Tracking Schema

-- 1. Onboarding flow definition
CREATE TABLE IF NOT EXISTS onboarding_flows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Default Onboarding Flow',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Onboarding steps within a flow
CREATE TABLE IF NOT EXISTS onboarding_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         UUID NOT NULL REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  match_type      TEXT NOT NULL,
  match_value     TEXT,
  copy_text       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flow_id, step_order)
);

-- 3. Behavioral events from the SDK
CREATE TABLE IF NOT EXISTS behavioral_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  step_id         UUID REFERENCES onboarding_steps(id) ON DELETE SET NULL,
  session_id      TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  cognitive_label TEXT NOT NULL,
  metadata        JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_behavioral_events_step ON behavioral_events(step_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_behavioral_events_workspace ON behavioral_events(workspace_id, occurred_at);

-- 4. Step aggregates (computed rollups)
CREATE TABLE IF NOT EXISTS step_aggregates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id               UUID NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sessions_entered      INTEGER NOT NULL DEFAULT 0,
  sessions_completed    INTEGER NOT NULL DEFAULT 0,
  drop_off_pct          FLOAT,
  cognitive_load        FLOAT,
  comprehension         FLOAT,
  rage_click_count      INTEGER DEFAULT 0,
  field_reentry_count   INTEGER DEFAULT 0,
  scroll_reversal_count INTEGER DEFAULT 0,
  abandonment_count     INTEGER DEFAULT 0,
  warnings              TEXT[],
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(step_id)
);

-- RLS: enable on all tables
ALTER TABLE onboarding_flows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_aggregates     ENABLE ROW LEVEL SECURITY;

-- RLS policies: anon access (matches existing project pattern)
CREATE POLICY "anon_all_onboarding_flows" ON onboarding_flows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_onboarding_steps" ON onboarding_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_behavioral_events" ON behavioral_events FOR SELECT USING (true);
CREATE POLICY "anon_insert_behavioral_events" ON behavioral_events FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_all_step_aggregates" ON step_aggregates FOR ALL USING (true) WITH CHECK (true);

-- CognArc Fix Pack 5 — Supabase Schema Additions
-- Run in Supabase → SQL Editor → New query
-- Project: ggdlqlgiwyazahyyugwc (eu-north-1)

-- ─────────────────────────────────────────────────────────────
-- Variants table (Variant Ranker uploads)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL,
  label           TEXT NOT NULL,
  content_type    TEXT NOT NULL,
  content_text    TEXT,
  storage_path    TEXT,
  url             TEXT,
  scores          JSONB,
  rank            INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON variants
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- Remediation findings table (Safety / Red Team inputs)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS remediation_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,
  score           FLOAT NOT NULL,
  source          TEXT NOT NULL,
  source_ref      TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  remediated_at   TIMESTAMPTZ,
  last_check      TIMESTAMPTZ,
  reemergence_risk FLOAT DEFAULT 0,
  evidence        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE remediation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON remediation_findings
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- Prompt registry table (Engineer view prompt inputs)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prompt_id       TEXT NOT NULL,
  name            TEXT NOT NULL,
  source          TEXT NOT NULL,
  source_ref      TEXT,
  current_text    TEXT NOT NULL,
  baseline_text   TEXT,
  current_scores  JSONB,
  baseline_scores JSONB,
  score_history   JSONB DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'ok',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, prompt_id)
);

ALTER TABLE prompt_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON prompt_registry
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- GitHub connections table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS github_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_url        TEXT NOT NULL,
  repo_owner      TEXT NOT NULL,
  repo_name       TEXT NOT NULL,
  installation_id TEXT,
  webhook_secret  TEXT NOT NULL,
  monitored_paths TEXT[] NOT NULL DEFAULT ARRAY['prompts/**/*.txt','src/copy/**/*.json'],
  status          TEXT NOT NULL DEFAULT 'connected',
  last_event_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, repo_url)
);

ALTER TABLE github_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON github_connections
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- LLM connections table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  endpoint_url    TEXT NOT NULL,
  api_key_hint    TEXT,
  api_key_encrypted TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'connected',
  last_tested_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE llm_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON llm_connections
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────
-- CI/CD evaluations table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cicd_evaluations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repo_url        TEXT NOT NULL,
  pr_number       INTEGER NOT NULL,
  commit_sha      TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  scores          JSONB NOT NULL,
  gate_result     TEXT NOT NULL,
  comment_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cicd_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_data" ON cicd_evaluations
  FOR ALL USING (workspace_id IN (
    SELECT id FROM workspaces WHERE user_id = auth.uid()
  ));

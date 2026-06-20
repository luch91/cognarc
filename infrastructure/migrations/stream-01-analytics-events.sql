-- STREAM-01: Analytics Event Capture schema
-- Stores every event received from connected analytics platforms
-- (Segment, Amplitude, PostHog, Mixpanel, GA4) with cognitive labels applied.

CREATE TABLE IF NOT EXISTS analytics_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          TEXT NOT NULL,
  platform              TEXT NOT NULL,
  raw_event_name        TEXT NOT NULL,
  raw_properties        JSONB,
  cognitive_label       TEXT,
  cognitive_label_rule  TEXT,
  write_back_status     TEXT NOT NULL DEFAULT 'pending',
  write_back_error      TEXT,
  write_back_ref        TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_analytics_events" ON analytics_events
  FOR SELECT USING (true);

CREATE POLICY "anon_insert_analytics_events" ON analytics_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_update_analytics_events" ON analytics_events
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_time
  ON analytics_events(workspace_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_platform
  ON analytics_events(workspace_id, platform, received_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE analytics_events;

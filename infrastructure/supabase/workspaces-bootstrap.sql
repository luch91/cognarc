-- Bootstrap workspaces table (required before fix-pack-5-schema.sql)
CREATE TABLE IF NOT EXISTS workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Default Workspace',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "user_workspaces" ON workspaces
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

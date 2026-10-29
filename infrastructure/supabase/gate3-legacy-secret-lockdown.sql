-- Gate 3 follow-up: quarantine older tables that stored provider secrets
-- or allowed browser-side writes of operational-looking records.
-- Apply after gate3-admin-auth-rls.sql.
BEGIN;
DO $$
DECLARE tab_name text;
BEGIN
  FOREACH tab_name IN ARRAY ARRAY[
    'github_connections','llm_connections','variants',
    'remediation_findings','prompt_registry','cicd_evaluations'
  ] LOOP
    IF to_regclass('public.' || tab_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tab_name);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM PUBLIC, anon, authenticated', tab_name);
      IF tab_name IN ('github_connections','llm_connections') THEN
        -- These historical tables have fields holding credentials and webhook
        -- secrets. Do not permit browser reads until values are migrated to an
        -- encrypted server-only vault and sanitised views exist.
        EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon, authenticated', tab_name);
        EXECUTE format('DROP POLICY IF EXISTS "workspace_data" ON public.%I', tab_name);
      END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;

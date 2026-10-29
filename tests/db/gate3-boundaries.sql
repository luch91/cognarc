-- Operational Gate 3 migration smoke checks against real PostgreSQL RLS.
\set ON_ERROR_STOP on
INSERT INTO public.workspaces (id,user_id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Workspace A'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Workspace B');

-- Trusted service creates a review request; no caller-controlled browser
-- may insert directly or create its own approvable request.
SET ROLE service_role;
SELECT id AS approval_id FROM public.admin_enqueue_approval(
  '11111111-1111-4111-8111-111111111111',
  'CONTENT_REVIEW',
  'Review copy for claim and pressure-pattern consistency',
  '{"model_calibrated":false,"policy_eligible":false}'::jsonb
) \gset
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.workspaces) <> 1 THEN
    RAISE EXCEPTION 'Workspace owner RLS failed for user A';
  END IF;
  IF (SELECT count(*) FROM public.admin_approvals) <> 1 THEN
    RAISE EXCEPTION 'Approval owner RLS failed for user A';
  END IF;
  BEGIN
    INSERT INTO public.admin_approvals(workspace_id,action_type,description)
      VALUES('11111111-1111-4111-8111-111111111111','ATTACK','Untrusted browser-generated approval');
    RAISE EXCEPTION 'Direct browser approval INSERT unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_enqueue_approval(
      '11111111-1111-4111-8111-111111111111', 'ATTACK', 'Untrusted approval request', '{}'::jsonb);
    RAISE EXCEPTION 'Browser was able to mint a trusted approval';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT (public.admin_decide_approval(
  '11111111-1111-4111-8111-111111111111',
  :'approval_id'::uuid, 'rejected',
  'Insufficient human outcome evidence and no calibrated policy eligibility.'
)).status AS decision_status;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.admin_audit_events
      WHERE event_type = 'approval.rejected') <> 1 THEN
    RAISE EXCEPTION 'Decision transaction did not persist a matching audit event';
  END IF;
END $$;

SELECT (public.admin_save_integration(
  '11111111-1111-4111-8111-111111111111',
  'github','Release workflow','luch91/cognarc'
)).status AS integration_status;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.admin_integrations
      WHERE status = 'pending_verification') <> 1 THEN
    RAISE EXCEPTION 'Browser integration was not marked pending verification';
  END IF;
  BEGIN
    PERFORM public.admin_decide_approval(
      '11111111-1111-4111-8111-111111111111',
      (SELECT id FROM public.admin_approvals LIMIT 1),
      'approved', 'A second review cannot override the first.');
    RAISE EXCEPTION 'Repeated review unexpectedly succeeded';
  EXCEPTION WHEN sqlstate 'P0002' THEN NULL;
  END;
  BEGIN
    UPDATE public.admin_integrations SET status = 'disabled';
    RAISE EXCEPTION 'Direct integration UPDATE unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $$
BEGIN
  IF (SELECT count(*) FROM public.workspaces) <> 1 THEN
    RAISE EXCEPTION 'Workspace owner RLS failed for user B';
  END IF;
  IF (SELECT count(*) FROM public.admin_approvals) <> 0 OR
     (SELECT count(*) FROM public.admin_audit_events) <> 0 OR
     (SELECT count(*) FROM public.admin_integrations) <> 0 THEN
    RAISE EXCEPTION 'Cross-workspace record visibility was not denied';
  END IF;
  BEGIN
    PERFORM public.admin_save_integration(
      '11111111-1111-4111-8111-111111111111',
      'github','Cross-owner attempt','unauthorised');
    RAISE EXCEPTION 'Cross-workspace integration write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_decide_approval(
      '11111111-1111-4111-8111-111111111111',
      (SELECT id FROM public.admin_approvals WHERE false LIMIT 1),
      'approved','Attempt to authorise cross-tenant review');
    RAISE EXCEPTION 'Cross-workspace decision unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Enforce physical audit immutability even against a privileged writer.
-- Separate the expected trigger error from the assertion, so a successful
-- mutation cannot be misinterpreted as a correctly rejected operation.
DO $$
DECLARE mutation_was_allowed boolean := false;
BEGIN
  BEGIN
    UPDATE public.admin_audit_events SET event_type = 'tampered';
    mutation_was_allowed := true;
  EXCEPTION WHEN raise_exception THEN
    mutation_was_allowed := false;
  END;
  IF mutation_was_allowed OR EXISTS (
    SELECT 1 FROM public.admin_audit_events WHERE event_type = 'tampered'
  ) THEN
    RAISE EXCEPTION 'Database audit UPDATE unexpectedly succeeded';
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'anon_%'
      AND tablename IN ('evaluation_queue','audit_log','act_gated_queue')
  ) THEN RAISE EXCEPTION 'An unrestricted legacy anonymous policy still exists'; END IF;
END $$;

SET ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.admin_approvals;
    RAISE EXCEPTION 'Anonymous user could read admin approvals';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT 'Gate 3 PostgreSQL owner/RLS/RPC/audit smoke tests passed' AS result;

-- Gate 3: owner-scoped authenticated admin, transactional approvals, immutable audit.
-- Prerequisite: infrastructure/supabase/workspaces-bootstrap.sql and 001_schema.sql.
-- Apply through an authorised migration runner as postgres. Do not execute from the browser.
BEGIN;

-- Legacy portfolio policies granted unrestricted anonymous access.
DROP POLICY IF EXISTS "anon_read_evaluation_queue" ON public.evaluation_queue;
DROP POLICY IF EXISTS "anon_insert_evaluation_queue" ON public.evaluation_queue;
DROP POLICY IF EXISTS "anon_update_evaluation_queue" ON public.evaluation_queue;
DROP POLICY IF EXISTS "anon_read_audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "anon_insert_audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "anon_read_act_gated_queue" ON public.act_gated_queue;
DROP POLICY IF EXISTS "anon_insert_act_gated_queue" ON public.act_gated_queue;
DROP POLICY IF EXISTS "anon_update_act_gated_queue" ON public.act_gated_queue;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.act_gated_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "admin_owner_select" ON public.workspaces;
CREATE POLICY "admin_owner_select" ON public.workspaces
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

-- Owner provisioning takes place in a trusted admin environment.
REVOKE ALL ON public.workspaces FROM anon, authenticated;
GRANT SELECT ON public.workspaces TO authenticated;
REVOKE ALL ON public.evaluation_queue, public.audit_log, public.act_gated_queue FROM anon, authenticated;
GRANT SELECT ON public.evaluation_queue, public.audit_log, public.act_gated_queue TO authenticated;

-- Legacy records with workspace_id = 'ws-1' are intentionally not authorised:
-- only a real UUID belonging to the current owner can be read.
DROP POLICY IF EXISTS "admin_legacy_evaluations_read" ON public.evaluation_queue;
CREATE POLICY "admin_legacy_evaluations_read" ON public.evaluation_queue
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id::text = evaluation_queue.workspace_id AND w.user_id = (select auth.uid())
  ));
DROP POLICY IF EXISTS "admin_legacy_audit_read" ON public.audit_log;
CREATE POLICY "admin_legacy_audit_read" ON public.audit_log
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id::text = audit_log.workspace_id AND w.user_id = (select auth.uid())
  ));
DROP POLICY IF EXISTS "admin_legacy_approvals_read" ON public.act_gated_queue;
CREATE POLICY "admin_legacy_approvals_read" ON public.act_gated_queue
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id::text = act_gated_queue.workspace_id AND w.user_id = (select auth.uid())
  ));

-- New authority-specific tables do not have direct mutation grants.
CREATE TABLE IF NOT EXISTS public.admin_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (length(action_type) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (length(description) BETWEEN 12 AND 2000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewer_id uuid REFERENCES auth.users(id),
  justification text,
  decided_at timestamptz,
  CONSTRAINT admin_approvals_decision_consistent CHECK (
    (status = 'pending' AND reviewer_id IS NULL AND justification IS NULL AND decided_at IS NULL)
    OR (status IN ('approved','rejected') AND reviewer_id IS NOT NULL
        AND length(justification) BETWEEN 12 AND 2000 AND decided_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS admin_approvals_workspace_idx
  ON public.admin_approvals (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN (
    'segment','amplitude','mixpanel','posthog','ga4','braintrust',
    'langfuse','wandb','arize','github','llm'
  )),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  public_reference text NOT NULL DEFAULT '' CHECK (length(public_reference) <= 300),
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, label)
);
CREATE INDEX IF NOT EXISTS admin_integrations_workspace_idx ON public.admin_integrations (workspace_id);

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 3 AND 90),
  subject_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_workspace_idx
  ON public.admin_audit_events (workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Authoritative admin audit events are immutable';
END;
$$;
DROP TRIGGER IF EXISTS admin_audit_immutable_trg ON public.admin_audit_events;
CREATE TRIGGER admin_audit_immutable_trg BEFORE UPDATE OR DELETE
  ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.admin_audit_immutable();

ALTER TABLE public.admin_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_approvals, public.admin_integrations, public.admin_audit_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_approvals, public.admin_integrations, public.admin_audit_events
  TO authenticated;

DROP POLICY IF EXISTS admin_owner_approvals_read ON public.admin_approvals;
CREATE POLICY admin_owner_approvals_read ON public.admin_approvals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = (select auth.uid())
  ));
DROP POLICY IF EXISTS admin_owner_integrations_read ON public.admin_integrations;
CREATE POLICY admin_owner_integrations_read ON public.admin_integrations
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = (select auth.uid())
  ));
DROP POLICY IF EXISTS admin_owner_audit_read ON public.admin_audit_events;
CREATE POLICY admin_owner_audit_read ON public.admin_audit_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.user_id = (select auth.uid())
  ));

-- RPC: an atomic approval transition and audit insert in one Postgres transaction.
-- Deliberately does not execute the proposed action. Approval means review recorded.
CREATE OR REPLACE FUNCTION public.admin_decide_approval(
  p_workspace_id uuid, p_approval_id uuid, p_decision text, p_justification text
) RETURNS public.admin_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_approval public.admin_approvals;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND user_id = v_actor
  ) THEN RAISE EXCEPTION 'Not authorised for workspace' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid decision' USING ERRCODE = '22023'; END IF;
  IF p_justification IS NULL OR length(btrim(p_justification)) NOT BETWEEN 12 AND 2000 THEN
    RAISE EXCEPTION 'Justification must be 12 to 2000 characters' USING ERRCODE = '22023'; END IF;

  UPDATE public.admin_approvals SET status = p_decision, reviewer_id = v_actor,
    justification = btrim(p_justification), decided_at = now()
  WHERE id = p_approval_id AND workspace_id = p_workspace_id AND status = 'pending'
  RETURNING * INTO v_approval;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not pending or not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.admin_audit_events
    (workspace_id, actor_id, event_type, subject_id, payload)
  VALUES (p_workspace_id, v_actor, 'approval.' || p_decision, p_approval_id,
    jsonb_build_object('justification', btrim(p_justification), 'action_type', v_approval.action_type));
  RETURN v_approval;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_decide_approval(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_approval(uuid,uuid,text,text) TO authenticated;

-- Integration metadata is stored durably, but never marked verified by a browser.
-- No tokens or API secrets are accepted or stored.
CREATE OR REPLACE FUNCTION public.admin_save_integration(
  p_workspace_id uuid, p_provider text, p_label text, p_public_reference text DEFAULT ''
) RETURNS public.admin_integrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.admin_integrations;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND user_id = v_actor
  ) THEN RAISE EXCEPTION 'Not authorised for workspace' USING ERRCODE = '42501'; END IF;
  IF p_provider NOT IN ('segment','amplitude','mixpanel','posthog','ga4',
    'braintrust','langfuse','wandb','arize','github','llm') THEN
    RAISE EXCEPTION 'Unsupported provider' USING ERRCODE = '22023'; END IF;
  IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 1 AND 100 OR
     p_public_reference IS NULL OR length(p_public_reference) > 300 THEN
    RAISE EXCEPTION 'Invalid integration metadata' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.admin_integrations
    (workspace_id, provider, label, public_reference, status)
  VALUES (p_workspace_id, p_provider, btrim(p_label), p_public_reference, 'pending_verification')
  ON CONFLICT (workspace_id, provider, label)
  DO UPDATE SET public_reference = excluded.public_reference,
    status = 'pending_verification', updated_at = now()
  RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_events (workspace_id, actor_id, event_type, subject_id, payload)
  VALUES (p_workspace_id, v_actor, 'integration.saved', v_row.id,
    jsonb_build_object('provider', v_row.provider, 'status', v_row.status));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_integration(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_integration(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_disable_integration(p_workspace_id uuid, p_integration_id uuid)
RETURNS public.admin_integrations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.admin_integrations;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND user_id = v_actor
  ) THEN RAISE EXCEPTION 'Not authorised for workspace' USING ERRCODE = '42501'; END IF;

  UPDATE public.admin_integrations SET status = 'disabled', updated_at = now()
    WHERE id = p_integration_id AND workspace_id = p_workspace_id
    RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Integration not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.admin_audit_events (workspace_id, actor_id, event_type, subject_id, payload)
    VALUES (p_workspace_id, v_actor, 'integration.disabled', v_row.id,
      jsonb_build_object('provider', v_row.provider));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_disable_integration(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_disable_integration(uuid,uuid) TO authenticated;

-- Only a trusted service may originate an action requiring review. A browser
-- cannot mint requests it can later approve. This RPC does not execute actions.
CREATE OR REPLACE FUNCTION public.admin_enqueue_approval(
  p_workspace_id uuid, p_action_type text, p_description text, p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS public.admin_approvals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.admin_approvals;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'Workspace not found' USING ERRCODE = 'P0002'; END IF;
  IF p_action_type IS NULL OR length(btrim(p_action_type)) NOT BETWEEN 1 AND 80 OR
     p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 12 AND 2000 OR
     octet_length(coalesce(p_evidence, '{}'::jsonb)::text) > 16384 THEN
    RAISE EXCEPTION 'Invalid approval payload' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.admin_approvals (workspace_id, action_type, description, evidence)
    VALUES (p_workspace_id, btrim(p_action_type), btrim(p_description), coalesce(p_evidence, '{}'::jsonb))
    RETURNING * INTO v_row;
  INSERT INTO public.admin_audit_events (workspace_id, event_type, subject_id, payload)
    VALUES (p_workspace_id, 'approval.queued', v_row.id,
      jsonb_build_object('action_type', v_row.action_type, 'origin', 'trusted_service'));
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_enqueue_approval(uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enqueue_approval(uuid,text,text,jsonb) TO service_role;
COMMIT;

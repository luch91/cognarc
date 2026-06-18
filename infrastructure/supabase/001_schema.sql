-- CognArc Supabase Schema
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor)

-- ── evaluation_queue ─────────────────────────────────────────────────────────
create table if not exists evaluation_queue (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null default 'ws-1',
  name text not null,
  type text not null default 'copy' check (type in ('image', 'copy', 'video')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'complete')),
  cognitive_load numeric,
  manipulation_risk numeric,
  trust_coherence numeric,
  video_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── audit_log (append-only) ──────────────────────────────────────────────────
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamptz not null default now(),
  workspace_id text not null default 'ws-1',
  action_type text not null,
  oversight_zone text not null check (oversight_zone in ('OBSERVE', 'RECOMMEND', 'ACT_AUTO', 'ACT_GATED')),
  outcome text,
  authorising_human_or_policy text,
  policy_rule_applied text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Immutability trigger: prevent UPDATE and DELETE on audit_log
create or replace function prevent_audit_mutation() returns trigger as $$
begin
  raise exception 'audit_log is append-only: % operations are not allowed', tg_op;
end;
$$ language plpgsql;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update
  before update or delete on audit_log
  for each row execute function prevent_audit_mutation();

-- ── act_gated_queue ──────────────────────────────────────────────────────────
create table if not exists act_gated_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'ws-1',
  title text not null,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decision_by timestamptz,
  package_data jsonb,
  reviewer text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all tables (required for anon key access)
alter table evaluation_queue enable row level security;
alter table audit_log enable row level security;
alter table act_gated_queue enable row level security;

-- Allow anon reads and inserts (portfolio project — no multi-tenant auth)
create policy "anon_read_evaluation_queue" on evaluation_queue for select using (true);
create policy "anon_insert_evaluation_queue" on evaluation_queue for insert with check (true);
create policy "anon_update_evaluation_queue" on evaluation_queue for update using (true);

create policy "anon_read_audit_log" on audit_log for select using (true);
create policy "anon_insert_audit_log" on audit_log for insert with check (true);

create policy "anon_read_act_gated_queue" on act_gated_queue for select using (true);
create policy "anon_insert_act_gated_queue" on act_gated_queue for insert with check (true);
create policy "anon_update_act_gated_queue" on act_gated_queue for update using (true);

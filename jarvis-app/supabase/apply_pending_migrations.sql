-- JARVIS live-schema repair. Run this entire file in the Supabase SQL Editor.
-- It is safe to rerun. Order matters: task priority first, automation schema second.

-- 1) 20261020_add_task_priority.sql
alter table public.tasks
  add column if not exists priority text not null default 'normal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_priority_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_priority_check
      check (priority in ('high', 'normal', 'low'));
  end if;
end
$$;

-- 2) 20261021_create_automation_jobs.sql
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  request_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'planning', 'awaiting_approval', 'dispatching', 'dispatch_uncertain', 'queued', 'in_progress', 'evaluating', 'completed', 'failed')),
  planning_attempt_count smallint not null default 0 check (planning_attempt_count between 0 and 2),
  lease_expires_at timestamptz,
  plan jsonb,
  review jsonb,
  evaluation jsonb,
  github_task_id text,
  github_task_url text,
  github_pr_url text,
  github_state text,
  github_artifacts jsonb not null default '[]'::jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_jobs_created_at_idx
  on public.automation_jobs (created_at desc);

create table if not exists public.automation_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.automation_jobs (id) on delete cascade,
  name text not null,
  agent text not null check (agent in ('openai', 'claude', 'github')),
  status text not null check (status in ('running', 'completed', 'failed')),
  summary text,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists automation_job_steps_job_id_idx
  on public.automation_job_steps (job_id, started_at);

create table if not exists public.automation_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.automation_jobs (id) on delete cascade,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists automation_job_events_job_id_idx
  on public.automation_job_events (job_id, created_at);

alter table public.automation_jobs enable row level security;
alter table public.automation_job_steps enable row level security;
alter table public.automation_job_events enable row level security;

revoke all on public.automation_jobs, public.automation_job_steps, public.automation_job_events from anon, authenticated;
grant all on public.automation_jobs, public.automation_job_steps, public.automation_job_events to service_role;
grant usage, select on sequence public.automation_job_events_id_seq to service_role;

create or replace function public.claim_automation_job_planning(
  p_job_id uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer;
begin
  update public.automation_jobs
  set status = 'planning',
      planning_attempt_count = planning_attempt_count + 1,
      lease_expires_at = p_lease_expires_at,
      updated_at = p_now
  where id = p_job_id
    and planning_attempt_count < 2
    and (
      (status = 'pending' and lease_expires_at is null)
      or (status = 'planning' and lease_expires_at <= p_now)
    );
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.claim_automation_job_planning(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_automation_job_planning(uuid, timestamptz, timestamptz) to service_role;

-- Post-flight validation: the editor reports a clear SQL error if a required
-- object was not created, and a notice when the schema is ready.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'priority'
  ) then
    raise exception 'JARVIS migration incomplete: public.tasks.priority is missing';
  end if;
  if to_regclass('public.automation_jobs') is null
    or to_regclass('public.automation_job_steps') is null
    or to_regclass('public.automation_job_events') is null then
    raise exception 'JARVIS migration incomplete: one or more automation tables are missing';
  end if;
  if to_regprocedure('public.claim_automation_job_planning(uuid,timestamptz,timestamptz)') is null then
    raise exception 'JARVIS migration incomplete: planning claim function is missing';
  end if;
  raise notice 'JARVIS schema is ready: task priority and automation tables/function are present';
end
$$;

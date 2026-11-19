create table if not exists public.jarvis_action_runs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  source_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'awaiting_approval')),
  summary text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_action_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jarvis_action_runs(id) on delete cascade,
  action_key text not null,
  action_id text not null unique,
  kind text not null,
  label text not null,
  input jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'awaiting_approval')),
  requires_approval boolean not null default false,
  result text,
  error_code text,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jarvis_action_items_run_action_key_idx
  on public.jarvis_action_items (run_id, action_key);
create index if not exists jarvis_action_runs_updated_idx
  on public.jarvis_action_runs (updated_at desc);
create index if not exists jarvis_action_items_status_updated_idx
  on public.jarvis_action_items (status, updated_at desc);

alter table public.jarvis_action_runs enable row level security;
alter table public.jarvis_action_items enable row level security;
revoke all on public.jarvis_action_runs, public.jarvis_action_items from public, anon, authenticated;
grant all on public.jarvis_action_runs, public.jarvis_action_items to service_role;

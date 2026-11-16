-- Additive JARVIS self-evolution foundation.
-- Review and test locally. Do not apply to production without a separately
-- approved migration plan and verified backup.

create table public.master_vision_revisions (
  id uuid primary key default gen_random_uuid(),
  revision integer generated always as identity unique,
  idempotency_key text not null unique,
  title text not null check (length(trim(title)) between 1 and 160),
  content text not null check (length(trim(content)) between 1 and 40000),
  created_by text not null default 'user',
  created_at timestamptz not null default now()
);

create index master_vision_revisions_created_at_idx
  on public.master_vision_revisions (created_at desc);

create table public.development_items (
  id uuid primary key default gen_random_uuid(),
  vision_revision_id uuid not null references public.master_vision_revisions(id) on delete restrict,
  parent_id uuid references public.development_items(id) on delete restrict,
  item_type text not null check (item_type in ('goal', 'milestone', 'task')),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  priority smallint not null default 2 check (priority between 0 and 3),
  status text not null default 'backlog'
    check (status in ('backlog', 'ready', 'in_progress', 'testing', 'review', 'blocked', 'awaiting_approval', 'completed', 'failed', 'cancelled')),
  acceptance_criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(acceptance_criteria) = 'array'),
  test_requirements jsonb not null default '[]'::jsonb check (jsonb_typeof(test_requirements) = 'array'),
  affected_components text[] not null default '{}',
  estimated_effort_minutes integer check (estimated_effort_minutes is null or estimated_effort_minutes between 1 and 100000),
  blocked_reason text,
  idempotency_key text not null unique,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index development_items_status_priority_idx
  on public.development_items (status, priority, created_at);
create index development_items_parent_idx
  on public.development_items (parent_id, created_at);
create index development_items_vision_idx
  on public.development_items (vision_revision_id, created_at);

create table public.development_item_dependencies (
  item_id uuid not null references public.development_items(id) on delete restrict,
  depends_on_item_id uuid not null references public.development_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (item_id, depends_on_item_id),
  check (item_id <> depends_on_item_id)
);

create index development_item_dependencies_depends_on_idx
  on public.development_item_dependencies (depends_on_item_id);

create table public.development_item_events (
  id bigint generated always as identity primary key,
  item_id uuid references public.development_items(id) on delete set null,
  vision_revision_id uuid references public.master_vision_revisions(id) on delete set null,
  event_type text not null,
  actor text not null,
  from_status text,
  to_status text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (item_id is not null or vision_revision_id is not null)
);

create index development_item_events_item_idx
  on public.development_item_events (item_id, created_at desc);
create index development_item_events_vision_idx
  on public.development_item_events (vision_revision_id, created_at desc);

create or replace function public.create_master_vision_revision(
  p_title text,
  p_content text,
  p_idempotency_key text,
  p_actor text default 'user'
)
returns public.master_vision_revisions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  result public.master_vision_revisions;
begin
  insert into public.master_vision_revisions (title, content, idempotency_key, created_by)
  values (p_title, p_content, p_idempotency_key, p_actor)
  on conflict (idempotency_key) do nothing
  returning * into result;

  if not found then
    select * into result from public.master_vision_revisions
    where idempotency_key = p_idempotency_key;
    if result.title <> p_title or result.content <> p_content then
      raise exception 'development_idempotency_conflict' using errcode = 'P0001';
    end if;
    return result;
  end if;

  insert into public.development_item_events (
    vision_revision_id, event_type, actor, summary
  ) values (
    result.id, 'vision_revision_created', p_actor, 'Master Vision revision created'
  );
  return result;
end;
$function$;

create or replace function public.create_development_item(
  p_vision_revision_id uuid,
  p_parent_id uuid,
  p_item_type text,
  p_title text,
  p_description text,
  p_priority smallint,
  p_acceptance_criteria jsonb,
  p_test_requirements jsonb,
  p_affected_components text[],
  p_estimated_effort_minutes integer,
  p_idempotency_key text,
  p_dependencies uuid[],
  p_actor text default 'user'
)
returns public.development_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  result public.development_items;
  existing_dependencies uuid[];
  requested_dependencies uuid[];
begin
  if p_parent_id is not null and not exists (
    select 1 from public.development_items
    where id = p_parent_id and vision_revision_id = p_vision_revision_id
  ) then
    raise exception 'development_parent_not_found' using errcode = '23503';
  end if;

  requested_dependencies := coalesce(p_dependencies, '{}'::uuid[]);
  if cardinality(requested_dependencies) > 50
    or cardinality(requested_dependencies) <> (
      select count(distinct dependency_id)
      from unnest(requested_dependencies) as dependency_list(dependency_id)
    ) then
    raise exception 'development_dependencies_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(requested_dependencies) as dependency_list(dependency_id)
    left join public.development_items i
      on i.id = dependency_list.dependency_id and i.vision_revision_id = p_vision_revision_id
    where i.id is null
  ) then
    raise exception 'development_dependency_not_found' using errcode = '23503';
  end if;

  insert into public.development_items (
    vision_revision_id, parent_id, item_type, title, description, priority,
    acceptance_criteria, test_requirements, affected_components,
    estimated_effort_minutes, idempotency_key, created_by
  ) values (
    p_vision_revision_id, p_parent_id, p_item_type, p_title, coalesce(p_description, ''),
    p_priority, p_acceptance_criteria, p_test_requirements, coalesce(p_affected_components, '{}'),
    p_estimated_effort_minutes, p_idempotency_key, p_actor
  )
  on conflict (idempotency_key) do nothing
  returning * into result;

  if not found then
    select * into result from public.development_items
    where idempotency_key = p_idempotency_key;
    select coalesce(array_agg(depends_on_item_id order by depends_on_item_id), '{}'::uuid[])
      into existing_dependencies
      from public.development_item_dependencies where item_id = result.id;
    select coalesce(array_agg(dependency_id order by dependency_id), '{}'::uuid[])
      into requested_dependencies
      from unnest(requested_dependencies) as requested_dependency(dependency_id);
    if result.vision_revision_id <> p_vision_revision_id
      or result.parent_id is distinct from p_parent_id
      or result.item_type <> p_item_type
      or result.title <> p_title
      or result.description <> coalesce(p_description, '')
      or result.priority <> p_priority
      or result.acceptance_criteria <> p_acceptance_criteria
      or result.test_requirements <> p_test_requirements
      or result.affected_components <> coalesce(p_affected_components, '{}')
      or result.estimated_effort_minutes is distinct from p_estimated_effort_minutes
      or existing_dependencies <> requested_dependencies then
      raise exception 'development_idempotency_conflict' using errcode = 'P0001';
    end if;
    return result;
  end if;

  insert into public.development_item_dependencies (item_id, depends_on_item_id)
  select result.id, dependency_id
  from unnest(requested_dependencies) as dependency_list(dependency_id);
  insert into public.development_item_events (
    item_id, vision_revision_id, event_type, actor, to_status, summary, metadata
  ) values (
    result.id, result.vision_revision_id, 'item_created', p_actor, result.status,
    'Development item created', jsonb_build_object('dependency_count', cardinality(requested_dependencies))
  );
  return result;
end;
$function$;

create or replace function public.transition_development_item(
  p_item_id uuid,
  p_expected_status text,
  p_next_status text,
  p_actor text,
  p_summary text default ''
)
returns public.development_items
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  current_item public.development_items;
  updated_item public.development_items;
  allowed boolean := false;
begin
  select * into current_item
  from public.development_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'development_item_not_found' using errcode = 'P0002';
  end if;
  if current_item.status <> p_expected_status then
    raise exception 'development_item_conflict' using errcode = '40001';
  end if;

  allowed := case current_item.status
    when 'backlog' then p_next_status in ('ready', 'blocked', 'cancelled')
    when 'ready' then p_next_status in ('in_progress', 'blocked', 'awaiting_approval', 'cancelled')
    when 'in_progress' then p_next_status in ('testing', 'blocked', 'awaiting_approval', 'failed')
    when 'testing' then p_next_status in ('in_progress', 'review', 'blocked', 'failed')
    -- Completion stays unavailable until verified evidence and review are recorded.
    when 'review' then p_next_status in ('in_progress', 'blocked', 'awaiting_approval', 'failed')
    when 'blocked' then p_next_status in ('ready', 'in_progress', 'cancelled')
    when 'awaiting_approval' then p_next_status in ('ready', 'in_progress', 'cancelled')
    when 'failed' then p_next_status in ('ready', 'cancelled')
    else false
  end;

  if not allowed then
    raise exception 'development_item_transition_invalid' using errcode = '22023';
  end if;
  if p_next_status = 'in_progress' and exists (
    select 1
    from public.development_item_dependencies d
    join public.development_items dependency on dependency.id = d.depends_on_item_id
    where d.item_id = p_item_id and dependency.status <> 'completed'
  ) then
    raise exception 'development_item_dependencies_incomplete' using errcode = '23514';
  end if;
  if p_next_status = 'blocked' and length(trim(coalesce(p_summary, ''))) = 0 then
    raise exception 'development_block_reason_required' using errcode = '22023';
  end if;

  update public.development_items
  set status = p_next_status,
      blocked_reason = case when p_next_status = 'blocked' then left(trim(p_summary), 2000) else null end,
      updated_at = now()
  where id = p_item_id
  returning * into updated_item;

  insert into public.development_item_events (
    item_id, vision_revision_id, event_type, actor, from_status, to_status, summary
  ) values (
    updated_item.id, updated_item.vision_revision_id, 'status_changed',
    p_actor, current_item.status, updated_item.status,
    case when p_next_status = 'blocked' then 'Development item blocked' else 'Development item status changed' end
  );
  return updated_item;
end;
$function$;

alter table public.master_vision_revisions enable row level security;
alter table public.development_items enable row level security;
alter table public.development_item_dependencies enable row level security;
alter table public.development_item_events enable row level security;

revoke all on public.master_vision_revisions, public.development_items,
  public.development_item_dependencies, public.development_item_events
  from anon, authenticated;
revoke all on public.master_vision_revisions, public.development_items,
  public.development_item_dependencies, public.development_item_events
  from public;
grant select on public.master_vision_revisions, public.development_items,
  public.development_item_dependencies, public.development_item_events to service_role;

revoke all on function public.create_master_vision_revision(text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_development_item(uuid, uuid, text, text, text, smallint, jsonb, jsonb, text[], integer, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.transition_development_item(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_master_vision_revision(text, text, text, text) to service_role;
grant execute on function public.create_development_item(uuid, uuid, text, text, text, smallint, jsonb, jsonb, text[], integer, text, uuid[], text) to service_role;
grant execute on function public.transition_development_item(uuid, text, text, text, text) to service_role;

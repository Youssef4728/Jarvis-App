-- Im Supabase SQL Editor ausführen (zuerst diese Datei, dann seed.sql)
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'allgemein', -- schule, gym, essen ...
  weekdays int[] not null,                     -- 0=So, 1=Mo ... 6=Sa
  time time,
  end_time time,
  notes text,
  active boolean not null default true
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day date not null,
  time time,
  category text not null default 'allgemein', -- fussball, termin, reise, privat ...
  notes text,
  skipped boolean not null default false       -- true = findet für dich nicht statt
);

-- Zeiträume, in denen ganze Kategorien pausieren (Ferien, Reise ...)
create table if not exists breaks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  categories text[] not null
);

create table if not exists messages (
  id bigint generated always as identity primary key,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table routines enable row level security;
alter table events enable row level security;
alter table breaks enable row level security;
alter table messages enable row level security;
-- Zugriff läuft nur über den Service-Key auf dem Server.

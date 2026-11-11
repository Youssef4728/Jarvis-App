-- Nach schema.sql und seed.sql ausführen: Daten für den Agenten
create table if not exists tasks (id uuid primary key default gen_random_uuid(), text text not null, due date, done boolean not null default false, priority text not null default 'normal' check (priority in ('high', 'normal', 'low')));
create table if not exists facts (id uuid primary key default gen_random_uuid(), text text not null, created_at timestamptz default now());
create table if not exists money (id uuid primary key default gen_random_uuid(), amt numeric not null, note text, day date not null default current_date);
create table if not exists goals (id uuid primary key default gen_random_uuid(), name text not null, target numeric not null, saved numeric not null default 0);
create table if not exists gym_logs (id uuid primary key default gen_random_uuid(), ex text not null, kg numeric default 0, reps int default 0, sets int default 1, day date not null default current_date);
create table if not exists habits (id uuid primary key default gen_random_uuid(), name text not null unique);
create table if not exists habit_checks (day date not null, habit text not null, primary key (day, habit));
alter table tasks enable row level security; alter table facts enable row level security; alter table money enable row level security;
alter table goals enable row level security; alter table gym_logs enable row level security; alter table habits enable row level security; alter table habit_checks enable row level security;
insert into goals (name, target) values ('Paris', 300), ('Möbel', 500);
insert into habits (name) values ('Gebet'), ('Gesund essen'), ('Reha/Dehnen'), ('Lernen') on conflict do nothing;

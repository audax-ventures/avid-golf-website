-- AVID Golf league leaderboard
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Anyone can read the leaderboard. Only accounts listed in public.admins can change it.

create extension if not exists pgcrypto;

-- Admin accounts --------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- League data -----------------------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_current boolean not null default false,
  week_count int not null default 16 check (week_count between 1 and 30),
  counting_rounds int not null default 10 check (counting_rounds between 1 and 30),
  created_at timestamptz not null default now()
);
-- How a missed week counts: 'worst' = the highest score posted that week in the
-- team's league (plus missed_penalty strokes); 'blank' = left out of the total.
alter table public.seasons add column if not exists missed_rule text not null default 'worst'
  check (missed_rule in ('worst', 'blank'));
alter table public.seasons add column if not exists missed_penalty int not null default 0
  check (missed_penalty between 0 and 20);

-- Only one season can be the current one.
create unique index if not exists seasons_one_current on public.seasons (is_current) where is_current;

-- Weeks are shared by every league in a season (everyone plays the same course).
create table if not exists public.weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  week_number int not null check (week_number >= 1),
  course text not null default '',
  par int check (par between 18 and 200),
  play_date date,
  published boolean not null default false,
  unique (season_id, week_number)
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  name text not null,
  kind text not null default 'team' check (kind in ('team', 'individual')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.flights (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- A team (or a player, in an individual league).
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues on delete cascade,
  flight_id uuid references public.flights on delete set null,
  name text not null,
  captain text not null default '',
  created_at timestamptz not null default now()
);

-- A team's flight must belong to the team's league.
create or replace function public.check_team_flight()
returns trigger
language plpgsql
as $$
begin
  if new.flight_id is not null and not exists (
    select 1 from public.flights f where f.id = new.flight_id and f.league_id = new.league_id
  ) then
    new.flight_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists teams_check_flight on public.teams;
create trigger teams_check_flight before insert or update on public.teams
  for each row execute function public.check_team_flight();

-- Gross score for one team in one week.
create table if not exists public.scores (
  team_id uuid not null references public.teams on delete cascade,
  week_id uuid not null references public.weeks on delete cascade,
  strokes int not null check (strokes between 1 and 400),
  updated_at timestamptz not null default now(),
  primary key (team_id, week_id)
);

-- Closest to the pin: one row per par 3 per week, across all leagues.
create table if not exists public.ctp_results (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks on delete cascade,
  hole int not null check (hole between 1 and 18),
  player text not null default '',
  distance_in numeric(7, 1) check (distance_in >= 0),
  updated_at timestamptz not null default now()
);

-- Prize tracking for closest-to-the-pin winners. Admin only: never shown publicly.
create table if not exists public.ctp_prizes (
  ctp_id uuid primary key references public.ctp_results on delete cascade,
  claimed boolean not null default false,
  prize text not null default '',
  updated_at timestamptz not null default now()
);

-- Hole in ones, listed on the leaderboard's closest-to-the-pin tab.
create table if not exists public.hole_in_ones (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons on delete cascade,
  player text not null,
  hole int not null check (hole between 1 and 18),
  course text not null default '',
  play_date date,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists scores_touch on public.scores;
create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();
drop trigger if exists ctp_touch on public.ctp_results;
create trigger ctp_touch before update on public.ctp_results
  for each row execute function public.touch_updated_at();

create index if not exists weeks_season on public.weeks (season_id);
create index if not exists leagues_season on public.leagues (season_id);
create index if not exists flights_league on public.flights (league_id);
create index if not exists teams_league on public.teams (league_id);
create index if not exists scores_week on public.scores (week_id);
create index if not exists ctp_week on public.ctp_results (week_id);
create index if not exists aces_season on public.hole_in_ones (season_id);

-- Permissions -----------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.seasons enable row level security;
alter table public.weeks enable row level security;
alter table public.leagues enable row level security;
alter table public.flights enable row level security;
alter table public.teams enable row level security;
alter table public.scores enable row level security;
alter table public.ctp_results enable row level security;
alter table public.hole_in_ones enable row level security;
alter table public.ctp_prizes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.seasons, public.weeks, public.leagues, public.flights,
  public.teams, public.scores, public.ctp_results, public.hole_in_ones to anon, authenticated;
grant insert, update, delete on public.seasons, public.weeks, public.leagues,
  public.flights, public.teams, public.scores, public.ctp_results, public.hole_in_ones to authenticated;
grant select on public.admins to authenticated;
-- Prize details: signed-in accounts only (the policy below limits them to admins). No public access.
grant select, insert, update, delete on public.ctp_prizes to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "Admins can see themselves" on public.admins;
create policy "Admins can see themselves" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Setup tables: everyone can read, admins can change.
do $$
declare t text;
begin
  foreach t in array array['seasons', 'weeks', 'leagues', 'flights', 'teams', 'hole_in_ones'] loop
    execute format('drop policy if exists "Public read" on public.%I', t);
    execute format('create policy "Public read" on public.%I for select using (true)', t);
    execute format('drop policy if exists "Admin write" on public.%I', t);
    execute format('create policy "Admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Results: the public only sees weeks the admin has published.
drop policy if exists "Public read published" on public.scores;
create policy "Public read published" on public.scores for select using (
  public.is_admin() or exists (select 1 from public.weeks w where w.id = week_id and w.published)
);
drop policy if exists "Admin write" on public.scores;
create policy "Admin write" on public.scores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public read published" on public.ctp_results;
create policy "Public read published" on public.ctp_results for select using (
  public.is_admin() or exists (select 1 from public.weeks w where w.id = week_id and w.published)
);
drop policy if exists "Admin write" on public.ctp_results;
create policy "Admin write" on public.ctp_results
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins only" on public.ctp_prizes;
create policy "Admins only" on public.ctp_prizes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists ctp_prizes_touch on public.ctp_prizes;
create trigger ctp_prizes_touch before update on public.ctp_prizes
  for each row execute function public.touch_updated_at();

-- Live updates ----------------------------------------------------------------
-- Lets the public leaderboard refresh by itself when scores change.

do $$
declare t text;
begin
  foreach t in array array['seasons', 'weeks', 'leagues', 'flights', 'teams', 'scores', 'ctp_results', 'hole_in_ones'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

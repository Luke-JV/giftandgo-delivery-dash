-- Leaderboard v0.2: ranked on score. Run profanity-filter.sql first (it defines is_clean_name).
-- Safe to run more than once.
--
-- Before running: export public.scores as CSV from the Table Editor and commit it as
-- supabase/archive/leaderboard-v0.1.csv. Step 1 also copies it to scores_v01_archive in the database.

-- 1. Snapshot the v0.1 board (ranked on distance). It stays open for builds already in the wild;
--    see leaderboard-v0.1-reopen.sql.
create table if not exists public.scores_v01_archive as select * from public.scores;
alter table public.scores_v01_archive enable row level security;
drop policy if exists "scores_v01_archive readable" on public.scores_v01_archive;
create policy "scores_v01_archive readable" on public.scores_v01_archive for select to anon, authenticated using (true);

-- 2. The v0.2 board.
create table if not exists public.scores_v02 (
  id bigint generated always as identity primary key,
  nickname text not null,
  score int not null check (score between 0 and 100000000),
  distance int not null check (distance between 0 and 100000000),
  gifts int not null check (gifts >= 0),
  points int not null check (points >= 0),
  max_multiplier smallint not null check (max_multiplier between 1 and 8),
  deliveries smallint not null check (deliveries >= 0),
  duration real not null check (duration >= 0),
  created_at timestamptz not null default now()
);
create index if not exists scores_v02_rank on public.scores_v02 (score desc, created_at asc);

-- Read-only to the public; rows are written only through submit_score_v02.
alter table public.scores_v02 enable row level security;
drop policy if exists "scores_v02 readable" on public.scores_v02;
create policy "scores_v02 readable" on public.scores_v02 for select to anon, authenticated using (true);

-- 3. Server-timed runs. The game calls start_run when a run begins and passes the id to
--    submit_score_v02, which allows each id once and only within 6 hours of starting. The run can
--    claim no more time than the server saw pass, so made-up durations and instant submissions fail.
create table if not exists public.runs_v02 (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index if not exists runs_v02_started on public.runs_v02 (started_at);
-- No policies: only start_run and submit_score_v02 (security definer) touch it.
alter table public.runs_v02 enable row level security;

create or replace function public.start_run() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  delete from public.runs_v02 where started_at < now() - interval '6 hours';
  insert into public.runs_v02 default values returning id into new_id;
  return new_id;
end $$;

revoke all on function public.start_run from public;
grant execute on function public.start_run to anon, authenticated;

-- The signature without a run id is gone; a client that still sends it gets an error.
drop function if exists public.submit_score_v02(text, int, int, int, int, real, int, int);

-- Plausibility. Distance, gift and point limits are the same as v0.1. Score is capped by the most
-- the rules can pay for a run of this length:
--   gift points: a gift pays at most 250 (a purple x5 gift under a 50-point jackpot)
--   gifts:       at most x8 the gift points earned (the multiplier tops out at x8)
--   pace trickle: 1 point per second at the start, rising with pace, at x8: 8 * distance(t) / 86
--                (speed is 86 + 240 * (1 - e^(-t/60)) + 0.6t, so distance(t) is 86t + 240 * (t - 60 * (1 - e^(-t/60))) + 0.3t^2)
--   deliveries:  at most one per 25s (the first needs about 20s), each worth 100 * 8
--   powerpups:   at most one per 50s (the first from 35s), each worth 250 * 8
--   slots:       at most one per 30s (the first from 25s), each worth at most 500 * 8
create or replace function public.submit_score_v02(
  p_run_id uuid, p_nickname text, p_score int, p_distance int, p_gifts int, p_points int, p_duration real,
  p_max_multiplier int, p_deliveries int
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
  clean_name text := btrim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  run_started timestamptz;
begin
  -- Any exception below rolls this back, so a rejected name can be retried on the same run.
  update public.runs_v02 set submitted_at = now()
  where id = p_run_id and submitted_at is null and started_at > now() - interval '6 hours'
  returning started_at into run_started;
  if run_started is null then raise exception 'run expired or already submitted'; end if;
  -- Pauses and menus only add server time, so the game clock can never legitimately exceed it.
  if p_duration > extract(epoch from now() - run_started) + 2 then raise exception 'implausible duration'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 16 then raise exception 'invalid name length'; end if;
  if not public.is_clean_name(clean_name) then raise exception 'name not allowed'; end if;
  if p_duration < 3 then raise exception 'run too short'; end if;
  if p_score < 0 or p_distance < 0 or p_gifts < 0 or p_points < 0 or p_deliveries < 0 then raise exception 'invalid run'; end if;
  if p_max_multiplier < 1 or p_max_multiplier > 8 then raise exception 'implausible multiplier'; end if;
  if p_distance > (86 * p_duration + 240 * (p_duration - 60 * (1 - exp(-p_duration / 60))) + 0.3 * p_duration * p_duration)
     + 0.6 * (86 + 240 * (1 - exp(-p_duration / 60)) + 0.6 * p_duration) * (6.5 + 0.45 * p_duration) + 50 then
    raise exception 'implausible distance';
  end if;
  if p_gifts > p_duration / 0.5 + 25 * (p_duration / 30 + 1)
     or p_points > p_gifts * 250 + 100 * (p_duration / 30 + 1) then
    raise exception 'implausible gifts';
  end if;
  if p_deliveries > p_duration / 25 + 1 then raise exception 'implausible deliveries'; end if;
  if p_score > 8 * p_points + 8 * (86 * p_duration + 240 * (p_duration - 60 * (1 - exp(-p_duration / 60))) + 0.3 * p_duration * p_duration) / 86
     + 800 * (p_duration / 25 + 1) + 2000 * (p_duration / 50 + 1) + 4000 * (p_duration / 30 + 1) + 100 then
    raise exception 'implausible score';
  end if;
  insert into public.scores_v02 (nickname, score, distance, gifts, points, max_multiplier, deliveries, duration)
  values (clean_name, p_score, p_distance, p_gifts, p_points, p_max_multiplier, p_deliveries, p_duration)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.submit_score_v02 from public;
grant execute on function public.submit_score_v02 to anon, authenticated;

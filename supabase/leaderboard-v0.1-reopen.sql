-- Reopen the v0.1 board (ranked on distance): builds already in the wild still submit to it.
-- Undoes the freeze from earlier versions of leaderboard-v0.2.sql. Safe to run more than once,
-- and safe whether or not that freeze was ever run. Run profanity-filter.sql first (is_clean_name).

drop trigger if exists scores_v01_frozen_rows on public.scores;
drop trigger if exists scores_v01_frozen_truncate on public.scores;
drop function if exists public.scores_v01_frozen();
comment on table public.scores is 'Leaderboard v0.1 (distance). Still open for older builds; new builds submit to scores_v02.';

alter table public.scores drop constraint if exists scores_distance_check;
alter table public.scores add constraint scores_distance_check check (distance between 0 and 100000000);

create or replace function public.submit_score(
  p_nickname text, p_distance int, p_gifts int, p_points int, p_duration real
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
  clean_name text := btrim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 16 then raise exception 'invalid name length'; end if;
  if not public.is_clean_name(clean_name) then raise exception 'name not allowed'; end if;
  -- Max distance: unboosted curve plus the most extra distance a fully upgraded
  -- nitro tank allows (6s tank, 8s recharge: at most ~43% of the run boosting).
  if p_distance > 86 * p_duration + 1.2 * p_duration * p_duration
     + 0.6 * (86 + 2.4 * p_duration) * (6.5 + 0.45 * p_duration) + 50 then
    raise exception 'implausible distance';
  end if;
  -- Holiday Gift Shoppe can fill every lane for a few rows; coupons are at least
  -- 30 seconds apart.
  if p_gifts > p_duration / 0.8 + 25 * (p_duration / 30 + 1)
     or p_points > p_gifts * 50 + 100 * (p_duration / 30 + 1) then
    raise exception 'implausible gifts';
  end if;
  if p_duration < 3 then raise exception 'run too short'; end if;
  insert into public.scores (nickname, distance, gifts, points, duration)
  values (clean_name, p_distance, p_gifts, p_points, p_duration)
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.submit_score from public;
grant execute on function public.submit_score to anon, authenticated;

-- Optional: the snapshot taken by the old freeze is now stale.
-- drop table if exists public.scores_v01_archive;

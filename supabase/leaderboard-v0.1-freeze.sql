-- Freeze the v0.1 board (ranked on distance). Run when the v0.2 build is deployed: older builds can't
-- send a server-timed run id, so submit_score can't be protected against made-up runs and is closed instead.
-- The board stays readable as the Hall of Fame. Safe to run more than once; leaderboard-v0.1-reopen.sql undoes it.
-- Direct writes to scores are already blocked by RLS, so closing submit_score closes the board.

create or replace function public.submit_score(
  p_nickname text, p_distance int, p_gifts int, p_points int, p_duration real
) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'leaderboard v0.1 is closed';
end $$;

revoke all on function public.submit_score from public;
grant execute on function public.submit_score to anon, authenticated;

comment on table public.scores is 'Leaderboard v0.1 (distance). Frozen; new builds submit to scores_v02.';

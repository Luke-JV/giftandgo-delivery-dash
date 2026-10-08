-- Ranked views for leaderboard search. Each row carries its position on the whole board, so a
-- search for a name still shows that run's overall rank. Safe to run more than once.
-- Order matches the game's lists: best first, the earlier run wins a tie. Filters on nickname are
-- applied after the window function, so ranks are never renumbered within a search.

create or replace view public.scores_v02_ranked with (security_invoker = true) as
  select id, nickname, score, distance, gifts, row_number() over (order by score desc, created_at asc) as rank
  from public.scores_v02;

create or replace view public.scores_ranked with (security_invoker = true) as
  select id, nickname, distance, gifts, row_number() over (order by distance desc, created_at asc) as rank
  from public.scores;

grant select on public.scores_v02_ranked, public.scores_ranked to anon, authenticated;

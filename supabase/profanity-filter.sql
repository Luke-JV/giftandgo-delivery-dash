-- Server-side name filter. Mirrors isProfane() in src/delivery-dash.leaderboard.ts.
create or replace function public.is_clean_name(p_name text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  norm text;
  letters text;
  squashed text;
  bad text;
  subs text[] := array['fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','bollock','retard','asshole','dickhead','cocksuck','motherf','bastard','hitler','porn','http'];
  words text[] := array['rape','rapist','nazi','dick','cock','slut','tit','tits','ass','cum','anal','sex','fag','paki','coon','kike','spic','twat','piss','wank'];
begin
  if p_name ~ '[\u0001-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]' then return false; end if;
  norm := translate(lower(p_name), 'àáâäãåèéêëìíîïòóôöõùúûüýÿ', 'aaaaaaeeeeiiiiooooouuuuyy');
  norm := translate(norm, '0134578@$!+|', 'oieastbasiti');
  letters := replace(regexp_replace(norm, '[^a-z]', '', 'g'), 'scunthorpe', '');
  squashed := regexp_replace(letters, '(.)\1+', '\1', 'g');
  foreach bad in array subs loop
    if position(bad in letters) > 0 or position(regexp_replace(bad, '(.)\1+', '\1', 'g') in squashed) > 0 then
      return false;
    end if;
  end loop;
  return not exists (select 1 from regexp_split_to_table(norm, '[^a-z]+') as word where word = any(words));
end $$;

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
  -- Max distance: unboosted curve plus the most extra distance the nitro meter allows.
  if p_distance > 86 * p_duration + 1.2 * p_duration * p_duration
     + 0.6 * (86 + 2.4 * p_duration) * (2.5 + 0.3 * p_duration) + 50 then
    raise exception 'implausible distance';
  end if;
  if p_gifts > p_duration / 0.8 + 3 or p_points > p_gifts * 50 + 100 * (p_duration / 30 + 1) then
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

-- Optional: remove any existing entries that fail the filter.
-- delete from public.scores where not public.is_clean_name(nickname);

-- Boost lets very long runs exceed the original 200,000m cap.
alter table public.scores drop constraint if exists scores_distance_check;
alter table public.scores add constraint scores_distance_check check (distance between 0 and 2000000);

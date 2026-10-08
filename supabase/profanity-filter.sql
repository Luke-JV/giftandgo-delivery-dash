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
-- submit_score for the v0.1 board lives in leaderboard-v0.1-reopen.sql.


-- Optional: remove any entries that fail the filter.
-- delete from public.scores where not public.is_clean_name(nickname);
-- delete from public.scores_v02 where not public.is_clean_name(nickname);


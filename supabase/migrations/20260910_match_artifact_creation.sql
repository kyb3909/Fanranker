-- Apply before deploying the app. Existing posts, polls, comments and votes are preserved.
-- All new creation callers must use these RPCs. Drain old direct-INSERT workers at cutover.
begin;

create index if not exists match_lineups_lfa_event_idx on public.match_lineups(event_id)
  where payload->>'source' = 'lfa';

-- Read persisted identity again inside the creation transaction, including pre-link caches.
create or replace function public.lfa_artifact_game_ids(p_match_id text)
returns text[] language sql volatile security invoker set search_path = public, pg_temp as $$
  with seeds as (
    select id::text as id from public.lfa_fixtures where lfa_match_id = p_match_id
    union select betman_game_id::text from public.lfa_fixtures
      where lfa_match_id = p_match_id and betman_game_id is not null
    union select game_id from public.match_details_cache where lfa_match_id = p_match_id
    union select game_id from public.match_lineups where event_id = p_match_id
      and payload->>'source' = 'lfa' and payload->>'matchId' = p_match_id
  ), markets as (
    select b.id::text as id from public.betman_games a
    join public.betman_games b on b.league_code is not distinct from a.league_code
      and b.home_team_name = a.home_team_name and b.away_team_name = a.away_team_name
      and b.match_time = a.match_time and b.sport = a.sport
    where a.id::text in (select id from seeds)
  ), ids as (
    select id from seeds union select id from markets
    union select f.id::text from public.lfa_fixtures f
      where f.betman_game_id::text in (select id from markets)
  ) select coalesce(array_agg(id order by id), '{}'::text[]) from ids where id is not null;
$$;

create or replace function public.ensure_lfa_match_thread(
  p_match_id text, p_game_id uuid, p_user_id text, p_title text, p_content jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_ids text[]; v_id uuid;
begin
  if nullif(p_match_id, '') is null or p_game_id is null then raise exception 'missing LFA identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lfa-thread:' || p_match_id, 0));
  v_ids := public.lfa_artifact_game_ids(p_match_id);
  if not (p_game_id::text = any(v_ids)) then raise exception 'unproven LFA identity'; end if;
  if exists(select 1 from public.lfa_fixtures where id::text = any(v_ids) and lfa_match_id <> p_match_id)
    or exists(select 1 from public.match_details_cache where game_id = any(v_ids) and lfa_match_id <> p_match_id)
    or exists(select 1 from public.match_lineups where game_id = any(v_ids)
      and payload->>'source' = 'lfa' and event_id <> p_match_id)
  then raise exception 'conflicting LFA identity'; end if;
  select id into v_id from public.posts where match_game_id::text = any(v_ids)
    order by created_at, id limit 1;
  if found then return jsonb_build_object('id', v_id, 'created', false); end if;
  if not exists(select 1 from public.match_lineups where game_id = any(v_ids)
    and event_id = p_match_id and payload->>'source' = 'lfa'
    and payload->>'matchId' = p_match_id and payload->>'status' = 'ready'
    and payload->>'projected' = 'false')
  then raise exception 'confirmed LFA lineup required'; end if;
  insert into public.posts(user_id, community_slug, title, content, match_game_id)
    values (p_user_id, 'football', p_title, p_content, p_game_id) returning id into v_id;
  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

create or replace function public.ensure_lfa_motm_poll(
  p_match_id text, p_game_id uuid, p_match_key text, p_question text,
  p_options jsonb, p_closes_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_ids text[]; v_id uuid;
begin
  if nullif(p_match_id, '') is null or p_game_id is null then raise exception 'missing LFA identity'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lfa-motm:' || p_match_id, 0));
  v_ids := public.lfa_artifact_game_ids(p_match_id);
  if not (p_game_id::text = any(v_ids)) then raise exception 'unproven LFA identity'; end if;
  if exists(select 1 from public.lfa_fixtures where id::text = any(v_ids) and lfa_match_id <> p_match_id)
    or exists(select 1 from public.match_details_cache where game_id = any(v_ids) and lfa_match_id <> p_match_id)
    or exists(select 1 from public.match_lineups where game_id = any(v_ids)
      and payload->>'source' = 'lfa' and event_id <> p_match_id)
  then raise exception 'conflicting LFA identity'; end if;
  select id into v_id from public.polls where kind = 'motm'
    and (game_id = any(v_ids) or match_key = 'lfa_' || p_match_id or match_key = p_match_key)
    order by created_at, id limit 1;
  if found then return jsonb_build_object('id', v_id, 'created', false); end if;
  if not exists(select 1 from public.match_lineups where game_id = any(v_ids)
    and event_id = p_match_id and payload->>'source' = 'lfa'
    and payload->>'matchId' = p_match_id and payload->>'status' = 'ready'
    and payload->>'projected' = 'false')
  then raise exception 'confirmed LFA lineup required'; end if;
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) < 18
    or nullif(p_match_key, '') is null or p_closes_at is null
  then raise exception 'invalid MOTM options or deadline'; end if;
  insert into public.polls(question, options, is_active, allow_reason, created_by, kind, match_key, game_id, closes_at)
    values (p_question, p_options, p_closes_at > now(), false, 'system_motm', 'motm', p_match_key, p_game_id::text, p_closes_at)
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

revoke all on function public.lfa_artifact_game_ids(text) from public, anon, authenticated;
revoke all on function public.ensure_lfa_match_thread(text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.ensure_lfa_motm_poll(text, uuid, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.lfa_artifact_game_ids(text) to service_role;
grant execute on function public.ensure_lfa_match_thread(text, uuid, text, text, jsonb) to service_role;
grant execute on function public.ensure_lfa_motm_poll(text, uuid, text, text, jsonb, timestamptz) to service_role;
commit;

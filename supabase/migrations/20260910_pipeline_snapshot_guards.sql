-- Apply before deploying the application. No historical rows are rewritten.
-- Only provider snapshots use these functions; label-only corrections remain independent.
begin;

create or replace function public.write_lfa_fixture_snapshot(p_fixture jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_row public.lfa_fixtures%rowtype;
  v_id text := p_fixture->>'lfaId';
  v_time timestamptz;
begin
  if nullif(v_id, '') is null or jsonb_typeof(p_fixture->'sourceUpdatedAt') is distinct from 'number'
    or (p_fixture->>'sourceUpdatedAt')::numeric <= 0
    or coalesce(p_fixture->>'status', '') not in ('scheduled', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid fixture snapshot';
  end if;
  v_time := to_timestamp((p_fixture->>'sourceUpdatedAt')::numeric / 1000);
  perform pg_advisory_xact_lock(hashtextextended('lfa-fixture:' || v_id, 0));
  select * into v_row from public.lfa_fixtures where lfa_match_id = v_id for update;
  if found and (
    coalesce((v_row.fixture->>'sourceUpdatedAt')::numeric, 0) >= (p_fixture->>'sourceUpdatedAt')::numeric
    or (v_row.fixture->>'status' = 'completed' and p_fixture->>'status' <> 'completed')
  ) then return to_jsonb(v_row); end if;
  insert into public.lfa_fixtures(lfa_match_id, fixture, match_time, updated_at)
    values(v_id, p_fixture, (p_fixture->>'matchTime')::timestamptz, v_time)
    on conflict(lfa_match_id) do update set fixture = excluded.fixture,
      match_time = excluded.match_time, updated_at = excluded.updated_at
    returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.write_lfa_lineup_snapshot(
  p_game_ids text[], p_match_id text, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_best public.match_lineups%rowtype;
  v_game_id text;
  v_time timestamptz;
  v_old_time timestamptz;
  v_predicted boolean;
  v_count integer;
begin
  select min(id) into v_game_id from unnest(p_game_ids) ids(id) where id <> '';
  if v_game_id is null or nullif(p_match_id, '') is null
    or p_payload->>'status' is distinct from 'ready'
    or p_payload->>'source' is distinct from 'lfa'
    or p_payload->>'matchId' is distinct from p_match_id
    or jsonb_typeof(p_payload->'projected') is distinct from 'boolean' then
    raise exception 'invalid lineup snapshot';
  end if;
  v_time := coalesce(p_payload#>>'{observation,requestedAt}', p_payload->>'fetchedAt')::timestamptz;
  if v_time is null then raise exception 'lineup source time missing'; end if;
  v_predicted := (p_payload->>'projected')::boolean;
  perform pg_advisory_xact_lock(hashtextextended('lfa-lineup:' || p_match_id, 0));
  if exists(select 1 from public.match_lineups where game_id = any(p_game_ids)
    and payload->>'source' = 'lfa' and event_id <> p_match_id) then
    raise exception 'lfa lineup identity conflict';
  end if;
  select * into v_best from public.match_lineups
    where game_id = any(p_game_ids) or (event_id = p_match_id and payload->>'source' = 'lfa')
    order by (coalesce(payload->>'projected', 'false') = 'false') desc,
      coalesce((payload#>>'{observation,requestedAt}')::timestamptz,
        (payload->>'fetchedAt')::timestamptz, updated_at) desc limit 1 for update;
  if found then
    if v_best.payload->>'source' = 'lfa' and v_best.event_id <> p_match_id then
      raise exception 'lfa lineup identity conflict';
    end if;
    v_old_time := coalesce((v_best.payload#>>'{observation,requestedAt}')::timestamptz,
      (v_best.payload->>'fetchedAt')::timestamptz, v_best.updated_at);
    if v_old_time >= v_time or
      (coalesce(v_best.payload->>'projected', 'false') = 'false' and v_predicted) then
      return jsonb_build_object('written', false, 'payload', v_best.payload);
    end if;
    -- Keep the established storage ID; sibling readers already share this row.
    v_game_id := v_best.game_id;
  end if;
  insert into public.match_lineups(game_id, event_id, payload, updated_at)
    values(v_game_id, p_match_id, p_payload, v_time)
    on conflict(game_id) do update set event_id = excluded.event_id,
      payload = excluded.payload, updated_at = excluded.updated_at
    where (match_lineups.payload->>'source' is distinct from 'lfa' or match_lineups.event_id = p_match_id)
      and coalesce((match_lineups.payload#>>'{observation,requestedAt}')::timestamptz,
        (match_lineups.payload->>'fetchedAt')::timestamptz, match_lineups.updated_at) < v_time
      and (coalesce(match_lineups.payload->>'projected', 'false') = 'true' or not v_predicted);
  get diagnostics v_count = row_count;
  select * into v_best from public.match_lineups where game_id = v_game_id;
  if v_best.payload->>'source' = 'lfa' and v_best.event_id <> p_match_id then
    raise exception 'lfa lineup identity conflict';
  end if;
  return jsonb_build_object('written', v_count > 0, 'payload', v_best.payload);
end;
$$;

create or replace function public.append_motm_options(p_poll_id uuid, p_options jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_poll public.polls%rowtype;
  v_options jsonb;
  v_item jsonb;
  v_added integer := 0;
begin
  if jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'invalid motm options';
  end if;
  select * into v_poll from public.polls where id = p_poll_id and kind = 'motm' for update;
  if not found then raise exception 'motm poll missing'; end if;
  v_options := coalesce(v_poll.options, '[]'::jsonb);
  if not v_poll.is_active or (v_poll.closes_at is not null and v_poll.closes_at <= now()) then
    return jsonb_build_object('added', 0, 'options', v_options);
  end if;
  for v_item in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(v_item->'key') is distinct from 'string' or nullif(v_item->>'key', '') is null then
      raise exception 'invalid motm option key';
    end if;
    if not exists(select 1 from jsonb_array_elements(v_options) o where o->>'key' = v_item->>'key') then
      v_options := v_options || jsonb_build_array(v_item);
      v_added := v_added + 1;
    end if;
  end loop;
  if v_added > 0 then update public.polls set options = v_options where id = p_poll_id; end if;
  return jsonb_build_object('added', v_added, 'options', v_options);
end;
$$;

revoke all on function public.write_lfa_fixture_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.write_lfa_lineup_snapshot(text[], text, jsonb) from public, anon, authenticated;
revoke all on function public.append_motm_options(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_lfa_fixture_snapshot(jsonb) to service_role;
grant execute on function public.write_lfa_lineup_snapshot(text[], text, jsonb) to service_role;
grant execute on function public.append_motm_options(uuid, jsonb) to service_role;
commit;

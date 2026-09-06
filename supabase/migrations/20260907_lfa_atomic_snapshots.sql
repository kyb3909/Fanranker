-- 먼저 DB 적용, 그다음 앱 배포. 기존 데이터/정산/라인업은 변경하지 않는다.
-- rollback: 앱을 먼저 이전 버전으로 돌린다. 보호 트리거/RPC는 남겨도 기존 앱과 호환된다.
-- 호출은 service_role 전용. 모든 새 앱의 상세/날짜 저장 경로가 이 RPC를 사용한다.

begin;

create index if not exists match_details_cache_lfa_match_idx
  on public.match_details_cache (lfa_match_id);

create or replace function public.write_lfa_day_snapshot(
  p_date text, p_payload jsonb, p_updated_at timestamptz
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if p_updated_at is null or jsonb_typeof(p_payload) is distinct from 'array' then
    raise exception 'invalid day snapshot';
  end if;
  insert into public.lfa_day_cache (date_utc, payload, match_count, updated_at)
  values (p_date, p_payload, jsonb_array_length(p_payload), p_updated_at)
  on conflict (date_utc) do update set
    payload = excluded.payload, match_count = excluded.match_count, updated_at = excluded.updated_at
  where lfa_day_cache.updated_at < excluded.updated_at
    -- 일시적인 빈 목록으로 이미 확보한 하루 일정을 지우지 않는다.
    and (excluded.match_count > 0 or lfa_day_cache.match_count = 0);
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.write_lfa_match_snapshot(
  p_game_ids text[], p_match_id text, p_payload jsonb, p_updated_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_best public.match_details_cache%rowtype;
  v_game_id text;
  v_finished boolean;
  v_count integer;
begin
  select min(id) into v_game_id from unnest(p_game_ids) as ids(id) where id <> '';
  if v_game_id is null or nullif(p_match_id, '') is null or p_updated_at is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or (p_payload->>'matchId') is distinct from p_match_id
    or jsonb_typeof(p_payload->'finished') is distinct from 'boolean' then
    raise exception 'invalid match snapshot';
  end if;
  v_finished := (p_payload->>'finished')::boolean;

  -- 같은 공급자 경기의 서로 다른 마켓 요청도 직렬화한다. 비교와 저장은 같은 트랜잭션.
  perform pg_advisory_xact_lock(hashtextextended('lfa-snapshot:' || p_match_id, 0));
  if exists (
    select 1 from public.match_details_cache
    where game_id = any(p_game_ids) and lfa_match_id is not null and lfa_match_id <> p_match_id
  ) then
    raise exception 'lfa snapshot identity conflict';
  end if;
  select * into v_best from public.match_details_cache
    where game_id = any(p_game_ids) or lfa_match_id = p_match_id
    order by finished desc, updated_at desc limit 1;

  if found and (
    v_best.updated_at >= p_updated_at
    or (v_best.finished and not v_finished)
    -- 혼합 출처의 min 시각만 비교하면 상세만 역행하는 요청이 통과할 수 있다.
    or coalesce((p_payload->>'detailsUpdatedAt')::numeric, 0) <
       coalesce((v_best.payload->>'detailsUpdatedAt')::numeric,
         case when jsonb_array_length(coalesce(v_best.payload->'timeline', '[]'::jsonb)) > 0
           or jsonb_array_length(coalesce(v_best.payload->'stats', '[]'::jsonb)) > 0
           then extract(epoch from v_best.updated_at) * 1000 else 0 end)
    or coalesce((p_payload->>'dayUpdatedAt')::numeric, 0) <
       coalesce((v_best.payload->>'dayUpdatedAt')::numeric, 0)
  ) then
    return jsonb_build_object('written', false, 'payload', v_best.payload);
  end if;

  -- 기존 복사본은 삭제하지 않는다. 앞으로 쓰기는 정렬 대표 ID에 모은다.
  insert into public.match_details_cache (game_id, lfa_match_id, payload, finished, updated_at)
  values (v_game_id, p_match_id, p_payload, v_finished, p_updated_at)
  on conflict (game_id) do update set
    lfa_match_id = excluded.lfa_match_id, payload = excluded.payload,
    finished = excluded.finished, updated_at = excluded.updated_at
  where match_details_cache.updated_at < excluded.updated_at
    and (not match_details_cache.finished or excluded.finished)
    and (match_details_cache.lfa_match_id is null or match_details_cache.lfa_match_id = p_match_id);
  get diagnostics v_count = row_count;

  select * into v_best from public.match_details_cache where game_id = v_game_id;
  if v_best.lfa_match_id is distinct from p_match_id then
    raise exception 'lfa snapshot identity conflict';
  end if;
  return jsonb_build_object('written', v_count > 0, 'payload', v_best.payload);
end;
$$;

-- 구버전 인스턴스의 직접 upsert도 같은 행의 최신/종료 데이터를 되돌리지 못한다.
create or replace function public.guard_lfa_snapshot_update()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.updated_at <= old.updated_at then return null; end if;
  if tg_table_name = 'match_details_cache' then
    if old.finished and not new.finished then return null; end if;
  elsif new.match_count = 0 and old.match_count > 0 then
    return null;
  end if;
  return new;
end;
$$;
create trigger guard_match_details_snapshot before update on public.match_details_cache
for each row execute function public.guard_lfa_snapshot_update();
create trigger guard_lfa_day_snapshot before update on public.lfa_day_cache
for each row execute function public.guard_lfa_snapshot_update();

revoke all on function public.write_lfa_day_snapshot(text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.write_lfa_match_snapshot(text[], text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.guard_lfa_snapshot_update() from public, anon, authenticated;
grant execute on function public.write_lfa_day_snapshot(text, jsonb, timestamptz) to service_role;
grant execute on function public.write_lfa_match_snapshot(text[], text, jsonb, timestamptz) to service_role;

commit;

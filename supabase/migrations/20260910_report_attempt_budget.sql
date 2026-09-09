-- Review/apply separately. This migration is deliberately not run by the implementation task.
alter table public.match_report_attempts
  add column input_version text,
  add column compose_index integer,
  add column compose_called boolean,
  add column verify_called boolean,
  add column verify_passed boolean,
  add column missing_names text[],
  add column reserved_until timestamptz,
  add column resolved_at timestamptz,
  add column draft jsonb;

create unique index report_compose_identity
  on public.match_report_attempts(game_id, input_version, compose_index);
grant select, insert, update on public.match_report_attempts to service_role;

-- One durable input snapshot per canonical Betman game. Keeping extraction here avoids
-- duplicating the article/lineup in every attempt and permits DB-only retries after 24h.
create table public.match_report_work (
  game_id text primary key,
  event_id text,
  context jsonb,
  input_version text,
  status text not null default 'ready'
    check (status in ('ready', 'dictionary', 'held', 'draft', 'stored')),
  reason text,
  missing_names text[],
  held_at timestamptz,
  -- First locally observed FT evidence; never moved forward on a retry/score correction.
  finished_at timestamptz,
  -- Explicit manual requests remain queued across a timeout/cron boundary, even after seven days.
  manual_resume boolean not null default false,
  updated_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz
);
alter table public.match_report_work enable row level security;
revoke all on public.match_report_work from public, anon, authenticated;
grant all on public.match_report_work to service_role;

create function public.claim_match_report(p_game_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.match_report_work; token uuid := gen_random_uuid();
begin
  insert into public.match_report_work(game_id) values(p_game_id) on conflict do nothing;
  select * into w from public.match_report_work where game_id=p_game_id for update skip locked;
  if not found then return null; end if;
  if w.lease_until > now() or exists (
    select 1 from public.match_report_attempts where game_id=p_game_id
      and compose_index is not null and resolved_at is null and reserved_until > now()
  ) then return null; end if;
  update public.match_report_work set lease_token=token, lease_until=now()+interval '5 minutes'
    where game_id=p_game_id;
  return jsonb_build_object('token', token, 'work', to_jsonb(w));
end $$;

create function public.reserve_report_compose(p_game_id text, p_token uuid, p_version text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.match_report_work; used integer; budget integer; attempt public.match_report_attempts;
begin
  select * into w from public.match_report_work where game_id=p_game_id for update skip locked;
  if not found then return jsonb_build_object('status','busy'); end if;
  if p_token is null or p_version is null or w.lease_token is distinct from p_token
    or w.lease_until is null or w.lease_until <= now()
    or w.input_version is distinct from p_version or w.status in ('dictionary','draft','stored')
    then return jsonb_build_object('status','busy'); end if;
  if exists (select 1 from public.match_report_attempts where game_id=p_game_id
    and compose_index is not null and resolved_at is null and reserved_until > now())
    then return jsonb_build_object('status','busy'); end if;
  -- All reservations consume budget, including expired/unknown outcomes and compose-only failures.
  select count(*) filter (where compose_index is not null),
    6 + 3 * count(*) filter (where stage='resume') into used, budget
    from public.match_report_attempts where game_id=p_game_id and input_version=p_version;
  if used >= budget then
    if w.status <> 'held' then
      insert into public.match_report_attempts(game_id,event_id,stage,reason,input_version)
      values(p_game_id,w.event_id,'held','작성 예산 소진',p_version);
    end if;
    update public.match_report_work set status='held', reason='작성 예산 소진', manual_resume=false,
      held_at=coalesce(held_at,now()), updated_at=now() where game_id=p_game_id;
    return jsonb_build_object('status','held');
  end if;
  insert into public.match_report_attempts(game_id,event_id,stage,input_version,compose_index,
    compose_called,verify_called,reserved_until)
  values(p_game_id,w.event_id,'reserve',p_version,used+1,false,false,now()+interval '5 minutes')
  returning * into attempt;
  update public.match_report_work set lease_until=attempt.reserved_until where game_id=p_game_id;
  return jsonb_build_object('status','reserved','attempt',to_jsonb(attempt));
end $$;

-- Fence late workers: an expired/replaced owner cannot publish a draft or change current state.
create function public.finish_report_compose(p_game_id text, p_token uuid, p_attempt_id bigint,
  p_stage text, p_reason text, p_verify_passed boolean, p_draft jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.match_report_work; a public.match_report_attempts; used integer; budget integer;
begin
  select * into w from public.match_report_work where game_id=p_game_id for update;
  if not found or p_token is null or w.lease_token is distinct from p_token
    or w.lease_until is null or w.lease_until <= now()
    then raise exception 'report lease expired'; end if;
  select * into a from public.match_report_attempts where id=p_attempt_id and game_id=p_game_id for update;
  if not found or a.resolved_at is not null or a.input_version is distinct from w.input_version
    then raise exception 'invalid report reservation'; end if;
  if p_draft is not null and (not coalesce(a.compose_called,false) or not coalesce(a.verify_called,false)
    or p_verify_passed is distinct from true or p_stage is distinct from 'draft')
    then raise exception 'unverified report draft'; end if;
  update public.match_report_attempts set stage=p_stage, reason=p_reason,
    verify_passed=p_verify_passed, draft=p_draft, resolved_at=now() where id=a.id;
  select count(*) filter (where compose_index is not null),
    6 + 3 * count(*) filter (where stage='resume') into used,budget
    from public.match_report_attempts where game_id=p_game_id and input_version=w.input_version;
  if p_draft is not null then
    update public.match_report_work set status='draft',reason=null,manual_resume=false,updated_at=now() where game_id=p_game_id;
  elsif used >= budget then
    insert into public.match_report_attempts(game_id,event_id,stage,reason,input_version)
      values(p_game_id,w.event_id,'held',coalesce(p_reason,'작성 예산 소진'),w.input_version);
    update public.match_report_work set status='held',reason=coalesce(p_reason,'작성 예산 소진'),manual_resume=false,
      held_at=coalesce(held_at,now()),updated_at=now() where game_id=p_game_id;
  end if;
end $$;

create function public.resume_match_report(p_game_id text, p_version text, p_reason text, p_actor text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.match_report_work;
begin
  if p_version is null or coalesce(length(trim(p_reason)),0) < 3 or length(p_reason)>500 or nullif(trim(p_actor),'') is null
    then raise exception 'resume reason and actor required'; end if;
  select * into w from public.match_report_work where game_id=p_game_id for update;
  if not found or w.input_version is distinct from p_version or w.status in ('draft','stored')
    or w.lease_until>now() then raise exception 'report changed or busy'; end if;
  if exists (select 1 from public.match_report_attempts where game_id=p_game_id
    and compose_index is not null and resolved_at is null and reserved_until>now())
    then raise exception 'report changed or busy'; end if;
  insert into public.match_report_attempts(game_id,event_id,stage,input_version,reason)
    values(p_game_id,w.event_id,'resume',w.input_version,p_actor || ': ' || trim(p_reason));
  -- Dictionary checks and verification still apply. Only a budget hold is cleared.
  update public.match_report_work set status=case when status='held' then 'ready' else status end,
    manual_resume=true, updated_at=now() where game_id=p_game_id;
end $$;

create view public.match_report_work_status with (security_invoker = true) as
select w.*, b.used, b.budget, u.unresolved
from public.match_report_work w
cross join lateral (
  select count(*) filter (where compose_index is not null)::integer as used,
    (6 + 3*count(*) filter (where stage='resume'))::integer as budget
  from public.match_report_attempts a where a.game_id=w.game_id and a.input_version=w.input_version
) b
cross join lateral (
  select count(*)::integer as unresolved from public.match_report_attempts a
  where a.game_id=w.game_id and a.compose_index is not null and a.resolved_at is null
    and a.reserved_until<=now()
) u;
revoke all on public.match_report_work_status from public, anon, authenticated;
grant select on public.match_report_work_status to service_role;

revoke all on function public.claim_match_report(text),
  public.reserve_report_compose(text,uuid,text),
  public.finish_report_compose(text,uuid,bigint,text,text,boolean,jsonb),
  public.resume_match_report(text,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_match_report(text),
  public.reserve_report_compose(text,uuid,text),
  public.finish_report_compose(text,uuid,bigint,text,text,boolean,jsonb),
  public.resume_match_report(text,text,text,text) to service_role;

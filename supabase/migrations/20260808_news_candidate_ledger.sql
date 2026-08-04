-- 뉴스룸 Phase 1 — 통합 후보 원장 + append-only 상태 전이
--
-- 기존 news_reservoir 생산 경로를 바꾸지 않는 shadow ledger다.
-- candidate는 최신 상태를 빠르게 조회하고, events는 누가/왜 상태를 바꿨는지 보존한다.
-- 애플리케이션은 ledger 기록 실패를 발행 실패로 취급하지 않되 운영 로그에 노출한다.

create table if not exists public.news_candidates (
  candidate_id     text primary key,
  reservoir_id     text unique,
  dedupe_key       text,
  canonical_url    text,
  source           jsonb not null default '{}'::jsonb,
  content_hash     text,
  state            text not null default 'discovered'
    check (state in (
      'discovered', 'deduplicated', 'assigned', 'evidence_ready', 'drafted',
      'fact_checking', 'revision_required', 'copy_ready', 'policy_ready',
      'visual_ready', 'publish_ready', 'published', 'held', 'duplicate',
      'expired', 'rejected', 'retry_wait', 'dead_letter', 'needs_human',
      'partially_published'
    )),
  last_reason_code text,
  priority         integer check (priority between 0 and 100),
  risk             text check (risk is null or risk in ('low', 'medium', 'high')),
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists news_candidates_state_updated_idx
  on public.news_candidates (state, updated_at desc);
create index if not exists news_candidates_content_hash_idx
  on public.news_candidates (content_hash)
  where content_hash is not null;
create index if not exists news_candidates_dedupe_key_idx
  on public.news_candidates (dedupe_key)
  where dedupe_key is not null;

create table if not exists public.news_candidate_events (
  id          bigint generated always as identity primary key,
  candidate_id text not null references public.news_candidates(candidate_id) on delete cascade,
  from_state  text,
  to_state    text not null,
  actor       text not null,
  reason_code text,
  details     jsonb not null default '{}'::jsonb,
  run_id      text,
  created_at  timestamptz not null default now(),
  check (from_state is null or from_state in (
    'discovered', 'deduplicated', 'assigned', 'evidence_ready', 'drafted',
    'fact_checking', 'revision_required', 'copy_ready', 'policy_ready',
    'visual_ready', 'publish_ready', 'published', 'held', 'duplicate',
    'expired', 'rejected', 'retry_wait', 'dead_letter', 'needs_human',
    'partially_published'
  )),
  check (to_state in (
    'discovered', 'deduplicated', 'assigned', 'evidence_ready', 'drafted',
    'fact_checking', 'revision_required', 'copy_ready', 'policy_ready',
    'visual_ready', 'publish_ready', 'published', 'held', 'duplicate',
    'expired', 'rejected', 'retry_wait', 'dead_letter', 'needs_human',
    'partially_published'
  ))
);

create index if not exists news_candidate_events_candidate_idx
  on public.news_candidate_events (candidate_id, created_at desc);
create index if not exists news_candidate_events_run_idx
  on public.news_candidate_events (run_id)
  where run_id is not null;
create unique index if not exists news_candidate_events_idempotency_idx
  on public.news_candidate_events (candidate_id, run_id, to_state, coalesce(reason_code, ''))
  where run_id is not null;

alter table public.news_candidates enable row level security;
alter table public.news_candidate_events enable row level security;

-- 기존 reservoir를 현재 상태 스냅샷으로 backfill한다. 과거에 실제로 일어나지 않은
-- 전이를 꾸며내지 않기 위해 events에는 넣지 않는다.
insert into public.news_candidates (
  candidate_id,
  reservoir_id,
  dedupe_key,
  canonical_url,
  source,
  state,
  last_reason_code,
  first_seen_at,
  updated_at
)
select
  id,
  id,
  dedupe_key,
  coalesce(urls->>'source', urls->>'origin'),
  source,
  case status
    when 'published' then 'published'
    when 'rejected' then 'rejected'
    when 'drafted' then 'drafted'
    else 'discovered'
  end,
  'reservoir_backfill',
  created_at,
  updated_at
from public.news_reservoir
on conflict (candidate_id) do nothing;

-- 한 요청의 여러 전이를 DB 한 왕복으로 기록한다. candidate가 아직 없으면
-- reservoir id를 candidate id로 사용한 최소 원장을 먼저 만든다.
create or replace function public.record_news_candidate_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e jsonb;
  v_candidate_id text;
  v_from_state text;
  v_inserted integer;
  v_recorded integer := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a JSON array';
  end if;

  for e in select value from jsonb_array_elements(p_events)
  loop
    v_candidate_id := nullif(e->>'candidate_id', '');
    if v_candidate_id is null then
      raise exception 'candidate_id is required';
    end if;

    insert into public.news_candidates (
      candidate_id,
      reservoir_id,
      dedupe_key,
      canonical_url,
      source,
      content_hash,
      state,
      last_reason_code
    ) values (
      v_candidate_id,
      nullif(e->>'reservoir_id', ''),
      nullif(e->>'dedupe_key', ''),
      nullif(e->>'canonical_url', ''),
      coalesce(e->'source', '{}'::jsonb),
      nullif(e->>'content_hash', ''),
      e->>'to_state',
      nullif(e->>'reason_code', '')
    )
    on conflict (candidate_id) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      v_from_state := null;
    else
      select state into v_from_state
      from public.news_candidates
      where candidate_id = v_candidate_id
      for update;

      update public.news_candidates
      set
        reservoir_id = coalesce(nullif(e->>'reservoir_id', ''), reservoir_id),
        dedupe_key = coalesce(nullif(e->>'dedupe_key', ''), dedupe_key),
        canonical_url = coalesce(nullif(e->>'canonical_url', ''), canonical_url),
        source = case when e ? 'source' then e->'source' else source end,
        content_hash = coalesce(nullif(e->>'content_hash', ''), content_hash),
        state = e->>'to_state',
        last_reason_code = nullif(e->>'reason_code', ''),
        updated_at = now()
      where candidate_id = v_candidate_id;
    end if;

    insert into public.news_candidate_events (
      candidate_id, from_state, to_state, actor, reason_code, details, run_id
    ) values (
      v_candidate_id,
      v_from_state,
      e->>'to_state',
      e->>'actor',
      nullif(e->>'reason_code', ''),
      coalesce(e->'details', '{}'::jsonb),
      nullif(e->>'run_id', '')
    )
    on conflict do nothing;

    get diagnostics v_inserted = row_count;
    v_recorded := v_recorded + v_inserted;
  end loop;

  return v_recorded;
end;
$$;

revoke all on function public.record_news_candidate_events(jsonb) from public, anon, authenticated;
grant execute on function public.record_news_candidate_events(jsonb) to service_role;

comment on table public.news_candidates is
  '뉴스룸 통합 후보 최신 상태. 실제 발행 제어는 shadow 검증 완료 전까지 news_reservoir가 담당한다.';
comment on table public.news_candidate_events is
  '뉴스 후보의 append-only 상태 전이 감사 원장.';

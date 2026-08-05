-- 뉴스룸 Phase 2 — 어사인먼트 데스크 shadow 원장
--
-- shadow 전용이다. 이 테이블은 발행을 제어하지 않고, news_reservoir·news_candidates 를
-- 읽지도 바꾸지도 않는다. 목적은 하나뿐: "구조 전환 전에 새 배정 판정이 기존 관심도
-- 필터·실제 발행 결과와 얼마나 다른가"를 실데이터로 증명하는 것.
--
-- 설계 원칙 (Phase 1 실측에서 나온 것들)
--  1. 판정과 실패를 절대 같은 값으로 합치지 않는다. outcome 이 판정(assign/hold/
--     duplicate/reject)이거나 실패(llm_error/invalid_output)이고, status 가 그 실패의
--     재시도 가능성(ok/retry_wait/dead_letter)을 따로 말한다. 2026-08-04 사고("사유를
--     기록하지 않는 필터가 큐의 46%를 먹음")의 재발 방지선이다.
--  2. 같은 (후보, 내용, 프롬프트 버전)은 두 번 호출하지 않는다 — 부분 유니크 인덱스로
--     DB 가 강제한다. 애플리케이션 판단에만 맡기면 재배포·중복 cron 에서 새어 나간다.
--  3. 호출마다 model/latency/token/cost 를 남긴다. 월 예산 준수를 증명할 유일한 근거다
--     (현재 코드베이스에는 LLM 비용 원장이 아예 없다).
--  4. append-only. update 하지 않는다 — 재시도는 새 행이고 attempt 로 센다.

create table if not exists public.news_assignments (
  id               bigint generated always as identity primary key,
  candidate_id     text not null references public.news_candidates(candidate_id) on delete cascade,
  run_id           text not null,
  -- 배정 입력(제목+본문+출처)의 해시. 초안이 수정되면 값이 바뀌어 재평가가 열린다.
  content_hash     text not null,
  prompt_version   text not null,
  attempt          integer not null default 1 check (attempt >= 1),

  -- 판정(assign/hold/duplicate/reject)과 실패(llm_error/invalid_output)를 한 축에 두되
  -- 값 자체로 구분된다. "배정할 가치 없음"과 "호출이 죽었음"은 다른 사건이다.
  outcome text not null check (outcome in (
    'assign', 'hold', 'duplicate', 'reject', 'llm_error', 'invalid_output'
  )),
  -- 실패의 성격: 재시도로 회복 가능한가(retry_wait), 영구인가(dead_letter).
  status text not null default 'ok' check (status in ('ok', 'retry_wait', 'dead_letter')),

  desk text check (desk is null or desk in (
    'transfer', 'match', 'official', 'injury', 'general', 'saga'
  )),
  priority         integer check (priority is null or priority between 0 and 100),
  risk             text check (risk is null or risk in ('low', 'medium', 'high')),
  format text check (format is null or format in (
    'breaking_brief', 'standard', 'saga_update', 'hold'
  )),
  required_checks  text[] not null default '{}',
  deadline_minutes integer check (deadline_minutes is null or deadline_minutes >= 0),
  reason_codes     text[] not null default '{}',

  -- 호출 계측. model 은 LLM 이름 또는 결정론 규칙 판정을 뜻하는 'rule:*'.
  model              text not null,
  latency_ms         integer check (latency_ms is null or latency_ms >= 0),
  input_tokens       integer check (input_tokens is null or input_tokens >= 0),
  output_tokens      integer check (output_tokens is null or output_tokens >= 0),
  cached_tokens      integer check (cached_tokens is null or cached_tokens >= 0),
  -- 요율표가 없는 모델은 0 이 아니라 null 이다 — 모르는 값을 0 으로 적으면 예산이 거짓말한다.
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),

  error      text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- 성공 행은 배정 계약을 전부 채워야 한다. 반쪽 판정이 shadow 통계에 섞이는 걸 막는다.
  constraint news_assignments_ok_requires_verdict check (
    status <> 'ok'
    or (
      desk is not null
      and priority is not null
      and risk is not null
      and format is not null
      and deadline_minutes is not null
      and outcome in ('assign', 'hold', 'duplicate', 'reject')
    )
  ),
  -- 실패 행은 사유가 있어야 한다 (침묵 실패 금지).
  constraint news_assignments_failure_requires_error check (
    status = 'ok' or error is not null
  )
);

-- 재호출 금지의 DB 강제 — 종착 행(성공·영구실패)은 (후보, 내용, 프롬프트 버전)당 하나.
-- retry_wait 는 이력이므로 여러 개 쌓인다.
create unique index if not exists news_assignments_settled_idx
  on public.news_assignments (candidate_id, content_hash, prompt_version)
  where status = 'ok';
create unique index if not exists news_assignments_dead_letter_idx
  on public.news_assignments (candidate_id, content_hash, prompt_version)
  where status = 'dead_letter';

create index if not exists news_assignments_created_idx
  on public.news_assignments (created_at desc);
create index if not exists news_assignments_candidate_idx
  on public.news_assignments (candidate_id, created_at desc);
-- 재시도 백로그 조회 — 정상 행이 압도적이라 부분 인덱스로 좁힌다.
create index if not exists news_assignments_pending_idx
  on public.news_assignments (status, created_at desc)
  where status <> 'ok';
-- 프롬프트 버전 간 비교(A/B) 용
create index if not exists news_assignments_prompt_version_idx
  on public.news_assignments (prompt_version, created_at desc);

-- 정책 0개 + RLS on = service role 전용. Phase 1 원장과 같은 잠금 방식이다.
alter table public.news_assignments enable row level security;

comment on table public.news_assignments is
  '뉴스룸 어사인먼트 데스크 shadow 판정 원장 (append-only). 발행을 제어하지 않는다 — feature flag NEWS_ASSIGNMENT_DESK=shadow 로만 채워지고 비교·검증에만 쓴다.';
comment on column public.news_assignments.outcome is
  '판정(assign/hold/duplicate/reject) 또는 실패(llm_error/invalid_output). 둘을 같은 값으로 합치지 않는다.';
comment on column public.news_assignments.status is
  'ok=판정 확정, retry_wait=회복 가능 실패, dead_letter=영구 실패(재시도 중단).';
comment on column public.news_assignments.estimated_cost_usd is
  '추정 비용(USD). 요율표에 없는 모델은 null — 0 으로 적지 않는다.';

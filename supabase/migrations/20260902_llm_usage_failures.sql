-- LLM 실패를 계기판에 올린다 (2026-09-02)
--
-- ## 왜
-- `llm_usage_log.ok` 는 2026-08-25 부터 있었지만 **쓰기만 하고 아무도 안 읽었다.**
-- 두 뷰(api_cost_summary · api_daily_usage) 어디에도 없었고, 기록 함수는 `ok` 를
-- 기본값 true 로만 넣었다(호출부 17곳 중 false 를 넘기는 곳 0). 결과가 이랬다:
--
--   "오늘 뉴스가 한 건도 안 올라왔다" → 로그를 봐도 호출 수가 정상 → 원인 못 찾음
--
-- 이 파이프라인 상당수가 fail-closed 라서 400 하나가 "에러 없이 발행 정지"가 된다.
-- 계기판이 실패를 안 보여주면 그 정지가 **정상 조용함과 구분이 안 된다.**
--
-- ## fail_reason 을 같이 넣는 이유
-- "40건 실패"만으로는 다시 코드를 뒤져야 한다. "40건 × http_400" 이면 파라미터 세대
-- 불일치를 바로 가리킨다 — 이 저장소가 chatParams 규약을 두고 있는 바로 그 고장이다.
--
-- ## ⚠️ 라이브 정의를 받아 적었다, 파일이 아니라
-- `20260825d` 는 "api_cost_summary() 에 daily 배열 추가"라고 적어놓고 **본문에 함수
-- 재정의를 넣지 않았다.** 그래서 마이그레이션 파일만 재생하면 라이브에 있는 `daily`
-- CTE 가 사라진다. 아래 본문은 `pg_get_functiondef` 로 뽑은 실제 정의에 이번 변경을
-- 얹은 것이다. 다음 사람도 함수를 고치기 전에 라이브를 먼저 뜰 것.

alter table llm_usage_log add column if not exists fail_reason text;

comment on column llm_usage_log.fail_reason is
  '실패 사유. ok=false 일 때만 채운다. http_<코드> / timeout / network / parse 형태의 짧은 키.';

-- 실패만 훑는 조회가 잦아질 자리 — 성공 행이 대부분이라 부분 인덱스가 맞다
create index if not exists idx_llm_usage_failed
  on llm_usage_log (called_at desc) where not ok;

-- ── 일별 뷰: 실패 건수를 열로 추가 ──────────────────────────────────────────
-- ⚠️ `llm_calls` 의 뜻은 그대로 둔다(성공+실패 = 부른 횟수). 기존 열의 의미를 바꾸면
--    이 뷰를 읽는 쪽이 조용히 다른 걸 세게 된다. 새 열을 **맨 뒤에** 붙인다 —
--    create or replace view 는 기존 열의 이름·타입·순서가 그대로여야 통과한다.
create or replace view api_daily_usage as
with lfa as (
  select (called_at at time zone 'Asia/Seoul')::date as d,
         count(*) as calls,
         max(credits_remaining) - min(credits_remaining) as credits,
         min(credits_remaining) as credits_end
  from lfa_usage_log group by 1
),
llm as (
  select (called_at at time zone 'Asia/Seoul')::date as d,
         count(*) as calls,
         count(*) filter (where not ok) as fail_calls,
         sum(estimated_cost_usd) as usd,
         sum(input_tokens) as in_tok,
         sum(output_tokens) as out_tok
  from llm_usage_log group by 1
)
select
  coalesce(lfa.d, llm.d) as day_kst,
  coalesce(lfa.calls, 0) as lfa_calls,
  coalesce(lfa.credits, 0) as lfa_credits,
  lfa.credits_end as lfa_credits_left,
  coalesce(llm.calls, 0) as llm_calls,
  round(coalesce(llm.usd, 0), 4) as llm_usd,
  coalesce(llm.in_tok, 0) as llm_input_tokens,
  coalesce(llm.out_tok, 0) as llm_output_tokens,
  coalesce(llm.fail_calls, 0) as llm_fail_calls
from lfa full outer join llm on lfa.d = llm.d
order by day_kst desc;

revoke all on api_daily_usage from anon, authenticated;

-- ── 요약 RPC: 오늘/주간 실패 수 + 사유 분포 + 작업별 실패 ──────────────────
create or replace function api_cost_summary()
returns jsonb language sql stable security definer set search_path = public as $$
with
kst_today as (select (now() at time zone 'Asia/Seoul')::date as d),
lfa_today as (
  select count(*) as calls,
         coalesce(max(credits_remaining) - min(credits_remaining), 0) as burned
  from lfa_usage_log
  where (called_at at time zone 'Asia/Seoul')::date = (select d from kst_today)
),
lfa_now as (
  select credits_remaining from lfa_usage_log
  where credits_remaining is not null order by called_at desc limit 1
),
lfa_rate as (
  select case
    when count(*) < 2 then null
    when max(credits_remaining) - min(credits_remaining) <= 0 then null
    else (max(credits_remaining) - min(credits_remaining))::numeric
         / greatest(extract(epoch from (max(called_at) - min(called_at))) / 86400.0, 0.25)
  end as per_day
  from lfa_usage_log
  where called_at > now() - interval '7 days' and credits_remaining is not null
),
llm_today as (
  select count(*) as calls,
         count(*) filter (where not ok) as fails,
         coalesce(sum(estimated_cost_usd), 0) as cost
  from llm_usage_log
  where (called_at at time zone 'Asia/Seoul')::date = (select d from kst_today)
),
llm_week as (
  select coalesce(sum(estimated_cost_usd), 0) as cost,
         count(*) as calls,
         count(*) filter (where not ok) as fails
  from llm_usage_log where called_at > now() - interval '7 days'
),
llm_tasks as (
  select task, model, count(*) as calls,
         count(*) filter (where not ok) as fails,
         coalesce(sum(input_tokens), 0) as in_tok,
         coalesce(sum(output_tokens), 0) as out_tok,
         coalesce(sum(estimated_cost_usd), 0) as cost
  from llm_usage_log where called_at > now() - interval '7 days'
  group by task, model
  -- ⚠️ 종전엔 `order by 6 desc`(=비용) 였다. 열을 추가하면 서수가 밀리므로 이름으로 쓴다.
  order by cost desc limit 30
),
-- 실패 사유 분포 — "몇 건 실패"만으로는 코드를 다시 뒤져야 한다
llm_fails as (
  select coalesce(fail_reason, '(사유 없음)') as reason, task, count(*) as calls
  from llm_usage_log
  where called_at > now() - interval '7 days' and not ok
  group by 1, 2 order by calls desc limit 12
),
-- 일별 추이 (최근 7일, KST). 축구는 크레딧, OpenAI 는 달러 — 단위가 다르니 열을 나눈다.
daily as (
  select to_char(day_kst, 'MM-DD') as day,
         lfa_credits, lfa_calls, llm_usd, llm_calls, llm_fail_calls
  from api_daily_usage
  where day_kst > (now() at time zone 'Asia/Seoul')::date - 7
  order by day_kst desc
)
select jsonb_build_object(
  'lfa', jsonb_build_object(
    'callsToday', (select calls from lfa_today),
    'burnedToday', (select burned from lfa_today),
    'creditsNow', (select credits_remaining from lfa_now),
    'daysLeft', case
      when (select per_day from lfa_rate) is null or (select credits_remaining from lfa_now) is null
      then null
      else round((select credits_remaining from lfa_now) / (select per_day from lfa_rate), 1)
    end
  ),
  'llm', jsonb_build_object(
    'callsToday', (select calls from llm_today),
    'failsToday', (select fails from llm_today),
    'costToday', (select cost from llm_today),
    'costWeek', (select cost from llm_week),
    'failsWeek', (select fails from llm_week),
    'hasData', (select calls from llm_week) > 0,
    'byTask', coalesce((select jsonb_agg(jsonb_build_object(
        'task', task, 'model', model, 'calls', calls, 'fails', fails,
        'inputTokens', in_tok, 'outputTokens', out_tok, 'costUsd', cost
      )) from llm_tasks), '[]'::jsonb),
    'failReasons', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', reason, 'task', task, 'calls', calls
      )) from llm_fails), '[]'::jsonb)
  ),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day, 'lfaCredits', lfa_credits, 'lfaCallsToday', lfa_calls,
      'llmUsd', llm_usd, 'llmCalls', llm_calls, 'llmFails', llm_fail_calls
    )) from daily), '[]'::jsonb)
)
$$;

-- ⚠️ create or replace function 은 붙여둔 REVOKE 를 날린다 — 반드시 재첨부
revoke all on function api_cost_summary() from public, anon, authenticated;

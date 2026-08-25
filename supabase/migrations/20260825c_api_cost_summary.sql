-- 외부 API 비용 요약 RPC (어드민 /admin/system 카드)
-- ⚠️ 축구는 선불 크레딧(잔량=수명), OpenAI 는 후불 요금(달러). 단위가 달라 따로 센다.
-- ⚠️ 남은 일수는 최근 7일 **실측 소모율** 기준이다. 고정 임계값은 소모율을 모르면
--    "그 숫자가 한 달 치인지 이틀 치인지" 답을 못 한다 (2026-08-23 소진 사고 교훈).
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
  select count(*) as calls, coalesce(sum(estimated_cost_usd), 0) as cost
  from llm_usage_log
  where (called_at at time zone 'Asia/Seoul')::date = (select d from kst_today)
),
llm_week as (
  select coalesce(sum(estimated_cost_usd), 0) as cost, count(*) as calls
  from llm_usage_log where called_at > now() - interval '7 days'
),
llm_tasks as (
  select task, model, count(*) as calls,
         coalesce(sum(input_tokens), 0) as in_tok,
         coalesce(sum(output_tokens), 0) as out_tok,
         coalesce(sum(estimated_cost_usd), 0) as cost
  from llm_usage_log where called_at > now() - interval '7 days'
  group by task, model order by 6 desc limit 30
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
    'costToday', (select cost from llm_today),
    'costWeek', (select cost from llm_week),
    'hasData', (select calls from llm_week) > 0,
    'byTask', coalesce((select jsonb_agg(jsonb_build_object(
        'task', task, 'model', model, 'calls', calls,
        'inputTokens', in_tok, 'outputTokens', out_tok, 'costUsd', cost
      )) from llm_tasks), '[]'::jsonb)
  )
)
$$;

revoke all on function api_cost_summary() from public, anon, authenticated;

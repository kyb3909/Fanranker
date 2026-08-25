-- 일일 API 사용량 뷰 + 요약 RPC 확장 (2026-08-25)
-- 운영자: "하루에 얼마씩 사용하는지 로그를 계속 부탁해"
--
-- ⚠️ 축구는 선불 크레딧이라 **잔량 차이**로 소모를 잰다 (호출 수 != 크레딧:
--    프리뷰는 호출당 3크레딧). OpenAI 는 후불이라 추정 금액을 더한다.
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
  coalesce(llm.out_tok, 0) as llm_output_tokens
from lfa full outer join llm on lfa.d = llm.d
order by day_kst desc;

revoke all on api_daily_usage from anon, authenticated;

-- api_cost_summary() 에 daily 배열 추가 (본문은 20260825c 참조 — 여기서는 daily CTE 만 추가)

-- LFA 크레딧 사용량 계기판 (2026-08-24 비용 감사)
--
-- ## 왜 필요한가
-- 8/23 크레딧 30,100 소진 사고의 **진짜 원인은 소모량이 아니라 계기판 부재**였다.
-- 라인업·라이브 스코어·불판이 한꺼번에 죽고 나서야 알았다. 응답마다 `credits_remaining`
-- 이 실려 오는데, 코드는 그걸 임계값 밑일 때만 console.warn 으로 흘리고 버렸다.
--
-- 그 값을 여기 적는다. 이 표가 있어야 다음 질문들이 SQL 한 줄이 된다:
--   · 어제 하루 몇 크레딧 썼나
--   · 경기 없는 시간대 소모가 정말 줄었나 (2026-08-24 재구매 주기 수리 검증)
--   · 어느 엔드포인트가 태우나 (matches / live_match_details / lineups / preview 3종)
--   · **이 속도면 며칠 남았나** ← 고정 임계값("잔여 20,000")이 못 답하던 것
--
-- ⚠️ 적재는 fail-open 이다 (lib/lfa/client.ts). 계기판이 본 작업을 깨면 안 된다.
--
-- 규모: 호출 1회당 1행 = 하루 1,000~3,000행, 연 100만 행 수준. 인덱스 하나면 충분하다.
create table if not exists public.lfa_usage_log (
  id                bigserial   primary key,
  called_at         timestamptz not null default now(),
  -- 호출 엔드포인트 (matches / live_match_details / lineups / h2h / injuries / officials / team_squad)
  endpoint          text        not null,
  -- 그 호출 직후의 잔여 크레딧. 연속 두 행의 차이가 그 사이 소모량이다.
  credits_remaining integer
);

-- 소모율·추세 조회는 전부 시간 역순 구간 스캔이다
create index if not exists lfa_usage_log_called_at_idx on public.lfa_usage_log (called_at desc);

alter table public.lfa_usage_log enable row level security;
revoke all on public.lfa_usage_log from anon, authenticated;

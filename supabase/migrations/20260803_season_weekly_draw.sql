-- 주간 경품 추첨 — 후보 확정(자동) + 추첨 실행(수동) 2단계.
--
-- 배경: 스팀 기프트카드 5만원권을 매주 월요일 5명에게 준다(2026-08-02 확정).
-- 운영자가 **추첨하는 장면을 보여주고 싶다**는 요구가 있어(영상 소재), cron 자동 추첨
-- 대신 2단계로 나눈다.
--
--   1단계 (자동, 월 00:00 KST): 그 주 자격 충족자 명단을 **스냅샷으로 고정**.
--          candidates_hash 를 함께 남겨 "추첨 직전에 명단을 손댔다"는 의심을 차단한다.
--   2단계 (수동, 어드민): 운영자가 버튼을 누르면 **서버가** 뽑아 winners 에 기록.
--          화면 애니메이션은 이미 정해진 결과로 달려가는 연출일 뿐이다
--          (클라이언트 난수로 뽑으면 조작 가능·검증 불가 — 그래서 서버가 뽑는다).
--          결과가 고정이라 녹화에 실패해도 몇 번이든 다시 재생할 수 있다.
--
-- 기존 season_chicken_draws(데일리)는 상품 구성 변경으로 더 이상 쓰지 않지만,
-- 지난 기록 보존을 위해 테이블은 남긴다.

create table if not exists public.season_weekly_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  /** 그 주 월요일 (KST 기준 날짜) — 회차 식별자 */
  week_start date not null,

  /* ── 1단계: 후보 확정 ── */
  /** [{ user_id, nickname, total_points, community_actions }] 확정 시점 스냅샷 */
  candidates jsonb not null default '[]'::jsonb,
  candidate_count integer not null default 0,
  /** 명단(user_id 정렬 후 join) 의 sha256 — 공정성 증빙 */
  candidates_hash text,
  snapshot_at timestamptz,

  /* ── 2단계: 추첨 실행 ── */
  /** [{ user_id, nickname }] — 추첨 전에는 NULL */
  winners jsonb,
  winner_count integer not null default 5,
  drawn_at timestamptz,
  /** 추첨을 실행한 관리자 (Clerk user id) */
  drawn_by text,
  announced_post_id uuid,

  created_at timestamptz not null default now(),
  unique (event_id, week_start)
);

alter table public.season_weekly_draws enable row level security;

-- 읽기: 공개 (당첨 발표는 공개 정보). 쓰기: service role 전용 (정책 없음).
drop policy if exists "season_weekly_draws_public_read" on public.season_weekly_draws;
create policy "season_weekly_draws_public_read" on public.season_weekly_draws
  for select using (true);

comment on table public.season_weekly_draws is
  '주간 경품 추첨 — 후보는 cron 이 확정(candidates/candidates_hash), 추첨은 어드민이 실행(winners).';

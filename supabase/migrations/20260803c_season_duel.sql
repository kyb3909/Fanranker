-- 크리에이터 주간 맞대결 — 주장 계정 + 회차 결과 저장.
--
-- 구조(2026-08-03 운영자 확정): 크리에이터도 팬덤의 참가자 1명일 뿐이고, 별도로 두 사람이
-- **주 단위 1:1** 로 붙는다. 이긴 쪽 팬덤에서 추첨 1명이 그 팀 유니폼을 받는다(4주 × 1장).
--
-- 주장을 코드 상수가 아니라 DB 에 두는 이유: 계정이 바뀌거나 크리에이터가 교체돼도
-- 배포 없이 값만 갈면 된다. 이벤트 운영 중 배포는 리스크다.

alter table public.event_groups
  add column if not exists captain_user_id text;

comment on column public.event_groups.captain_user_id is
  '이 팬덤을 대표해 주간 맞대결에 나서는 계정(Clerk user id). NULL 이면 맞대결 미참가.';

-- 회차 결과는 주간 추첨 행에 함께 둔다 — 같은 월요일에 함께 발표되므로 한 행이 한 회차다
alter table public.season_weekly_draws
  add column if not exists duel_winner_group_id uuid,
  add column if not exists duel_scores jsonb,
  add column if not exists uniform_winner jsonb;

comment on column public.season_weekly_draws.duel_scores is
  '[{group_slug, captain_user_id, nickname, skill_score, settled_slips}] — 그 주 범위 성적. 무승부·미참가 판별용으로 원자료를 남긴다.';
comment on column public.season_weekly_draws.uniform_winner is
  '{user_id, nickname} — 승리 팬덤의 응모 자격 충족자 중 추첨 1명. 승부가 안 갈리면 NULL.';

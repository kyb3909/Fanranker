-- 경기 리포트 실패 원장 (2026-09-02)
--
-- ## 왜
-- 리포트 파이프라인(lib/soccerway/match-extras.ts cachedReport)은 6단계 fail-closed 다 —
-- 원문 찾기 → 문단 추출 → 사건 추출 → 확정 스코어 → 작성·숫자 대조 → 독립 검증.
-- 어느 단계든 실패하면 null 을 돌려주고 끝이다. 남는 건 Vercel 로그의 console.warn 한 줄.
--
-- 7일 실측(2026-09-02): 리포트 대상 경기 23개 중 리포트 10개. 빠진 13개 중 5개는 동시
-- 킥오프 매칭 충돌(같은 날 수리), 나머지 8개(레알·바이에른·밀란·유벤투스·도르트문트·PSG·
-- 아틀레티코·나폴리)는 **어느 게이트에서 막혔는지 어디에도 안 남았다.**
--
-- fail-closed 는 옳다("틀린 리포트는 없는 리포트보다 나쁘다" — 8/25 오사수나 0-0 에 "3-0
-- 멀티골" 리포트 실사고). 문제는 눈이 없는 것이다. 게이트마다 여기 한 줄 남긴다.
-- 검증 강도는 건드리지 않는다.
--
-- ## 읽는 쪽
-- 관제실 전황판 "경기 리포트" 카드 — 최근 48h 킥오프 중 저장 리포트 없이 실패 원장만 있는
-- 경기 수 + 사유별 분포 (app/admin/_dashboard/data.ts, lib/soccerway/report-gaps.ts).
-- 일주일 쌓이면 검증기·기사 선택기를 **데이터 보고** 손본다 — 추측으로 풀지 않는다.

create table if not exists match_report_attempts (
  id bigint generated always as identity primary key,
  game_id text not null,
  event_id text,
  -- 어느 게이트에서 멈췄나 — 짧은 키. lib/soccerway/report-gaps.ts 의 REPORT_STAGES 가 정본
  stage text not null,
  -- 사람이 읽는 한 줄 (검증기 지적사항 앞 몇 개 등). 본문·프롬프트는 넣지 않는다
  reason text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_report_attempts_at on match_report_attempts (attempted_at desc);
create index if not exists idx_report_attempts_game on match_report_attempts (game_id, attempted_at desc);

comment on table match_report_attempts is
  '경기 리포트 생성 실패 원장 — 게이트별 사유. 성공은 match_reports 에 남으므로 여기엔 실패만. 2026-09-02';

alter table match_report_attempts enable row level security;
revoke all on match_report_attempts from anon, authenticated;

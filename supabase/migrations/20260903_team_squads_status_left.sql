-- team_squads.status 에 'left' 허용 (2026-09-03)
--
-- squad-sync(app/api/cron/squad-sync/route.ts) 는 LFA 피드에서 사라진 선수를
-- status='left' 로 표시하도록 짜여 있는데, CHECK 제약이 proposed/confirmed/rejected
-- 만 허용해 그 UPDATE 가 매일 조용히 실패했다 (실측: left 행 0, 에러는 무시됨).
-- 'rejected' 를 쓰지 않는 이유는 라우트 주석 참조 — 읽기 경로 5곳이 .neq('rejected')
-- 라 과거 경기 이름이 즉시 사라진다. 'left' 는 그 필터를 통과해 과거 기록은 살아 있고,
-- 검수 지면(/api/admin/team-squads)만 .neq('left') 로 제외한다.
--
-- 되돌리기: left 행을 proposed 로 되돌린 뒤 제약을 세 값으로 재정의.
alter table public.team_squads drop constraint if exists team_squads_status_check;
alter table public.team_squads add constraint team_squads_status_check
  check (status = any (array['proposed'::text, 'confirmed'::text, 'rejected'::text, 'left'::text]));

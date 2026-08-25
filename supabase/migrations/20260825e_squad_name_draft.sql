-- 선수 한글명 **후보** 칸 (2026-08-25)
--
-- 운영자 요청: "전체 후보를 올려놓은 다음에 내가 검수를 할 수 있는 페이지".
--
-- ⚠️ 후보를 `name_kr` 에 바로 넣으면 안 된다. 화면(`cachedSquad` 등)은 status 를 보지 않고
--    `name_kr` 을 그대로 쓰므로(rejected 만 제외), 검수 전 추정치가 **즉시 라이브로 나간다.**
--    그래서 칸을 나눈다:
--      name_kr_draft — 기계가 만든 후보. 화면에 절대 안 나온다. 검수 화면에서만 보인다
--      name_kr       — 확정된 표기. 화면이 읽는 유일한 값
--    검수에서 승인하면 draft → name_kr 로 옮기고 status='confirmed'.
alter table team_squads add column if not exists name_kr_draft text;

comment on column team_squads.name_kr_draft is
  '기계 생성 한글명 후보. 화면에 노출하지 않는다 — 검수 승인 시 name_kr 로 옮긴다';

-- 검수 화면이 "후보는 있는데 확정 안 된 것" 을 팀 단위로 빠르게 세도록
create index if not exists team_squads_draft_pending_idx
  on team_squads (soccerway_team_id)
  where name_kr is null and name_kr_draft is not null;

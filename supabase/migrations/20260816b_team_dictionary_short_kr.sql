-- 팀 통칭(줄임말) — 지면·본문에서 부르는 이름 (2026-08-16 운영자 지시)
-- 예: FC서울→서울, 인테르나치오날레→인테르, 레알 마드리드→레알, 아틀레티코 마드리드→아틀레티코
-- 기입은 /admin/team-dictionary CSV (short_kr 열). 적용됨 (MCP).
alter table team_dictionary add column if not exists short_kr text;

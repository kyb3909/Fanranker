-- team_dictionary 에 live-football-api 팀 해시를 붙인다 (2026-08-17).
--
-- 왜: 지금은 LFA 영문명 → 사전 name_en 을 문자열로 대조해 한글명을 찾는데, LFA 가
-- 축약형을 쓴다 ("Man. City" vs "Manchester City", "Not. Forest" vs "Nottingham",
-- "Bayern Münih" 처럼 터키어 표기까지 섞임). 실측 470팀 중 27팀이 **이미 사전에 있는데
-- 표기만 달라** 영문으로 렌더됐다.
--
-- ID 로 걸면 표기 변형이 아무리 늘어도 매칭이 깨지지 않는다. 이름 대조는 폴백으로만 남긴다.
alter table team_dictionary
  add column if not exists lfa_team_id text;

comment on column team_dictionary.lfa_team_id is
  'live-football-api 팀 해시. 이름 대조 없이 LFA 응답 → 한글 표기를 직결한다.';

-- 한 LFA 팀이 두 사전 행에 붙으면 조회가 갈린다 — 유니크로 막는다 (NULL 은 다수 허용)
create unique index if not exists team_dictionary_lfa_team_id_key
  on team_dictionary (lfa_team_id)
  where lfa_team_id is not null;

-- 와이즈토토 스코어 보존 (2026-08-30c, 운영자 확정)
--
-- "와이즈토토 것과 베트맨 것이 결과가 같은지 검증을 하는 게 중요하다."
--
-- 문제: 와이즈토토(매분, 비공식·빠름)와 베트맨 크롤(2h, 공식·늦음)이 **같은 컬럼**
-- (home_score/away_score)을 시간차로 덮어써서, 베트맨 공식이 도착하는 순간
-- 와이즈토토가 뭘 줬었는지 증발한다 — 비교할 재료가 저장이 안 됐다.
--
-- 해결: 와이즈토토 값을 별도 컬럼에 보존. 베트맨 확정 후 3자 대조가 가능해진다:
--   베트맨(공식·지급 기준) ↔ 와이즈토토(보존값) ↔ LFA(산 피드)
--
-- wisetoto_at: 캡처 시각. 와이즈토토는 경기 **중간** 스코어도 쓰므로(전반 1-0 등),
-- 킥오프+105분 이전 캡처는 "최종값 아님"으로 보고 비교에서 제외한다 — 안 그러면
-- 미완 스코어와 베트맨 최종이 가짜 불일치를 낸다.

alter table betman_games add column if not exists wisetoto_home_score integer;
alter table betman_games add column if not exists wisetoto_away_score integer;
alter table betman_games add column if not exists wisetoto_at timestamptz;

-- 원장에도 와이즈토토 값을 남긴다 — mismatch 때 세 값을 나란히 보게
alter table betman_result_checks add column if not exists wisetoto_score text;

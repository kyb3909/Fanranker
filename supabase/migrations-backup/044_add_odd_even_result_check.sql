-- betman_games result CHECK 제약에 'odd', 'even' 추가 (SUM 게임 타입 지원)
-- 기존 제약: result IN ('home', 'draw', 'away', 'over', 'under', 'cancelled')
-- 변경: result IN ('home', 'draw', 'away', 'over', 'under', 'odd', 'even', 'cancelled')

ALTER TABLE betman_games DROP CONSTRAINT IF EXISTS betman_games_result_check;

ALTER TABLE betman_games ADD CONSTRAINT betman_games_result_check
  CHECK (result IN ('home', 'draw', 'away', 'over', 'under', 'odd', 'even', 'cancelled'));

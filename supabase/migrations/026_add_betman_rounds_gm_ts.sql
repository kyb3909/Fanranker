-- Betman 회차 식별용 (n8n에서 추출한 gmTs 저장)
ALTER TABLE betman_rounds
ADD COLUMN IF NOT EXISTS gm_ts text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_betman_rounds_gm_ts
ON betman_rounds (gm_ts) WHERE gm_ts IS NOT NULL;

-- betman_games: 회차+게임번호 유니크 (POST /api/betman/games upsert용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_betman_games_round_game_no
ON betman_games (round_id, game_no);

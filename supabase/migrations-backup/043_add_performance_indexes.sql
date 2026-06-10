-- 043: 성능 인덱스 추가

-- 피드 예측 조회 최적화
CREATE INDEX IF NOT EXISTS idx_betman_predictions_round_user
  ON betman_predictions(round_id, user_id);

-- 일간 라운드별 예측 조회 최적화
CREATE INDEX IF NOT EXISTS idx_betman_predictions_daily_round_user
  ON betman_predictions(daily_round_id, user_id);

-- 랭킹 정렬 최적화 (profit_rate 기본 정렬)
CREATE INDEX IF NOT EXISTS idx_buss_sport_profit
  ON betman_user_sport_stats(sport, profit_rate DESC)
  WHERE total_wagered > 0;

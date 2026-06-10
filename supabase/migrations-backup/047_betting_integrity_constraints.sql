-- 047: 베팅 무결성 제약조건
-- 1. 같은 유저가 같은 경기에 중복 베팅 방지 (race condition 방어)
-- 2. 배당률/스테이크 양수 제약조건

-- ============================================================
-- 1. 기존 중복 데이터 정리 (가장 오래된 것만 유지, 나머지 cancelled 처리)
-- ============================================================
UPDATE betman_predictions
SET status = 'cancelled', is_correct = NULL, settled_at = now()
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY user_id, game_id ORDER BY created_at ASC) AS rn
    FROM betman_predictions
    WHERE status IN ('pending', 'settled')
  ) sub
  WHERE rn > 1
);

-- ============================================================
-- 2. 유저+경기 유니크 인덱스 (동시 요청 방어)
--    cancelled 상태는 제외하여 취소 후 재베팅 허용
-- ============================================================
CREATE UNIQUE INDEX idx_unique_user_game_active_prediction
  ON betman_predictions(user_id, game_id)
  WHERE status IN ('pending', 'settled');

-- ============================================================
-- 3. prediction_slips.total_odds > 0 체크
-- ============================================================
ALTER TABLE prediction_slips
  ADD CONSTRAINT chk_slip_total_odds_positive
  CHECK (total_odds > 0);

-- ============================================================
-- 4. prediction_slips.stake > 0 체크
-- ============================================================
ALTER TABLE prediction_slips
  ADD CONSTRAINT chk_slip_stake_positive
  CHECK (stake > 0);

-- ============================================================
-- 5. betman_predictions.locked_odds >= 0 체크
-- ============================================================
ALTER TABLE betman_predictions
  ADD CONSTRAINT chk_prediction_locked_odds_non_negative
  CHECK (locked_odds IS NULL OR locked_odds >= 0);

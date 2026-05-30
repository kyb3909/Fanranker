-- 베팅 무결성: 예측 시점의 기준선(over_under_line)·핸디캡(handicap)을 고정.
-- locked_odds 와 동일 취지 — line/handicap 은 sync 마다 최신값으로 덮어써지므로,
-- 유저가 베팅한 시점의 값을 betman_predictions 에 보존해야 "유저가 본 조건 = 정산 조건"이 보장된다.
-- 기존 행은 NULL (소급 적용 없음 — 과거 예측은 locked 값 없음).

ALTER TABLE public.betman_predictions ADD COLUMN IF NOT EXISTS locked_line numeric;
ALTER TABLE public.betman_predictions ADD COLUMN IF NOT EXISTS locked_handicap numeric;

COMMENT ON COLUMN public.betman_predictions.locked_line IS '베팅 시점 언더오버 기준선 (정산/분쟁 검증용)';
COMMENT ON COLUMN public.betman_predictions.locked_handicap IS '베팅 시점 핸디캡 (정산/분쟁 검증용)';

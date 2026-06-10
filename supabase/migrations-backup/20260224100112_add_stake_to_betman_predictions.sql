ALTER TABLE betman_predictions
ADD COLUMN IF NOT EXISTS stake integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN betman_predictions.stake IS '베팅 금액 (볼 단위)';

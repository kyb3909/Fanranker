-- review#4: SUM/SSUM(홀·짝) 마켓 정식 지원.
-- betting-match-card 는 SUM/SSUM 게임에 홀/짝 베팅 버튼을 렌더하지만,
-- betman_predictions_prediction_check 가 odd/even 을 거부해 베팅 INSERT 가 실패했다
-- (슬립 생성 후 예측 저장 실패 → orphan 슬립 원인 중 하나).
-- result-mapper 는 SUM 결과(odd/even)를 생성하고 settle.ts getPointsEarned 도 odd/even 처리하므로
-- CHECK 에 odd/even 을 추가하면 SUM/SSUM 베팅이 정식 동작한다.

ALTER TABLE public.betman_predictions
  DROP CONSTRAINT IF EXISTS betman_predictions_prediction_check;

ALTER TABLE public.betman_predictions
  ADD CONSTRAINT betman_predictions_prediction_check
  CHECK (prediction = ANY (ARRAY['home'::text, 'draw'::text, 'away'::text, 'over'::text, 'under'::text, 'odd'::text, 'even'::text]));

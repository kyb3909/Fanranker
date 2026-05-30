-- review #10: 미사용 정산 RPC 제거 (foot-gun).
-- settle_predictions_by_round 는 승리 시 볼을 반환하는 버그가 있어 scripts/vps/fetch-results.sh:295
-- 가 "사용 금지" 주석으로 막고 /api/betman/settle (settlePredictions TS) 를 호출한다.
-- settle_round 는 settle_predictions_by_round 에 위임, settle_betman_game 도 호출처 없음.
-- 실수로 호출 시 잘못된 정산(볼 반환) 위험이라 제거. 의존성 순서(settle_round 먼저)로 drop.
-- 운영 DB 는 Management API 로 적용 완료.

DROP FUNCTION IF EXISTS public.settle_round(text);
DROP FUNCTION IF EXISTS public.settle_predictions_by_round(text);
DROP FUNCTION IF EXISTS public.settle_betman_game(uuid, integer, integer);

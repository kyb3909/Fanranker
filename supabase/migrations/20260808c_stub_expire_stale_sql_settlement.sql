-- 정산 로직 이원화 제거 (2026-08-08 감사 P1-1).
--
-- expire_stale_pending_predictions 는 슬립 won/lost/cancelled 판정을 TS 정본
-- (lib/betman/settle.ts settlePredictions)과 별개로 재구현한 두 번째 상태머신이었다:
-- 부분취소 total_odds 재계산 없음 · settlement_audit_log 미기록 · 정산 알림 미발송 ·
-- 유저 통계/스타디움 동기화 미실행 · refund 실패 시 pending_refunds 큐잉 없음.
-- /api/betman/expire-pending 라우트가 "취소 + settlePredictions 경유"로 대체한다.
--
-- DROP 이 아니라 no-op 스텁인 이유(배포 순서 안전): 이 마이그레이션은 즉시 적용되지만
-- 새 라우트 코드는 다음 배포부터 유효하다. 그 사이 구 라우트가 RPC 를 호출해도
-- 0건 성공으로 무해하게 지나가게 한다 (실정산은 settle-pending 15분 스윕이 계속 커버).
-- 새 코드 배포가 안착한 뒤 별도 마이그레이션으로 DROP 해도 된다.

CREATE OR REPLACE FUNCTION public.expire_stale_pending_predictions()
RETURNS TABLE(expired_count integer, refunded_count integer)
LANGUAGE plpgsql
AS $function$
BEGIN
  -- deprecated stub (2026-08-08) — 실구현은 /api/betman/expire-pending 라우트의
  -- settlePredictions 경유 경로로 이관됨. 이 함수는 더 이상 아무것도 하지 않는다.
  RETURN QUERY SELECT 0, 0;
END;
$function$;

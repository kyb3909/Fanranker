-- CSO CRITICAL (2026-05-30): 돈/정산 mutation RPC 가 anon/authenticated 에 노출.
--
-- 문제: 아래 함수들은 모두 SECURITY DEFINER (RLS 우회) + 본문이 p_user_id 를 그대로
-- 신뢰 (호출자 검증 없음). 그런데 anon/authenticated 에 EXECUTE GRANT 되어 있어,
-- 누구나 공개된 NEXT_PUBLIC_SUPABASE anon key 로 /rest/v1/rpc/<fn> 를 직접 호출해
-- 임의 유저에게 무한 토큰/골드 발급, 임의 정산 트리거, 커미션 조작이 가능하다.
--
-- 안전성: 모든 호출처가 createServiceRoleClient (lib/supabase/server) 이다.
--   토큰/골드 차감·환불·지급: app/api/betman/prediction, tokens/spend, payments/purchase,
--     predictions/purchase, gold/reward, tokens/balance, admin/refunds, cron/daily-token-reset,
--     lib/betman/settle, lib/betman/refund-tokens, lib/predictions/retry-seller-reward
--   settle_* / escrow_* / metaverse_spend_activity_points: 호출처 0건 (미사용)
-- → client role(anon/authenticated) 권한을 회수해도 서버 기능은 그대로 동작한다.
--   service_role 은 유지 (REVOKE 대상 아님).

-- 토큰
REVOKE EXECUTE ON FUNCTION public.refund_tokens(text, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.spend_tokens(text, integer, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_tokens(text, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_daily_token_reset(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_user_daily_tokens(text) FROM anon, authenticated;

-- 골드
REVOKE EXECUTE ON FUNCTION public.spend_gold(text, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reward_gold(text, integer, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_gold(text, integer, text) FROM anon, authenticated;

-- 커미션 에스크로 (오버로드 포함)
REVOKE EXECUTE ON FUNCTION public.escrow_hold_gold(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escrow_hold_gold(text, uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escrow_refund_gold(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escrow_refund_gold(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escrow_release_gold(uuid) FROM anon, authenticated;

-- 메타버스 활동 포인트
REVOKE EXECUTE ON FUNCTION public.metaverse_spend_activity_points(text, integer, text) FROM anon, authenticated;

-- 미사용 정산 RPC (호출처 0 — 실제 정산은 TS settlePredictions. review #10 foot-gun)
REVOKE EXECUTE ON FUNCTION public.settle_betman_game(uuid, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_predictions_by_round(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_round(text) FROM anon, authenticated;

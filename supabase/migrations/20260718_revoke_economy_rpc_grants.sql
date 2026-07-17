-- 20260718_revoke_economy_rpc_grants.sql
--
-- 보안 후속 조치 — 경제(볼/골드/에스크로/구매) RPC 의 클라이언트 직접 실행 차단.
-- 배경: 브라우저는 공개 publishable key 로 PostgREST /rest/v1/rpc/* 를 직접 호출할 수 있다.
--       아래 함수는 전부 SECURITY DEFINER 라 RLS 를 우회하며, p_user_id 를 인자로만 받고
--       내부 인증 검사가 없다. 20260615_security_harden_rls_grants 에서 award_points·
--       donate_flair_score_to_team 만 잠갔고, 볼/골드 RPC 는 PUBLIC/anon/authenticated 로
--       열려 있었다(= API 를 건너뛰고 DB 로 직접 가면 자기 계정에 볼/골드 무한 충전 가능).
--
--       앱 API 는 전부 service_role(createServiceRoleClient)로 이 RPC 를 호출하므로,
--       PUBLIC/anon/authenticated EXECUTE 를 회수해도 정상 기능은 영향 없음.
--       (호출부: /api/tokens/spend, /api/gold/reward, /api/betman/prediction,
--        /api/payments/purchase, /api/predictions/purchase, /api/stickers/[id],
--        /api/titles/noun/purchase, /api/metaverse/avatar/purchase, /api/admin/refunds,
--        lib/betman/settle·refund-tokens, lib/predictions/retry-seller-reward,
--        lib/metaverse/karma-award — 전부 service_role)
--
-- 오버로드(동일 이름 다중 시그니처)까지 확실히 잡기 위해 pg_proc 를 순회하며 회수한다.
-- 롤백: 각 함수에 `grant execute ... to anon, authenticated;` (권장하지 않음).

begin;

do $$
declare
  fn record;
  target_names text[] := array[
    'spend_tokens', 'refund_tokens', 'spend_gold', 'reward_gold',
    'admin_adjust_tokens', 'admin_adjust_gold',
    'escrow_hold_gold', 'escrow_release_gold', 'escrow_refund_gold',
    'import_betman_round',
    'metaverse_award_flair_karma', 'metaverse_purchase_avatar',
    'metaverse_spend_activity_points',
    'purchase_sticker', 'purchase_noun_title'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated;', fn.sig);
    -- 서버 호출 경로 보장 (idempotent — 이미 있으면 무해).
    execute format('grant execute on function %s to service_role;', fn.sig);
  end loop;
end $$;

commit;

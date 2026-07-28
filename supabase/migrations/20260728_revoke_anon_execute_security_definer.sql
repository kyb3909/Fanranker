-- SECURITY DEFINER 함수의 anon EXECUTE 회수
--
-- 배경
--   public 스키마의 SECURITY DEFINER 함수 53개가 anon EXECUTE 를 갖고 있었다.
--   SECURITY DEFINER 는 RLS 를 우회하므로, 공개 anon 키(클라이언트 번들에 들어감)만
--   있으면 누구나 PostgREST 로 직접 호출할 수 있는 상태였다.
--
--   실증 (2026-07-28, 읽기 전용 함수로만 확인):
--     POST /rest/v1/rpc/get_team_id_by_alias  (anon key) → 200
--     POST /rest/v1/rpc/spend_tokens          (anon key) → 401 42501
--   즉 20260718 의 경제 RPC REVOKE 는 살아 있으나, 그 밖의 함수는 열려 있었다.
--
--   노출된 것 중 위험한 예:
--     apply_flair_score(user, flair, delta)      임의 유저 호칭 점수 조작
--     sync_stadium_contribution(user, team, pts) 임의 경기장 기여도 주입
--     increment_worldcup_win / increment_battle_side_score  집계 조작
--     recalc_all_user_temperatures() 등 전체 재계산  반복 호출 시 DoS
--     cleanup_old_ticker_items() 등 정리 함수        임의 삭제 유발
--     betman_update_sync_state(text)             크롤 동기화 상태 오염
--
-- 안전성 근거 (적용 전 확인)
--   · 저장소 전체에서 .rpc() 호출부는 전부 서버 사이드다 ("use client" 파일 0건).
--   · 호출자 대부분이 createServiceRoleClient — service_role 은 이 REVOKE 의 영향을 받지 않는다
--     (has_function_privilege('service_role', ...) = true 확인).
--   · 유일한 anon 클라이언트 RPC 는 /api/posts/[id]/view 의 increment_post_view_count 다
--     → 예외로 남긴다. 이 함수가 내부에서 부르는 can_increment_view_count 는
--       SECURITY DEFINER 컨텍스트에서 실행되므로 회수해도 영향 없다.
--   · get_recent_commented_posts 도 anon 클라이언트로 호출되지만 SECURITY DEFINER 가
--     아니라 이 마이그레이션 대상이 아니다.
--
-- 범위
--   authenticated 는 이번에 건드리지 않는다. lib 헬퍼 두 곳
--   (app/api/predictions/settle, app/api/posts POST 경로)의 클라이언트 종류가
--   미확인이라, 확인 후 별도 마이그레이션으로 처리한다.
--
-- ⚠️ 재발 방지: CREATE OR REPLACE 로 함수 시그니처를 바꾸면 EXECUTE 가 PUBLIC 으로
--    리셋된다. 함수를 재정의할 때마다 이 REVOKE 를 다시 붙일 것.
--    (reset_user_daily_tokens 가 실제로 그렇게 다시 열렸다)

-- ⚠️ FROM anon 이 아니라 FROM PUBLIC 이어야 한다.
--    anon 은 EXECUTE 를 직접 부여받은 게 아니라 PUBLIC(ACL 의 `=X/postgres`)을
--    통해 상속받고 있었다. 따라서 REVOKE ... FROM anon 은 no-op 다 (실제로 시도했고
--    53개가 그대로 남았다). service_role / authenticated 는 직접 부여라 영향 없고,
--    increment_post_view_count 는 anon 직접 부여가 있어 PUBLIC 회수 후에도 동작한다.
--
--    적용 전 ACL 예시:
--      apply_flair_score: =X/postgres, postgres=X, authenticated=X, service_role=X
--      spend_tokens     : postgres=X, service_role=X          ← 20260718 이 만든 목표 상태
DO $$
DECLARE
  r record;
  revoked int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    revoked := revoked + 1;
  END LOOP;
  RAISE NOTICE 'PUBLIC EXECUTE revoked on % SECURITY DEFINER function(s)', revoked;
END $$;

-- 롤백이 필요하면 (권장하지 않음):
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

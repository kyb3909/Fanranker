-- ============================================================
-- Fix: metaverse_equip_avatar 가 profiles.id (UUID PK) 로 매칭하던 버그
-- ------------------------------------------------------------
-- 배경:
--   20260424_metaverse_avatar_shop.sql 에 정의된 metaverse_equip_avatar 가
--   `WHERE id = p_user_id` 로 작성되어 있었음. 하지만 이 코드베이스의
--   profiles 테이블은 Clerk 식별자를 `user_id text` 컬럼으로 보관하며
--   (`001_create_profiles.sql` 참고), 다른 모든 RPC/조회는 user_id 기준.
--   결과적으로 유료 아바타를 구매(metaverse_purchase_avatar)해도
--   장착(metaverse_equip_avatar)이 silent fail 했음.
-- 수정:
--   동일 시그니처로 CREATE OR REPLACE 하여 본문의 WHERE 절만 user_id 로 교체.
-- ============================================================

CREATE OR REPLACE FUNCTION metaverse_equip_avatar(
  p_user_id text,
  p_avatar_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_default boolean;
  v_is_active boolean;
  v_owned boolean;
BEGIN
  SELECT is_active, is_default
    INTO v_is_active, v_is_default
    FROM metaverse_avatar_items
    WHERE avatar_key = p_avatar_key;

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found',
      'error_message', '존재하지 않는 아바타입니다');
  END IF;

  -- 기본은 누구나 장착. 유료는 소유 확인.
  IF NOT v_is_default THEN
    SELECT EXISTS(
      SELECT 1 FROM metaverse_avatar_inventory
        WHERE user_id = p_user_id AND avatar_key = p_avatar_key
    ) INTO v_owned;

    IF NOT v_owned THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'not_owned',
        'error_message', '소유하지 않은 아바타입니다');
    END IF;
  END IF;

  UPDATE profiles
    SET metaverse_avatar_key = p_avatar_key
    WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'avatar_key', p_avatar_key
  );
END;
$$;

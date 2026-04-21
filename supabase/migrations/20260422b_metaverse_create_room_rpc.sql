-- ============================================================
-- metaverse_create_chat_room RPC
-- 채팅방 개설을 atomic 하게 처리:
--   1) 활동 포인트 차감 (잔액 부족 시 실패)
--   2) metaverse_chat_rooms INSERT (Plot 충돌 시 실패 — 트랜잭션 자동 롤백)
-- PL/pgSQL 함수 본문은 단일 트랜잭션 — INSERT 실패 시 UPDATE 도 함께 롤백됨.
-- ============================================================

CREATE OR REPLACE FUNCTION metaverse_create_chat_room(
  p_user_id text,
  p_plot_id uuid,
  p_sign_text text,
  p_cost int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_id uuid;
  v_new_balance int;
  v_trimmed text;
BEGIN
  -- Input 검증
  v_trimmed := trim(coalesce(p_sign_text, ''));
  IF length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'sign_text_required');
  END IF;
  IF length(v_trimmed) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'sign_text_too_long');
  END IF;
  IF p_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid_cost');
  END IF;

  -- Plot 존재 확인
  IF NOT EXISTS (SELECT 1 FROM metaverse_world_plots WHERE id = p_plot_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'plot_not_found');
  END IF;

  -- 1) 잔액 차감 (원자적 — WHERE 절로 잔액 체크)
  UPDATE metaverse_user_activity_balance
    SET spendable_points = spendable_points - p_cost, updated_at = now()
    WHERE user_id = p_user_id AND spendable_points >= p_cost
    RETURNING spendable_points INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'insufficient_balance');
  END IF;

  -- 2) 방 INSERT — UNIQUE(plot_id) WHERE closed_at IS NULL 로 race 방어.
  --    충돌 나면 unique_violation 예외 → BEGIN 블록에서 잡아서 명시적 에러 반환.
  --    RAISE EXCEPTION 없이 정상 return 해도 함수 전체가 하나의 서브트랜잭션이므로
  --    명시 ROLLBACK 처리를 위해 savepoint 대신 BEGIN EXCEPTION 블록 사용.
  BEGIN
    INSERT INTO metaverse_chat_rooms (plot_id, owner_user_id, sign_text)
      VALUES (p_plot_id, p_user_id, v_trimmed)
      RETURNING id INTO v_room_id;
  EXCEPTION
    WHEN unique_violation THEN
      -- 동시에 다른 유저가 선점 → 차감 롤백 후 명시 에러
      UPDATE metaverse_user_activity_balance
        SET spendable_points = spendable_points + p_cost, updated_at = now()
        WHERE user_id = p_user_id;
      RETURN jsonb_build_object('success', false, 'error_message', 'plot_occupied');
  END;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', v_room_id,
    'new_balance', v_new_balance
  );
END;
$$;

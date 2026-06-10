-- ============================================================
-- 메타버스 아바타 쇼핑 + 인벤토리
-- ============================================================
-- 목적: 사이드스크롤러 캐릭터 외형(유니폼 등) 을 쇼핑에서 구매, 장착.
-- 기본 프리셋 (default-pro-xl) 은 모두에게 자동으로 소유된 것으로 간주 (인벤토리 행 불필요).
-- 구매는 gold (user_gold.gold_balance, 기존 spend_gold RPC 패턴 차용) 로.
-- ============================================================

-- 1. 프로필에 "현재 장착 중인 아바타 키" 필드 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS metaverse_avatar_key text NULL;

-- NULL 이면 기본 프리셋으로 간주. 그러므로 모든 기존 유저는 자연스레 default 상태.

-- 2. 아바타 상품 카탈로그 (쇼핑에서 구매 가능한 프리셋 목록)
CREATE TABLE IF NOT EXISTS metaverse_avatar_items (
  avatar_key text PRIMARY KEY,                  -- lib/metaverse/avatar/presets.ts 의 preset id 와 1:1
  name text NOT NULL,                           -- 표시명 (예: "아스날 홈 유니폼")
  description text NULL,                        -- 상세 설명
  price_gold int NOT NULL CHECK (price_gold >= 0),
  is_active boolean NOT NULL DEFAULT true,      -- 판매 중지 시 false
  is_default boolean NOT NULL DEFAULT false,    -- 무료 기본 아바타 (구매 없이 장착 가능)
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metaverse_avatar_items_active
  ON metaverse_avatar_items(sort_order) WHERE is_active = true;

-- 3. 유저 인벤토리 (구매 이력)
CREATE TABLE IF NOT EXISTS metaverse_avatar_inventory (
  user_id text NOT NULL,
  avatar_key text NOT NULL REFERENCES metaverse_avatar_items(avatar_key) ON DELETE CASCADE,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'purchase',      -- 'purchase' | 'grant' | 'event'
  price_paid_gold int NULL,                     -- 구매 시점 가격 스냅샷 (감사용)
  PRIMARY KEY (user_id, avatar_key)
);

CREATE INDEX IF NOT EXISTS idx_metaverse_avatar_inv_user
  ON metaverse_avatar_inventory(user_id);

-- 4. RPC: metaverse_purchase_avatar
-- 원자적으로 gold 차감 + 인벤토리 삽입. 이미 소유 시 실패.
CREATE OR REPLACE FUNCTION metaverse_purchase_avatar(
  p_user_id text,
  p_avatar_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price int;
  v_is_active boolean;
  v_is_default boolean;
  v_already_owned boolean;
  v_new_gold int;
BEGIN
  -- 상품 존재 + 활성 여부 확인
  SELECT price_gold, is_active, is_default
    INTO v_price, v_is_active, v_is_default
    FROM metaverse_avatar_items
    WHERE avatar_key = p_avatar_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found',
      'error_message', '존재하지 않는 아바타입니다');
  END IF;

  IF NOT v_is_active THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'inactive',
      'error_message', '판매 중지된 아바타입니다');
  END IF;

  IF v_is_default THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'free',
      'error_message', '기본 아바타는 구매할 필요가 없습니다');
  END IF;

  -- 이미 소유 여부
  SELECT EXISTS(
    SELECT 1 FROM metaverse_avatar_inventory
      WHERE user_id = p_user_id AND avatar_key = p_avatar_key
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_owned',
      'error_message', '이미 소유하고 있는 아바타입니다');
  END IF;

  -- gold 차감 (user_gold 원자적 업데이트; 기존 spend_gold RPC 와 동일 로직)
  UPDATE user_gold
    SET gold_balance = gold_balance - v_price, updated_at = now()
    WHERE user_id = p_user_id AND gold_balance >= v_price
    RETURNING gold_balance INTO v_new_gold;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'insufficient_gold',
      'error_message', '골드가 부족합니다');
  END IF;

  -- 거래 로그 (gold_transactions) — 기존 spend_gold 패턴
  INSERT INTO gold_transactions (user_id, transaction_type, amount, balance_after, description)
    VALUES (p_user_id, 'metaverse_avatar_purchase', -v_price, v_new_gold,
            format('유니폼 구매: %s', p_avatar_key));

  -- 인벤토리 삽입
  INSERT INTO metaverse_avatar_inventory (user_id, avatar_key, source, price_paid_gold)
    VALUES (p_user_id, p_avatar_key, 'purchase', v_price);

  RETURN jsonb_build_object(
    'success', true,
    'avatar_key', p_avatar_key,
    'price_paid', v_price,
    'remaining_gold', v_new_gold
  );
END;
$$;

-- 5. RPC: metaverse_equip_avatar
-- 장착. 기본(free) 또는 소유한 아바타만 장착 가능.
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
    WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'avatar_key', p_avatar_key
  );
END;
$$;

-- 6. 카탈로그 시드 — 기본 프리셋 (무료) + 아스날 홈 (500 gold)
INSERT INTO metaverse_avatar_items (avatar_key, name, description, price_gold, is_default, sort_order)
VALUES
  ('default-pro-xl', '기본 아바타', '공동체의 기본 사이드뷰 캐릭터', 0, true, 0),
  ('arsenal-home', '빨강 유니폼 (홈 킷)', '흰 소매의 빨간색 축구 유니폼', 500, false, 10)
ON CONFLICT (avatar_key) DO NOTHING;

-- 7. RLS
ALTER TABLE metaverse_avatar_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE metaverse_avatar_inventory ENABLE ROW LEVEL SECURITY;

-- 카탈로그는 누구나 읽기
CREATE POLICY "metaverse_avatar_items_read"
  ON metaverse_avatar_items FOR SELECT USING (is_active = true);

-- 인벤토리는 본인만 읽기
CREATE POLICY "metaverse_avatar_inv_self_read"
  ON metaverse_avatar_inventory FOR SELECT
  USING (user_id = (auth.jwt()->>'sub'));

-- 삽입/수정/삭제는 RPC (SECURITY DEFINER) 통해서만. 직접 쓰기 없음.

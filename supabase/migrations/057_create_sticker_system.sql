-- =============================================
-- 057: 밈 스티커 시스템
-- 유저 업로드 → 커뮤니티 추천 → 상점 등록 → 포인트 거래
-- =============================================

-- 1. 스티커 팩 (게시판별 or 범용)
CREATE TABLE IF NOT EXISTS sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  board_slug TEXT,            -- NULL = 범용
  icon_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 개별 스티커
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID REFERENCES sticker_packs(id) ON DELETE SET NULL,
  creator_id TEXT NOT NULL,       -- Clerk user_id (업로더)
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,        -- WebP/WebM URL
  media_type TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'animated')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  price INT DEFAULT 100,          -- 활동 포인트 가격
  creator_cut INT DEFAULT 50,     -- 크리에이터 수익 비율 (%)
  vote_count INT DEFAULT 0,       -- 추천 수
  vote_threshold INT DEFAULT 10,  -- 자동 승인 기준
  purchase_count INT DEFAULT 0,
  use_count INT DEFAULT 0,        -- 댓글에서 사용된 횟수
  board_slug TEXT,                -- NULL = 범용
  tags TEXT[],                    -- 검색용 태그
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

CREATE INDEX idx_stickers_status ON stickers(status);
CREATE INDEX idx_stickers_creator ON stickers(creator_id);
CREATE INDEX idx_stickers_board ON stickers(board_slug);
CREATE INDEX idx_stickers_pack ON stickers(pack_id);
CREATE INDEX idx_stickers_popular ON stickers(purchase_count DESC) WHERE status = 'approved';

-- 3. 스티커 추천 투표 (pending → approved 전환용)
CREATE TABLE IF NOT EXISTS sticker_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sticker_id, user_id)
);

-- 4. 유저 스티커 인벤토리
CREATE TABLE IF NOT EXISTS user_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, sticker_id)
);

CREATE INDEX idx_user_stickers_user ON user_stickers(user_id);

-- 5. 댓글에 스티커 지원 추가
ALTER TABLE comments ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES stickers(id);

-- =============================================
-- RLS 정책
-- =============================================

ALTER TABLE sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stickers ENABLE ROW LEVEL SECURITY;

-- 모든 테이블 SELECT 허용
CREATE POLICY "sticker_packs_select" ON sticker_packs FOR SELECT USING (true);
CREATE POLICY "stickers_select" ON stickers FOR SELECT USING (true);
CREATE POLICY "sticker_votes_select" ON sticker_votes FOR SELECT USING (true);
CREATE POLICY "user_stickers_select" ON user_stickers FOR SELECT USING (true);

-- 서비스 롤만 INSERT/UPDATE/DELETE
CREATE POLICY "sticker_packs_service" ON sticker_packs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "stickers_service" ON stickers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "sticker_votes_service" ON sticker_votes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "user_stickers_service" ON user_stickers FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- RPC: 스티커 추천 (투표)
-- =============================================
CREATE OR REPLACE FUNCTION vote_sticker(p_sticker_id UUID, p_user_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INT;
  v_threshold INT;
  v_status TEXT;
BEGIN
  -- 이미 투표했는지 확인
  SELECT EXISTS(
    SELECT 1 FROM sticker_votes WHERE sticker_id = p_sticker_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_voted');
  END IF;

  -- 스티커 상태 확인
  SELECT status, vote_threshold INTO v_status, v_threshold
  FROM stickers WHERE id = p_sticker_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;

  -- 투표 기록
  INSERT INTO sticker_votes (sticker_id, user_id) VALUES (p_sticker_id, p_user_id);

  -- 투표 수 업데이트
  UPDATE stickers SET vote_count = vote_count + 1 WHERE id = p_sticker_id
  RETURNING vote_count INTO v_new_count;

  -- 임계값 도달 시 자동 승인
  IF v_new_count >= v_threshold THEN
    UPDATE stickers SET status = 'approved', approved_at = now() WHERE id = p_sticker_id;
    RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', false);
END;
$$;

-- =============================================
-- RPC: 스티커 구매 (포인트 차감 + 크리에이터 수익)
-- =============================================
CREATE OR REPLACE FUNCTION purchase_sticker(
  p_user_id TEXT,
  p_sticker_id UUID,
  p_board_slug TEXT DEFAULT 'free-board'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sticker RECORD;
  v_already_owned BOOLEAN;
  v_buyer_points INT;
  v_creator_reward INT;
BEGIN
  -- 스티커 조회
  SELECT id, creator_id, name, price, creator_cut, status
  INTO v_sticker
  FROM stickers WHERE id = p_sticker_id;

  IF v_sticker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_sticker.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_approved');
  END IF;

  -- 자기가 만든 스티커는 무료
  IF v_sticker.creator_id = p_user_id THEN
    INSERT INTO user_stickers (user_id, sticker_id)
    VALUES (p_user_id, p_sticker_id)
    ON CONFLICT (user_id, sticker_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'spent', 0, 'name', v_sticker.name);
  END IF;

  -- 이미 소유 확인
  SELECT EXISTS(
    SELECT 1 FROM user_stickers WHERE user_id = p_user_id AND sticker_id = p_sticker_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  -- 포인트 확인
  SELECT COALESCE(available_points, 0) INTO v_buyer_points
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = p_board_slug;

  IF v_buyer_points IS NULL OR v_buyer_points < v_sticker.price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'required', v_sticker.price, 'available', COALESCE(v_buyer_points, 0));
  END IF;

  -- 구매자 포인트 차감
  UPDATE user_board_points
  SET available_points = available_points - v_sticker.price, updated_at = now()
  WHERE user_id = p_user_id AND board_slug = p_board_slug;

  INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
  VALUES (p_user_id, p_board_slug, -v_sticker.price, 'shop_purchase', '스티커 구매: ' || v_sticker.name, p_sticker_id);

  -- 크리에이터 수익 지급
  v_creator_reward := (v_sticker.price * v_sticker.creator_cut / 100);
  IF v_creator_reward > 0 THEN
    INSERT INTO user_board_points (user_id, board_slug, total_points, available_points, level)
    VALUES (v_sticker.creator_id, p_board_slug, v_creator_reward, v_creator_reward, 1)
    ON CONFLICT (user_id, board_slug) DO UPDATE SET
      total_points = user_board_points.total_points + v_creator_reward,
      available_points = user_board_points.available_points + v_creator_reward,
      updated_at = now();

    INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
    VALUES (v_sticker.creator_id, p_board_slug, v_creator_reward, 'sticker_revenue', '스티커 판매 수익: ' || v_sticker.name, p_sticker_id);
  END IF;

  -- 인벤토리에 추가
  INSERT INTO user_stickers (user_id, sticker_id) VALUES (p_user_id, p_sticker_id);

  -- 구매 카운트 증가
  UPDATE stickers SET purchase_count = purchase_count + 1 WHERE id = p_sticker_id;

  RETURN jsonb_build_object('success', true, 'spent', v_sticker.price, 'creator_reward', v_creator_reward, 'name', v_sticker.name);
END;
$$;

-- =============================================
-- RPC: 스티커 사용 카운트 증가
-- =============================================
CREATE OR REPLACE FUNCTION increment_sticker_use(p_sticker_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE stickers SET use_count = use_count + 1 WHERE id = p_sticker_id;
$$;

-- =============================================
-- 기본 스티커 팩 시딩
-- =============================================
INSERT INTO sticker_packs (name, description, board_slug, icon_url, sort_order) VALUES
  ('인기 스티커', '가장 많이 사용되는 스티커', NULL, '🔥', 0),
  ('축구', '축구 관련 스티커', 'football', '⚽', 1),
  ('야구', '야구 관련 스티커', 'baseball', '⚾', 2),
  ('농구', '농구 관련 스티커', 'basketball', '🏀', 3),
  ('자유', '자유 게시판 스티커', 'free-board', '🎭', 4);

-- ============================================================
-- 056 + 057 통합 마이그레이션
-- Part 1: 배틀 시스템 (갈드컵 + 이상형 월드컵)
-- Part 2: 밈 스티커 시스템
-- ============================================================

-- ============================================
-- PART 1: 배틀 시스템
-- ============================================

-- 1. 마스터 테이블: 배틀 방
CREATE TABLE IF NOT EXISTS battle_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  mode text NOT NULL CHECK (mode IN ('cheer', 'worldcup')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upcoming', 'active', 'ended')),
  category text,
  thumbnail_url text,
  created_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  bracket_size int,
  total_participants int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battle_rooms_status ON battle_rooms (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_rooms_mode ON battle_rooms (mode, status);

-- 2. 응원 배틀: 진영
CREATE TABLE IF NOT EXISTS battle_sides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  color text NOT NULL DEFAULT '#10b981',
  score int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battle_sides_battle ON battle_sides (battle_id, sort_order);

-- 3. 응원 배틀: 진영 선택
CREATE TABLE IF NOT EXISTS battle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  side_id uuid NOT NULL REFERENCES battle_sides(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_battle_participants_battle ON battle_participants (battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_participants_user ON battle_participants (user_id);

-- 4. 응원 배틀: 댓글 (= 점수)
CREATE TABLE IF NOT EXISTS battle_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  side_id uuid NOT NULL REFERENCES battle_sides(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  nickname text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battle_comments_battle ON battle_comments (battle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_comments_side ON battle_comments (side_id, created_at DESC);

-- 5. 이상형 월드컵: 후보
CREATE TABLE IF NOT EXISTS worldcup_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  description text,
  seed int NOT NULL DEFAULT 0,
  win_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_candidates_battle ON worldcup_candidates (battle_id, seed);

-- 6. 이상형 월드컵: 유저 세션
CREATE TABLE IF NOT EXISTS worldcup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  bracket_size int NOT NULL,
  current_round int NOT NULL DEFAULT 1,
  winner_id uuid REFERENCES worldcup_candidates(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_sessions_battle ON worldcup_sessions (battle_id);
CREATE INDEX IF NOT EXISTS idx_worldcup_sessions_user ON worldcup_sessions (user_id, created_at DESC);

-- 7. 이상형 월드컵: 개별 투표
CREATE TABLE IF NOT EXISTS worldcup_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES worldcup_sessions(id) ON DELETE CASCADE,
  round int NOT NULL,
  match_index int NOT NULL,
  candidate_a_id uuid NOT NULL REFERENCES worldcup_candidates(id),
  candidate_b_id uuid NOT NULL REFERENCES worldcup_candidates(id),
  winner_id uuid NOT NULL REFERENCES worldcup_candidates(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worldcup_votes_session ON worldcup_votes (session_id, round, match_index);

-- RLS: 배틀 테이블
ALTER TABLE battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_sides ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_rooms_select" ON battle_rooms FOR SELECT USING (true);
CREATE POLICY "battle_sides_select" ON battle_sides FOR SELECT USING (true);
CREATE POLICY "battle_participants_select" ON battle_participants FOR SELECT USING (true);
CREATE POLICY "battle_comments_select" ON battle_comments FOR SELECT USING (true);
CREATE POLICY "worldcup_candidates_select" ON worldcup_candidates FOR SELECT USING (true);
CREATE POLICY "worldcup_sessions_select" ON worldcup_sessions FOR SELECT USING (true);
CREATE POLICY "worldcup_votes_select" ON worldcup_votes FOR SELECT USING (true);

CREATE POLICY "battle_rooms_service" ON battle_rooms FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "battle_sides_service" ON battle_sides FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "battle_participants_service" ON battle_participants FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "battle_comments_service" ON battle_comments FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "worldcup_candidates_service" ON worldcup_candidates FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "worldcup_sessions_service" ON worldcup_sessions FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "worldcup_votes_service" ON worldcup_votes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 배틀 RPC 함수들
CREATE OR REPLACE FUNCTION increment_battle_side_score(p_side_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE battle_sides SET score = score + 1 WHERE id = p_side_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_battle_participants(p_battle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE battle_rooms SET total_participants = total_participants + 1 WHERE id = p_battle_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_worldcup_win(p_candidate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE worldcup_candidates SET win_count = win_count + 1 WHERE id = p_candidate_id;
END;
$$;

-- ============================================
-- PART 2: 밈 스티커 시스템
-- ============================================

-- 1. 스티커 팩
CREATE TABLE IF NOT EXISTS sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  board_slug TEXT,
  icon_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 개별 스티커
CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID REFERENCES sticker_packs(id) ON DELETE SET NULL,
  creator_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  media_type TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'animated')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  price INT DEFAULT 100,
  creator_cut INT DEFAULT 50,
  vote_count INT DEFAULT 0,
  vote_threshold INT DEFAULT 10,
  purchase_count INT DEFAULT 0,
  use_count INT DEFAULT 0,
  board_slug TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ
);

CREATE INDEX idx_stickers_status ON stickers(status);
CREATE INDEX idx_stickers_creator ON stickers(creator_id);
CREATE INDEX idx_stickers_board ON stickers(board_slug);
CREATE INDEX idx_stickers_pack ON stickers(pack_id);
CREATE INDEX idx_stickers_popular ON stickers(purchase_count DESC) WHERE status = 'approved';

-- 3. 스티커 추천 투표
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

-- 5. 댓글에 스티커 컬럼 추가
ALTER TABLE comments ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES stickers(id);

-- RLS: 스티커 테이블
ALTER TABLE sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sticker_packs_select" ON sticker_packs FOR SELECT USING (true);
CREATE POLICY "stickers_select" ON stickers FOR SELECT USING (true);
CREATE POLICY "sticker_votes_select" ON sticker_votes FOR SELECT USING (true);
CREATE POLICY "user_stickers_select" ON user_stickers FOR SELECT USING (true);

CREATE POLICY "sticker_packs_service" ON sticker_packs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "stickers_service" ON stickers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "sticker_votes_service" ON sticker_votes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "user_stickers_service" ON user_stickers FOR ALL USING (auth.role() = 'service_role');

-- 스티커 추천 RPC
CREATE OR REPLACE FUNCTION vote_sticker(p_sticker_id UUID, p_user_id TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INT;
  v_threshold INT;
  v_status TEXT;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM sticker_votes WHERE sticker_id = p_sticker_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_voted');
  END IF;

  SELECT status, vote_threshold INTO v_status, v_threshold
  FROM stickers WHERE id = p_sticker_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;

  INSERT INTO sticker_votes (sticker_id, user_id) VALUES (p_sticker_id, p_user_id);

  UPDATE stickers SET vote_count = vote_count + 1 WHERE id = p_sticker_id
  RETURNING vote_count INTO v_new_count;

  IF v_new_count >= v_threshold THEN
    UPDATE stickers SET status = 'approved', approved_at = now() WHERE id = p_sticker_id;
    RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'vote_count', v_new_count, 'auto_approved', false);
END;
$$;

-- 스티커 구매 RPC
CREATE OR REPLACE FUNCTION purchase_sticker(
  p_user_id TEXT,
  p_sticker_id UUID,
  p_board_slug TEXT DEFAULT 'free-board'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sticker RECORD;
  v_already_owned BOOLEAN;
  v_buyer_points INT;
  v_creator_reward INT;
BEGIN
  SELECT id, creator_id, name, price, creator_cut, status
  INTO v_sticker FROM stickers WHERE id = p_sticker_id;

  IF v_sticker.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_found');
  END IF;

  IF v_sticker.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_approved');
  END IF;

  IF v_sticker.creator_id = p_user_id THEN
    INSERT INTO user_stickers (user_id, sticker_id)
    VALUES (p_user_id, p_sticker_id)
    ON CONFLICT (user_id, sticker_id) DO NOTHING;
    RETURN jsonb_build_object('success', true, 'spent', 0, 'name', v_sticker.name);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_stickers WHERE user_id = p_user_id AND sticker_id = p_sticker_id
  ) INTO v_already_owned;

  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owned');
  END IF;

  SELECT COALESCE(available_points, 0) INTO v_buyer_points
  FROM user_board_points WHERE user_id = p_user_id AND board_slug = p_board_slug;

  IF v_buyer_points IS NULL OR v_buyer_points < v_sticker.price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_points', 'required', v_sticker.price, 'available', COALESCE(v_buyer_points, 0));
  END IF;

  UPDATE user_board_points
  SET available_points = available_points - v_sticker.price, updated_at = now()
  WHERE user_id = p_user_id AND board_slug = p_board_slug;

  INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
  VALUES (p_user_id, p_board_slug, -v_sticker.price, 'shop_purchase', '스티커 구매: ' || v_sticker.name, p_sticker_id);

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

  INSERT INTO user_stickers (user_id, sticker_id) VALUES (p_user_id, p_sticker_id);
  UPDATE stickers SET purchase_count = purchase_count + 1 WHERE id = p_sticker_id;

  RETURN jsonb_build_object('success', true, 'spent', v_sticker.price, 'creator_reward', v_creator_reward, 'name', v_sticker.name);
END;
$$;

-- 스티커 사용 카운트 증가
CREATE OR REPLACE FUNCTION increment_sticker_use(p_sticker_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE stickers SET use_count = use_count + 1 WHERE id = p_sticker_id;
$$;

-- 기본 스티커 팩 시딩
INSERT INTO sticker_packs (name, description, board_slug, icon_url, sort_order) VALUES
  ('인기 스티커', '가장 많이 사용되는 스티커', NULL, '🔥', 0),
  ('축구', '축구 관련 스티커', 'football', '⚽', 1),
  ('야구', '야구 관련 스티커', 'baseball', '⚾', 2),
  ('농구', '농구 관련 스티커', 'basketball', '🏀', 3),
  ('자유', '자유 게시판 스티커', 'free-board', '🎭', 4);

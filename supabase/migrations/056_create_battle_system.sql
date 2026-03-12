-- ============================================
-- 배틀 시스템: 응원 배틀 + 이상형 월드컵
-- ============================================

-- 1. 마스터 테이블: 배틀 방
CREATE TABLE IF NOT EXISTS battle_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  mode text NOT NULL CHECK (mode IN ('cheer', 'worldcup')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'upcoming', 'active', 'ended')),
  category text, -- '축구', '야구', '농구', '배구', '자유'
  thumbnail_url text,
  created_by text NOT NULL, -- clerk user_id
  approved_by text, -- 승인한 관리자 user_id
  approved_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  bracket_size int, -- 이상형 월드컵용: 8, 16, 32
  total_participants int NOT NULL DEFAULT 0, -- 비정규화: 참여자 수
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_battle_rooms_status ON battle_rooms (status, created_at DESC);
CREATE INDEX idx_battle_rooms_mode ON battle_rooms (mode, status);

-- 2. 응원 배틀: 진영
CREATE TABLE IF NOT EXISTS battle_sides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  color text NOT NULL DEFAULT '#10b981', -- hex color for gauge
  score int NOT NULL DEFAULT 0, -- 비정규화: 댓글 수 = 점수
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_battle_sides_battle ON battle_sides (battle_id, sort_order);

-- 3. 응원 배틀: 진영 선택 (유저당 1번)
CREATE TABLE IF NOT EXISTS battle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  side_id uuid NOT NULL REFERENCES battle_sides(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, user_id)
);

CREATE INDEX idx_battle_participants_battle ON battle_participants (battle_id);
CREATE INDEX idx_battle_participants_user ON battle_participants (user_id);

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

CREATE INDEX idx_battle_comments_battle ON battle_comments (battle_id, created_at DESC);
CREATE INDEX idx_battle_comments_side ON battle_comments (side_id, created_at DESC);

-- 5. 이상형 월드컵: 후보
CREATE TABLE IF NOT EXISTS worldcup_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text,
  description text,
  seed int NOT NULL DEFAULT 0,
  win_count int NOT NULL DEFAULT 0, -- 비정규화: 최종 우승 횟수
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_worldcup_candidates_battle ON worldcup_candidates (battle_id, seed);

-- 6. 이상형 월드컵: 유저 세션
CREATE TABLE IF NOT EXISTS worldcup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  bracket_size int NOT NULL, -- 실제 진행 사이즈 (8, 16, 32)
  current_round int NOT NULL DEFAULT 1,
  winner_id uuid REFERENCES worldcup_candidates(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_worldcup_sessions_battle ON worldcup_sessions (battle_id);
CREATE INDEX idx_worldcup_sessions_user ON worldcup_sessions (user_id, created_at DESC);

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

CREATE INDEX idx_worldcup_votes_session ON worldcup_votes (session_id, round, match_index);

-- ============================================
-- RLS 정책
-- ============================================
ALTER TABLE battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_sides ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worldcup_votes ENABLE ROW LEVEL SECURITY;

-- 모든 테이블: SELECT 허용
CREATE POLICY "battle_rooms_select" ON battle_rooms FOR SELECT USING (true);
CREATE POLICY "battle_sides_select" ON battle_sides FOR SELECT USING (true);
CREATE POLICY "battle_participants_select" ON battle_participants FOR SELECT USING (true);
CREATE POLICY "battle_comments_select" ON battle_comments FOR SELECT USING (true);
CREATE POLICY "worldcup_candidates_select" ON worldcup_candidates FOR SELECT USING (true);
CREATE POLICY "worldcup_sessions_select" ON worldcup_sessions FOR SELECT USING (true);
CREATE POLICY "worldcup_votes_select" ON worldcup_votes FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE: service role only (API route에서 처리)
CREATE POLICY "battle_rooms_service" ON battle_rooms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "battle_sides_service" ON battle_sides FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "battle_participants_service" ON battle_participants FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "battle_comments_service" ON battle_comments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "worldcup_candidates_service" ON worldcup_candidates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "worldcup_sessions_service" ON worldcup_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "worldcup_votes_service" ON worldcup_votes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 응원 배틀 점수 증가 함수 (댓글 작성 시 호출)
-- ============================================
CREATE OR REPLACE FUNCTION increment_battle_side_score(p_side_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE battle_sides
  SET score = score + 1
  WHERE id = p_side_id;
END;
$$;

-- 참여자 수 증가 함수
CREATE OR REPLACE FUNCTION increment_battle_participants(p_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE battle_rooms
  SET total_participants = total_participants + 1
  WHERE id = p_battle_id;
END;
$$;

-- 이상형 월드컵 우승 횟수 증가
CREATE OR REPLACE FUNCTION increment_worldcup_win(p_candidate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE worldcup_candidates
  SET win_count = win_count + 1
  WHERE id = p_candidate_id;
END;
$$;

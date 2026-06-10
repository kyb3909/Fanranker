-- ============================================================
-- 경기장 메타버스 — 신규 스키마 (Phase 1~3 통합)
-- ============================================================
-- 참조: docs/PRD-stadium-metaverse.md 섹션 10
-- 격리 원칙: 모든 신규 테이블은 metaverse_ 접두사
-- 기존 테이블 변경: posts.flair_team_id 컬럼 하나만 (NULL 허용)
-- ============================================================

-- 0. posts.flair_team_id — 팀 플레어 (기존 post_flairs 타입 플레어와 별개)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS flair_team_id text NULL;

-- FK constraint은 "IF NOT EXISTS"를 직접 지원하지 않으므로 DO 블록으로 idempotent 보장
DO $$ BEGIN
  ALTER TABLE posts
    ADD CONSTRAINT posts_flair_team_id_fkey
    FOREIGN KEY (flair_team_id) REFERENCES team_map_pins(team_id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_flair_team
  ON posts(flair_team_id) WHERE flair_team_id IS NOT NULL;

-- 1. 활동 포인트 잔액 (spendable) + 평생 누적 (lifetime earned, 참조용)
-- 카르마 총합은 SUM(stadium_contributions.points_contributed WHERE user_id=?)
-- 이 테이블은 채팅방 개설 등 "소모 가능한" 포인트만 별도로 트랙한다.
CREATE TABLE IF NOT EXISTS metaverse_user_activity_balance (
  user_id text PRIMARY KEY,
  spendable_points int NOT NULL DEFAULT 0 CHECK (spendable_points >= 0),
  lifetime_earned int NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 팬덤 가입 (유저 × 팀)
CREATE TABLE IF NOT EXISTS metaverse_fandom_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  team_id text NOT NULL REFERENCES team_map_pins(team_id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  joined_with_points int NOT NULL,  -- 가입 시점 팀별 카르마 (감사)
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_metaverse_fandom_user
  ON metaverse_fandom_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_metaverse_fandom_team
  ON metaverse_fandom_memberships(team_id);

-- 3. 월드맵 광장 Plot (정적 seed)
-- 좌표는 team_map_pins와 동일한 0~100 정규화 공간 사용
-- Phaser 씬에서 픽셀로 변환 (예: worldSize=1920 → 19.2배)
CREATE TABLE IF NOT EXISTS metaverse_world_plots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_code text UNIQUE NOT NULL,  -- 안정된 참조 키 (예: 'london-01')
  plaza_name text NOT NULL,
  pin_x numeric NOT NULL CHECK (pin_x BETWEEN 0 AND 100),
  pin_y numeric NOT NULL CHECK (pin_y BETWEEN 0 AND 100),
  width_units int NOT NULL DEFAULT 6,   -- 타일 6x6 = 96px
  height_units int NOT NULL DEFAULT 6,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metaverse_plots_plaza
  ON metaverse_world_plots(plaza_name) WHERE is_active = true;

-- 4. 유저 생성 채팅방 (1 Plot = 1 Active Room)
CREATE TABLE IF NOT EXISTS metaverse_chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id uuid NOT NULL REFERENCES metaverse_world_plots(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL,
  sign_text varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL
);

-- 한 Plot에 열린 방은 최대 1개 (closed_at IS NULL인 것만)
CREATE UNIQUE INDEX IF NOT EXISTS uq_metaverse_chat_rooms_active_plot
  ON metaverse_chat_rooms(plot_id) WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_metaverse_chat_rooms_cleanup
  ON metaverse_chat_rooms(last_activity_at) WHERE closed_at IS NULL;

-- ============================================================
-- RPC: metaverse_award_flair_karma
-- 유저에게 팀 카르마를 delta만큼 적립.
-- stadium_contributions (팀별), team_stadiums (팀 전체), spendable balance 모두 증가.
-- ============================================================
CREATE OR REPLACE FUNCTION metaverse_award_flair_karma(
  p_user_id text,
  p_team_id text,
  p_delta int,
  p_source text DEFAULT 'unknown'  -- 'post' | 'comment' | 'prediction_hit' | 'bonus'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_team_total bigint;
  v_new_level int;
  v_new_balance int;
BEGIN
  IF p_delta <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'delta must be positive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = p_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'invalid team_id');
  END IF;

  -- 1. stadium_contributions +delta (카르마 breakdown)
  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
    VALUES (p_user_id, p_team_id, p_delta, now())
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET points_contributed = stadium_contributions.points_contributed + p_delta,
          last_synced_at = now();

  -- 2. team_stadiums.total_points +delta + 레벨 재계산
  UPDATE team_stadiums
    SET total_points = total_points + p_delta, updated_at = now()
    WHERE team_id = p_team_id
    RETURNING total_points INTO v_new_team_total;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM stadium_level_thresholds
    WHERE required_points <= COALESCE(v_new_team_total, 0);

  UPDATE team_stadiums
    SET level = v_new_level
    WHERE team_id = p_team_id AND level < v_new_level;

  -- 3. spendable balance + lifetime (팀 무관 통합)
  INSERT INTO metaverse_user_activity_balance (user_id, spendable_points, lifetime_earned)
    VALUES (p_user_id, p_delta, p_delta)
    ON CONFLICT (user_id) DO UPDATE
      SET spendable_points = metaverse_user_activity_balance.spendable_points + p_delta,
          lifetime_earned = metaverse_user_activity_balance.lifetime_earned + p_delta,
          updated_at = now()
    RETURNING spendable_points INTO v_new_balance;

  RETURN jsonb_build_object(
    'success', true,
    'delta', p_delta,
    'team_total', v_new_team_total,
    'team_level', v_new_level,
    'new_balance', v_new_balance,
    'source', p_source
  );
END;
$$;

-- ============================================================
-- RPC: metaverse_spend_activity_points
-- 채팅방 개설 등 spendable 소모 시 호출. 잔액 부족하면 실패.
-- ============================================================
CREATE OR REPLACE FUNCTION metaverse_spend_activity_points(
  p_user_id text,
  p_amount int,
  p_purpose text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance int;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'amount must be positive');
  END IF;

  UPDATE metaverse_user_activity_balance
    SET spendable_points = spendable_points - p_amount, updated_at = now()
    WHERE user_id = p_user_id AND spendable_points >= p_amount
    RETURNING spendable_points INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'insufficient balance');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deducted', p_amount,
    'new_balance', v_new_balance,
    'purpose', p_purpose
  );
END;
$$;

-- ============================================================
-- RPC: metaverse_cleanup_empty_chat_rooms
-- 크론: 참여자 0명 + last_activity 2시간 경과 방을 close.
-- Presence 기반 "0명" 체크는 서버에서 못 하므로 last_activity_at만 기준으로 함.
-- ============================================================
CREATE OR REPLACE FUNCTION metaverse_cleanup_empty_chat_rooms()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed int;
BEGIN
  UPDATE metaverse_chat_rooms
    SET closed_at = now()
    WHERE closed_at IS NULL
      AND last_activity_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_closed = ROW_COUNT;
  RETURN v_closed;
END;
$$;

-- ============================================================
-- 시드: 광장 Plot 25개
-- 좌표는 team_map_pins 기준 (런던 ~52,70 / 맨체스터 ~42,42 / 리버풀 ~38,46 / 뉴캐슬 ~52,30)
-- ============================================================
INSERT INTO metaverse_world_plots (plot_code, plaza_name, pin_x, pin_y) VALUES
  -- 런던 중앙 광장 (Wembley 앞) × 10
  ('london-01', '런던 광장', 48, 67),
  ('london-02', '런던 광장', 50, 67),
  ('london-03', '런던 광장', 52, 67),
  ('london-04', '런던 광장', 54, 67),
  ('london-05', '런던 광장', 48, 70),
  ('london-06', '런던 광장', 50, 70),
  ('london-07', '런던 광장', 54, 70),
  ('london-08', '런던 광장', 48, 73),
  ('london-09', '런던 광장', 50, 73),
  ('london-10', '런던 광장', 52, 73),
  -- 맨체스터 광장 × 6
  ('manchester-01', '맨체스터 광장', 39, 41),
  ('manchester-02', '맨체스터 광장', 41, 41),
  ('manchester-03', '맨체스터 광장', 43, 41),
  ('manchester-04', '맨체스터 광장', 39, 44),
  ('manchester-05', '맨체스터 광장', 41, 44),
  ('manchester-06', '맨체스터 광장', 43, 44),
  -- 리버풀 광장 × 5
  ('liverpool-01', '리버풀 광장', 36, 45),
  ('liverpool-02', '리버풀 광장', 38, 45),
  ('liverpool-03', '리버풀 광장', 40, 45),
  ('liverpool-04', '리버풀 광장', 37, 48),
  ('liverpool-05', '리버풀 광장', 39, 48),
  -- 뉴캐슬 광장 × 4
  ('newcastle-01', '뉴캐슬 광장', 50, 29),
  ('newcastle-02', '뉴캐슬 광장', 52, 29),
  ('newcastle-03', '뉴캐슬 광장', 54, 29),
  ('newcastle-04', '뉴캐슬 광장', 52, 32)
ON CONFLICT (plot_code) DO NOTHING;

-- ============================================================
-- RLS
-- 정책: 읽기는 모두 공개. 쓰기는 서버(service role) 또는 본인만.
-- ============================================================
ALTER TABLE metaverse_user_activity_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE metaverse_fandom_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE metaverse_world_plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE metaverse_chat_rooms ENABLE ROW LEVEL SECURITY;

-- 잔액: 본인만 읽기 (남의 포인트 잔액은 비공개)
CREATE POLICY "metaverse_balance_self_read"
  ON metaverse_user_activity_balance FOR SELECT
  USING (user_id = (auth.jwt()->>'sub'));

-- 팬덤: 누구나 읽기 (프로필 배지 노출)
CREATE POLICY "metaverse_fandom_read"
  ON metaverse_fandom_memberships FOR SELECT USING (true);

-- 플롯: 누구나 읽기 (맵 렌더링용)
CREATE POLICY "metaverse_plots_read"
  ON metaverse_world_plots FOR SELECT USING (is_active = true);

-- 채팅방: 누구나 읽기 (간판 렌더링 + 방 목록)
CREATE POLICY "metaverse_rooms_read"
  ON metaverse_chat_rooms FOR SELECT USING (closed_at IS NULL);

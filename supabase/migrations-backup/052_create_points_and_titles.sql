-- =============================================
-- 포인트 & 레벨 & 칭호 & 픽셀아트 시스템
-- =============================================

-- 1) 종목별 유저 포인트 (누적 + 가용)
CREATE TABLE IF NOT EXISTS user_board_points (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  board_slug text NOT NULL,              -- football, baseball, basketball, ...
  total_points integer NOT NULL DEFAULT 0,   -- 누적 (레벨 기준, 절대 안 줄어듦)
  available_points integer NOT NULL DEFAULT 0, -- 가용 (상점 소비 가능)
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, board_slug)
);

CREATE INDEX idx_user_board_points_user ON user_board_points(user_id);
CREATE INDEX idx_user_board_points_board ON user_board_points(board_slug);

-- 2) 포인트 트랜잭션 (적립/차감 내역)
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  board_slug text NOT NULL,
  amount integer NOT NULL,                -- 양수=적립, 음수=차감
  transaction_type text NOT NULL,         -- post, comment, vote_received, prediction_hit, prediction_join, daily_check, streak_bonus, shop_purchase, penalty
  description text,
  related_id text,                        -- 관련 게시글/댓글/예측 ID
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_point_tx_user_board ON point_transactions(user_id, board_slug);
CREATE INDEX idx_point_tx_created ON point_transactions(created_at DESC);

-- 3) 명사 호칭 정의 (레벨별, 게시판별) — 포인트로 구매
CREATE TABLE IF NOT EXISTS noun_titles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  board_slug text NOT NULL,
  required_level integer NOT NULL,
  title text NOT NULL,                    -- 서포터, 감독 등
  price integer NOT NULL DEFAULT 0,       -- 구매 가격 (available_points)
  created_at timestamptz DEFAULT now(),
  UNIQUE(board_slug, required_level)
);

-- 4) 형용사 칭호 정의 (업적으로 획득)
CREATE TABLE IF NOT EXISTS adj_titles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,              -- genius, prophet, etc
  title text NOT NULL,                    -- 천재, 예언자, 똥손의 등
  description text,                       -- 획득 조건 설명
  rarity text NOT NULL DEFAULT 'common',  -- common, rare, epic, legendary
  board_slug text,                        -- null이면 전체 게시판 공통
  created_at timestamptz DEFAULT now()
);

-- 5) 유저가 획득한 형용사 칭호
CREATE TABLE IF NOT EXISTS user_adj_titles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  adj_title_id uuid NOT NULL REFERENCES adj_titles(id) ON DELETE CASCADE,
  board_slug text,                        -- 어느 게시판에서 획득했는지
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, adj_title_id)
);

CREATE INDEX idx_user_adj_titles_user ON user_adj_titles(user_id);

-- 6) 유저가 구매한 명사 호칭
CREATE TABLE IF NOT EXISTS user_noun_titles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  noun_title_id uuid NOT NULL REFERENCES noun_titles(id) ON DELETE CASCADE,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, noun_title_id)
);

CREATE INDEX idx_user_noun_titles_user ON user_noun_titles(user_id);

-- 7) 유저의 현재 장착 칭호 (게시판별)
CREATE TABLE IF NOT EXISTS user_equipped_titles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  board_slug text NOT NULL,
  adj_title_id uuid REFERENCES adj_titles(id) ON DELETE SET NULL,   -- 형용사 (null이면 미장착)
  noun_title_id uuid REFERENCES noun_titles(id) ON DELETE SET NULL, -- 명사 (null이면 미장착)
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, board_slug)
);

-- 8) 픽셀아트 아이템 정의
CREATE TABLE IF NOT EXISTS pixel_art_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,              -- messi, ronaldo, faker, ...
  name text NOT NULL,                     -- 메시, 호날두, 페이커
  image_url text NOT NULL,                -- /pixel-art/messi.png
  category text NOT NULL,                 -- football, baseball, game, ...
  price integer NOT NULL,                 -- 가용 포인트 가격
  board_slug text,                        -- 특정 게시판 포인트로만 구매 가능 (null이면 아무 게시판)
  is_limited boolean DEFAULT false,       -- 한정판 여부
  is_active boolean DEFAULT true,         -- 판매중 여부
  created_at timestamptz DEFAULT now()
);

-- 9) 유저 보유 픽셀아트
CREATE TABLE IF NOT EXISTS user_pixel_arts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  pixel_art_id uuid NOT NULL REFERENCES pixel_art_items(id) ON DELETE CASCADE,
  purchased_at timestamptz DEFAULT now(),
  UNIQUE(user_id, pixel_art_id)
);

CREATE INDEX idx_user_pixel_arts_user ON user_pixel_arts(user_id);

-- 10) 유저의 장착 중인 픽셀아트 (프로필 표시용)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS equipped_pixel_art_id uuid REFERENCES pixel_art_items(id) ON DELETE SET NULL;

-- 11) 일일 포인트 획득 추적 (어뷰징 방지)
CREATE TABLE IF NOT EXISTS daily_point_caps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  board_slug text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  earned_today integer NOT NULL DEFAULT 0,  -- 오늘 획득한 포인트
  UNIQUE(user_id, board_slug, date)
);

-- =============================================
-- 초기 데이터: 명사 호칭 (종목별) — price 포함
-- Lv1=무료, Lv2=30, Lv3=100, Lv4=250, Lv5=500,
-- Lv6=1000, Lv7=2000, Lv8=3500, Lv9=6000, Lv10=10000
-- =============================================

-- 축구
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('football', 1, '신입 팬', 0),
  ('football', 2, '관중석', 30),
  ('football', 3, '서포터', 100),
  ('football', 4, '울트라스', 250),
  ('football', 5, '12번째 선수', 500),
  ('football', 6, '주장완장', 1000),
  ('football', 7, '레전드', 2000),
  ('football', 8, '감독', 3500),
  ('football', 9, '구단주', 6000),
  ('football', 10, '전설의 팬', 10000);

-- 야구
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('baseball', 1, '신입 팬', 0),
  ('baseball', 2, '외야석', 30),
  ('baseball', 3, '응원단', 100),
  ('baseball', 4, '치어리더', 250),
  ('baseball', 5, '9번 타자', 500),
  ('baseball', 6, '4번 타자', 1000),
  ('baseball', 7, '명예의 전당', 2000),
  ('baseball', 8, '감독', 3500),
  ('baseball', 9, '구단주', 6000),
  ('baseball', 10, '전설의 팬', 10000);

-- 농구
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('basketball', 1, '신입 팬', 0),
  ('basketball', 2, '벤치', 30),
  ('basketball', 3, '식스맨', 100),
  ('basketball', 4, '스타터', 250),
  ('basketball', 5, '올스타', 500),
  ('basketball', 6, 'MVP', 1000),
  ('basketball', 7, '명예의 전당', 2000),
  ('basketball', 8, '감독', 3500),
  ('basketball', 9, '구단주', 6000),
  ('basketball', 10, '전설의 팬', 10000);

-- 배구
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('volleyball', 1, '신입 팬', 0),
  ('volleyball', 2, '관중석', 30),
  ('volleyball', 3, '리베로', 100),
  ('volleyball', 4, '세터', 250),
  ('volleyball', 5, '에이스', 500),
  ('volleyball', 6, '주장', 1000),
  ('volleyball', 7, '레전드', 2000),
  ('volleyball', 8, '감독', 3500),
  ('volleyball', 9, '구단주', 6000),
  ('volleyball', 10, '전설의 팬', 10000);

-- 게임
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('game', 1, '뉴비', 0),
  ('game', 2, '브론즈', 30),
  ('game', 3, '실버', 100),
  ('game', 4, '골드', 250),
  ('game', 5, '플래티넘', 500),
  ('game', 6, '다이아', 1000),
  ('game', 7, '마스터', 2000),
  ('game', 8, '그랜드마스터', 3500),
  ('game', 9, '챌린저', 6000),
  ('game', 10, '전설의 게이머', 10000);

-- 영화
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('movies', 1, '신입 관객', 0),
  ('movies', 2, '관객', 30),
  ('movies', 3, '영화 덕후', 100),
  ('movies', 4, '평론가', 250),
  ('movies', 5, '시네필', 500),
  ('movies', 6, '칼럼니스트', 1000),
  ('movies', 7, '거장', 2000),
  ('movies', 8, '감독', 3500),
  ('movies', 9, '프로듀서', 6000),
  ('movies', 10, '전설의 시네필', 10000);

-- 음악
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('music', 1, '신입 리스너', 0),
  ('music', 2, '리스너', 30),
  ('music', 3, '음악 덕후', 100),
  ('music', 4, 'DJ', 250),
  ('music', 5, '프로듀서', 500),
  ('music', 6, '작곡가', 1000),
  ('music', 7, '아티스트', 2000),
  ('music', 8, '거장', 3500),
  ('music', 9, '레전드', 6000),
  ('music', 10, '전설의 뮤지션', 10000);

-- 아이돌
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('idol', 1, '신입 팬', 0),
  ('idol', 2, '라이트팬', 30),
  ('idol', 3, '팬', 100),
  ('idol', 4, '덕후', 250),
  ('idol', 5, '홈마', 500),
  ('idol', 6, '팬사이트', 1000),
  ('idol', 7, '대포님', 2000),
  ('idol', 8, '팬클럽 회장', 3500),
  ('idol', 9, '총공 대장', 6000),
  ('idol', 10, '전설의 덕후', 10000);

-- 애니메이션
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('anime', 1, '신입', 0),
  ('anime', 2, '입문자', 30),
  ('anime', 3, '덕후', 100),
  ('anime', 4, '오타쿠', 250),
  ('anime', 5, '위브', 500),
  ('anime', 6, '만화가', 1000),
  ('anime', 7, '성우', 2000),
  ('anime', 8, '감독', 3500),
  ('anime', 9, '거장', 6000),
  ('anime', 10, '전설의 오타쿠', 10000);

-- 자유게시판
INSERT INTO noun_titles (board_slug, required_level, title, price) VALUES
  ('free-board', 1, '신입', 0),
  ('free-board', 2, '주민', 30),
  ('free-board', 3, '단골', 100),
  ('free-board', 4, '터줏대감', 250),
  ('free-board', 5, '동네 형', 500),
  ('free-board', 6, '이장님', 1000),
  ('free-board', 7, '촌장', 2000),
  ('free-board', 8, '시장', 3500),
  ('free-board', 9, '도지사', 6000),
  ('free-board', 10, '대통령', 10000);

-- =============================================
-- 초기 데이터: 형용사 칭호
-- =============================================

INSERT INTO adj_titles (slug, title, description, rarity, board_slug) VALUES
  -- 공통
  ('newcomer', '새내기', '첫 글 작성', 'common', NULL),
  ('chatterbox', '수다쟁이', '댓글 100개 작성', 'common', NULL),
  ('popular', '인기쟁이', '좋아요 100개 받기', 'rare', NULL),
  ('streak-7', '꾸준한', '7일 연속 출석', 'common', NULL),
  ('streak-30', '성실한', '30일 연속 출석', 'rare', NULL),
  ('streak-100', '철인의', '100일 연속 출석', 'epic', NULL),
  ('streak-365', '전설의', '365일 연속 출석', 'legendary', NULL),

  -- 스포츠
  ('knows-football', '축잘알', '축구 게시판 Lv.5 달성', 'epic', 'football'),
  ('prophet', '예언자', '승부예측 10연속 적중', 'legendary', NULL),
  ('butterfingers', '똥손의', '승부예측 10연속 실패', 'common', NULL),
  ('genius', '천재', '승부예측 정확도 80% 이상 (최소 50회)', 'epic', NULL),
  ('passionate', '열정적인', '한 게시판에 글 50개 작성', 'rare', NULL),
  ('accident', '덕통사고', '3개 이상 게시판에서 Lv.3 달성', 'rare', NULL),
  ('allrounder', '올라운더', '5개 이상 게시판에서 Lv.3 달성', 'epic', NULL),
  ('emotional', '감성적인', '영화 게시판 Lv.5 달성', 'rare', 'movies');

-- =============================================
-- RLS 정책
-- =============================================

ALTER TABLE user_board_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE noun_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE adj_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_adj_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_noun_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_equipped_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pixel_art_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_pixel_arts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_point_caps ENABLE ROW LEVEL SECURITY;

-- 읽기: 모두 공개
CREATE POLICY "noun_titles_read" ON noun_titles FOR SELECT USING (true);
CREATE POLICY "adj_titles_read" ON adj_titles FOR SELECT USING (true);
CREATE POLICY "pixel_art_items_read" ON pixel_art_items FOR SELECT USING (true);
CREATE POLICY "user_board_points_read" ON user_board_points FOR SELECT USING (true);
CREATE POLICY "user_adj_titles_read" ON user_adj_titles FOR SELECT USING (true);
CREATE POLICY "user_noun_titles_read" ON user_noun_titles FOR SELECT USING (true);
CREATE POLICY "user_equipped_titles_read" ON user_equipped_titles FOR SELECT USING (true);
CREATE POLICY "user_pixel_arts_read" ON user_pixel_arts FOR SELECT USING (true);

-- 쓰기: 서비스 키로 서버에서 처리하므로 기본 차단
CREATE POLICY "point_tx_read_own" ON point_transactions FOR SELECT
  USING (user_id = (select auth.jwt() ->> 'sub'));
CREATE POLICY "daily_cap_read_own" ON daily_point_caps FOR SELECT
  USING (user_id = (select auth.jwt() ->> 'sub'));

-- =============================================
-- 레벨 계산 함수
-- =============================================

CREATE OR REPLACE FUNCTION get_level_for_points(p_total_points integer)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE
    WHEN p_total_points >= 20000 THEN 10
    WHEN p_total_points >= 10000 THEN 9
    WHEN p_total_points >= 5000 THEN 8
    WHEN p_total_points >= 3000 THEN 7
    WHEN p_total_points >= 1500 THEN 6
    WHEN p_total_points >= 800 THEN 5
    WHEN p_total_points >= 400 THEN 4
    WHEN p_total_points >= 150 THEN 3
    WHEN p_total_points >= 50 THEN 2
    ELSE 1
  END;
END;
$$;

-- =============================================
-- 포인트 적립 RPC
-- =============================================

CREATE OR REPLACE FUNCTION award_points(
  p_user_id text,
  p_board_slug text,
  p_amount integer,
  p_type text,
  p_description text DEFAULT NULL,
  p_related_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_daily_earned integer;
  v_daily_cap constant integer := 100;
  v_actual_amount integer;
  v_new_total integer;
  v_new_available integer;
  v_new_level integer;
BEGIN
  -- 양수(적립)일 때만 일일 상한 체크
  IF p_amount > 0 THEN
    INSERT INTO daily_point_caps (user_id, board_slug, date, earned_today)
    VALUES (p_user_id, p_board_slug, CURRENT_DATE, 0)
    ON CONFLICT (user_id, board_slug, date) DO NOTHING;

    SELECT earned_today INTO v_daily_earned
    FROM daily_point_caps
    WHERE user_id = p_user_id AND board_slug = p_board_slug AND date = CURRENT_DATE;

    IF v_daily_earned >= v_daily_cap THEN
      RETURN jsonb_build_object('success', false, 'reason', 'daily_cap_reached');
    END IF;

    v_actual_amount := LEAST(p_amount, v_daily_cap - v_daily_earned);

    UPDATE daily_point_caps
    SET earned_today = earned_today + v_actual_amount
    WHERE user_id = p_user_id AND board_slug = p_board_slug AND date = CURRENT_DATE;
  ELSE
    v_actual_amount := p_amount;  -- 차감은 그대로
  END IF;

  -- 포인트 upsert
  INSERT INTO user_board_points (user_id, board_slug, total_points, available_points, level, updated_at)
  VALUES (
    p_user_id, p_board_slug,
    GREATEST(0, v_actual_amount),
    v_actual_amount,
    1,
    now()
  )
  ON CONFLICT (user_id, board_slug) DO UPDATE SET
    total_points = CASE
      WHEN v_actual_amount > 0
      THEN user_board_points.total_points + v_actual_amount
      ELSE user_board_points.total_points  -- 차감은 누적 포인트에 영향 없음
    END,
    available_points = GREATEST(0, user_board_points.available_points + v_actual_amount),
    updated_at = now()
  RETURNING total_points, available_points INTO v_new_total, v_new_available;

  -- 레벨 재계산
  v_new_level := get_level_for_points(v_new_total);
  UPDATE user_board_points
  SET level = v_new_level
  WHERE user_id = p_user_id AND board_slug = p_board_slug;

  -- 트랜잭션 기록
  INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
  VALUES (p_user_id, p_board_slug, v_actual_amount, p_type, p_description, p_related_id);

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_actual_amount,
    'total_points', v_new_total,
    'available_points', v_new_available,
    'level', v_new_level
  );
END;
$$;

-- =============================================
-- 명사 칭호 구매 RPC
-- =============================================

CREATE OR REPLACE FUNCTION purchase_noun_title(
  p_user_id text,
  p_noun_title_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title noun_titles%ROWTYPE;
  v_user_points user_board_points%ROWTYPE;
  v_already_owned boolean;
BEGIN
  -- 칭호 정보 조회
  SELECT * INTO v_title FROM noun_titles WHERE id = p_noun_title_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'title_not_found');
  END IF;

  -- 이미 보유 여부
  SELECT EXISTS(
    SELECT 1 FROM user_noun_titles WHERE user_id = p_user_id AND noun_title_id = p_noun_title_id
  ) INTO v_already_owned;
  IF v_already_owned THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_owned');
  END IF;

  -- 유저 포인트/레벨 조회
  SELECT * INTO v_user_points
  FROM user_board_points
  WHERE user_id = p_user_id AND board_slug = v_title.board_slug;

  -- 레벨 체크
  IF v_user_points.level IS NULL OR v_user_points.level < v_title.required_level THEN
    RETURN jsonb_build_object('success', false, 'reason', 'level_too_low',
      'required', v_title.required_level, 'current', COALESCE(v_user_points.level, 1));
  END IF;

  -- 가격 체크 (무료가 아닌 경우)
  IF v_title.price > 0 THEN
    IF v_user_points.available_points IS NULL OR v_user_points.available_points < v_title.price THEN
      RETURN jsonb_build_object('success', false, 'reason', 'insufficient_points',
        'required', v_title.price, 'current', COALESCE(v_user_points.available_points, 0));
    END IF;

    -- 포인트 차감
    UPDATE user_board_points
    SET available_points = available_points - v_title.price, updated_at = now()
    WHERE user_id = p_user_id AND board_slug = v_title.board_slug;

    -- 트랜잭션 기록
    INSERT INTO point_transactions (user_id, board_slug, amount, transaction_type, description, related_id)
    VALUES (p_user_id, v_title.board_slug, -v_title.price, 'shop_purchase', '명사 칭호 구매: ' || v_title.title, p_noun_title_id::text);
  END IF;

  -- 구매 기록
  INSERT INTO user_noun_titles (user_id, noun_title_id)
  VALUES (p_user_id, p_noun_title_id);

  RETURN jsonb_build_object('success', true, 'title', v_title.title, 'spent', v_title.price);
END;
$$;

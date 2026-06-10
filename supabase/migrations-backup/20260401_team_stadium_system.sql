-- ============================================================
-- 팀 경기장 건설 시스템
-- MVP: EPL 전용 — 웸블리만 완성(Lv.10), 나머지는 부지(Lv.1)
-- ============================================================

-- 1. 팀 마스터 데이터 (지도 핀 위치 포함)
CREATE TABLE IF NOT EXISTS team_map_pins (
  team_id text PRIMARY KEY,
  team_name text NOT NULL,
  team_short_name text NOT NULL,
  sport text NOT NULL CHECK (sport IN ('football', 'baseball', 'basketball', 'volleyball')),
  league_id text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'GB',
  pin_x numeric NOT NULL CHECK (pin_x BETWEEN 0 AND 100),
  pin_y numeric NOT NULL CHECK (pin_y BETWEEN 0 AND 100),
  color text,
  stadium_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 팀별 경기장 (1:1)
CREATE TABLE IF NOT EXISTS team_stadiums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text NOT NULL UNIQUE REFERENCES team_map_pins(team_id) ON DELETE CASCADE,
  level int NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  total_points bigint NOT NULL DEFAULT 0,
  fan_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_stadiums_team ON team_stadiums(team_id);

-- 3. 유저별 기여 기록
CREATE TABLE IF NOT EXISTS stadium_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  team_id text NOT NULL REFERENCES team_map_pins(team_id) ON DELETE CASCADE,
  points_contributed bigint NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_stadium_contributions_team ON stadium_contributions(team_id);
CREATE INDEX IF NOT EXISTS idx_stadium_contributions_user ON stadium_contributions(user_id);

-- 4. 레벨 요구 점수 설정
CREATE TABLE IF NOT EXISTS stadium_level_thresholds (
  level int PRIMARY KEY CHECK (level BETWEEN 1 AND 10),
  required_points bigint NOT NULL,
  name_ko text NOT NULL,
  name_en text NOT NULL,
  description text,
  unlocked_features jsonb NOT NULL DEFAULT '{}'
);

INSERT INTO stadium_level_thresholds (level, required_points, name_ko, name_en, description, unlocked_features) VALUES
  (1,  0,        '빈 땅',             'Empty lot',           '아무것도 없는 빈 땅',                    '{}'),
  (2,  1000,     '공터',              'Open field',          '잔디가 깔린 공터',                       '{}'),
  (3,  5000,     '동네 운동장',        'Neighborhood field',  '동네 아이들이 뛰어노는 운동장',           '{}'),
  (4,  15000,    '소규모 구장',        'Small stadium',       '벤치와 그물이 있는 소규모 구장',          '{}'),
  (5,  40000,    '지역 경기장',        'Regional stadium',    '관중석이 생긴 지역 경기장',              '{"extra_seats": 5}'),
  (6,  100000,   '프로 구장',          'Pro stadium',         '전광판이 달린 프로 구장',                '{"extra_seats": 10}'),
  (7,  250000,   '대형 경기장',        'Large stadium',       '대형 스크린과 조명이 있는 경기장',        '{"effects": true}'),
  (8,  500000,   '국가대표 경기장',    'National stadium',    '국가대표급 시설의 경기장',                '{"effects": true, "extra_seats": 15}'),
  (9,  1000000,  '명문 구장',          'Prestigious stadium', '역사와 전통의 명문 구장',                '{"effects": true, "extra_seats": 20}'),
  (10, 2500000,  '월드클래스 스타디움', 'World-class stadium', '세계 최고 수준의 경기장',                '{"effects": true, "extra_seats": 30}');

-- ============================================================
-- RPC: sync_stadium_contribution
-- ============================================================
CREATE OR REPLACE FUNCTION sync_stadium_contribution(
  p_user_id text,
  p_team_id text,
  p_new_points bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_points bigint;
  v_delta bigint;
  v_new_total bigint;
  v_new_level int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = p_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', '존재하지 않는 팀입니다.');
  END IF;

  INSERT INTO stadium_contributions (user_id, team_id, points_contributed, last_synced_at)
  VALUES (p_user_id, p_team_id, 0, now())
  ON CONFLICT (user_id, team_id) DO NOTHING;

  SELECT points_contributed INTO v_old_points
  FROM stadium_contributions
  WHERE user_id = p_user_id AND team_id = p_team_id
  FOR UPDATE;

  v_delta := GREATEST(0, p_new_points - COALESCE(v_old_points, 0));

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('success', true, 'delta', 0, 'message', '변화 없음');
  END IF;

  UPDATE stadium_contributions
  SET points_contributed = p_new_points, last_synced_at = now()
  WHERE user_id = p_user_id AND team_id = p_team_id;

  UPDATE team_stadiums
  SET total_points = total_points + v_delta, updated_at = now()
  WHERE team_id = p_team_id
  RETURNING total_points INTO v_new_total;

  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM stadium_level_thresholds
  WHERE required_points <= COALESCE(v_new_total, 0);

  UPDATE team_stadiums
  SET level = v_new_level
  WHERE team_id = p_team_id AND level < v_new_level;

  RETURN jsonb_build_object(
    'success', true,
    'delta', v_delta,
    'new_total', v_new_total,
    'new_level', v_new_level
  );
END;
$$;

-- ============================================================
-- RPC: update_stadium_fan_counts
-- ============================================================
CREATE OR REPLACE FUNCTION update_stadium_fan_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE team_stadiums ts
  SET fan_count = sub.cnt, updated_at = now()
  FROM (
    SELECT team_id, COUNT(DISTINCT user_id) AS cnt
    FROM stadium_contributions
    WHERE points_contributed > 0
    GROUP BY team_id
  ) sub
  WHERE ts.team_id = sub.team_id AND ts.fan_count != sub.cnt;
END;
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE team_map_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_stadiums ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stadium_level_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_map_pins_read" ON team_map_pins FOR SELECT USING (true);
CREATE POLICY "team_stadiums_read" ON team_stadiums FOR SELECT USING (true);
CREATE POLICY "stadium_contributions_read" ON stadium_contributions FOR SELECT USING (true);
CREATE POLICY "stadium_level_thresholds_read" ON stadium_level_thresholds FOR SELECT USING (true);

-- ============================================================
-- 시드 데이터: EPL MVP
-- 웸블리(잉글랜드 국가대표) = Lv.10 완성
-- 나머지 10개 팀 = Lv.1 부지
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color, stadium_name) VALUES
  ('epl_wembley',    '잉글랜드',            'England',   'football', 'epl', 'London',     'GB', 52, 70, '#FFFFFF', 'Wembley Stadium'),
  ('epl_manutd',     '맨체스터 유나이티드', '맨유',      'football', 'epl', 'Manchester', 'GB', 42, 42, '#DA291C', 'Old Trafford'),
  ('epl_mancity',    '맨체스터 시티',       '맨시티',    'football', 'epl', 'Manchester', 'GB', 40, 44, '#6CABDD', 'Etihad Stadium'),
  ('epl_liverpool',  '리버풀',              '리버풀',    'football', 'epl', 'Liverpool',  'GB', 38, 46, '#C8102E', 'Anfield'),
  ('epl_arsenal',    '아스날',              '아스날',    'football', 'epl', 'London',     'GB', 55, 72, '#EF0107', 'Emirates Stadium'),
  ('epl_chelsea',    '첼시',               '첼시',      'football', 'epl', 'London',     'GB', 53, 74, '#034694', 'Stamford Bridge'),
  ('epl_tottenham',  '토트넘 홋스퍼',       '토트넘',    'football', 'epl', 'London',     'GB', 57, 71, '#132257', 'Tottenham Hotspur Stadium'),
  ('epl_newcastle',  '뉴캐슬 유나이티드',   '뉴캐슬',    'football', 'epl', 'Newcastle',  'GB', 48, 28, '#241F20', 'St James'' Park'),
  ('epl_astonvilla', '아스톤 빌라',         '아스톤빌라', 'football', 'epl', 'Birmingham', 'GB', 46, 56, '#670E36', 'Villa Park'),
  ('epl_brighton',   '브라이턴',            '브라이턴',   'football', 'epl', 'Brighton',   'GB', 54, 80, '#0057B8', 'Amex Stadium'),
  ('epl_westham',    '웨스트햄',            '웨스트햄',   'football', 'epl', 'London',     'GB', 58, 73, '#7A263A', 'London Stadium');

-- 경기장 생성: 웸블리만 Lv.10, 나머지 Lv.1
INSERT INTO team_stadiums (team_id, level, total_points, fan_count) VALUES
  ('epl_wembley', 10, 2500000, 0);

INSERT INTO team_stadiums (team_id, level, total_points, fan_count)
SELECT team_id, 1, 0, 0 FROM team_map_pins WHERE team_id != 'epl_wembley'
ON CONFLICT (team_id) DO NOTHING;

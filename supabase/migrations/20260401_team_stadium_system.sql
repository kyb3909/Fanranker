-- ============================================================
-- 팀 경기장 건설 시스템
-- 리그별 지도 + 팀 핀 + 경기장 10단계 레벨업 + 라이브 채팅 연동
-- ============================================================

-- 1. 팀 마스터 데이터 (지도 핀 위치 포함)
CREATE TABLE IF NOT EXISTS team_map_pins (
  team_id text PRIMARY KEY,
  team_name text NOT NULL,
  team_short_name text NOT NULL,
  sport text NOT NULL CHECK (sport IN ('football', 'baseball', 'basketball', 'volleyball')),
  league_id text NOT NULL,
  city text NOT NULL,
  country text NOT NULL DEFAULT 'KR',
  pin_x numeric NOT NULL CHECK (pin_x BETWEEN 0 AND 100),
  pin_y numeric NOT NULL CHECK (pin_y BETWEEN 0 AND 100),
  color text,
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
-- RPC: sync_stadium_contribution — 활동 점수 기여 동기화 (atomic)
-- delta 기반 (고수위 차이만 반영, 멱등성 보장)
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
  -- 팀 존재 확인
  IF NOT EXISTS (SELECT 1 FROM team_map_pins WHERE team_id = p_team_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error_message', '존재하지 않는 팀입니다.');
  END IF;

  -- 기여 레코드 upsert
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

  -- 기여 업데이트
  UPDATE stadium_contributions
  SET points_contributed = p_new_points, last_synced_at = now()
  WHERE user_id = p_user_id AND team_id = p_team_id;

  -- 경기장 total_points 증가
  UPDATE team_stadiums
  SET total_points = total_points + v_delta, updated_at = now()
  WHERE team_id = p_team_id
  RETURNING total_points INTO v_new_total;

  -- 레벨 재계산
  SELECT COALESCE(MAX(level), 1) INTO v_new_level
  FROM stadium_level_thresholds
  WHERE required_points <= COALESCE(v_new_total, 0);

  -- 레벨 업데이트 (올라가기만 함)
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
-- RPC: update_stadium_fan_counts — 팬 수 일괄 갱신
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
-- RLS 정책
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
-- 시드 데이터: KBO (10팀)
-- 핀 좌표는 한국 지도 이미지 기준 % (추후 보정 필요)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('kbo_samsung',  '삼성 라이온즈',    '삼성',  'baseball', 'kbo', '대구',   'KR', 72, 55, '#074CA1'),
  ('kbo_lg',       'LG 트윈스',       'LG',    'baseball', 'kbo', '서울',   'KR', 36, 24, '#C30452'),
  ('kbo_doosan',   '두산 베어스',      '두산',   'baseball', 'kbo', '서울',   'KR', 38, 26, '#131230'),
  ('kbo_kt',       'KT 위즈',         'KT',    'baseball', 'kbo', '수원',   'KR', 40, 32, '#000000'),
  ('kbo_ssg',      'SSG 랜더스',       'SSG',   'baseball', 'kbo', '인천',   'KR', 31, 27, '#CE0E2D'),
  ('kbo_nc',       'NC 다이노스',      'NC',    'baseball', 'kbo', '창원',   'KR', 66, 68, '#315288'),
  ('kbo_hanwha',   '한화 이글스',      '한화',   'baseball', 'kbo', '대전',   'KR', 48, 42, '#FF6600'),
  ('kbo_lotte',    '롯데 자이언츠',    '롯데',   'baseball', 'kbo', '부산',   'KR', 74, 66, '#002955'),
  ('kbo_kia',      'KIA 타이거즈',     'KIA',   'baseball', 'kbo', '광주',   'KR', 38, 65, '#EA0029'),
  ('kbo_kiwoom',   '키움 히어로즈',    '키움',   'baseball', 'kbo', '서울',   'KR', 34, 25, '#570514');

-- ============================================================
-- 시드 데이터: K리그1 (12팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('kl1_jeonbuk',  '전북 현대 모터스',  '전북',    'football', 'kleague1', '전주',   'KR', 43, 58, '#006B3F'),
  ('kl1_ulsan',    '울산 HD FC',       '울산',    'football', 'kleague1', '울산',   'KR', 78, 60, '#F47920'),
  ('kl1_fcseoul',  'FC서울',           'FC서울',  'football', 'kleague1', '서울',   'KR', 37, 23, '#B20838'),
  ('kl1_suwon',    '수원 FC',          '수원',    'football', 'kleague1', '수원',   'KR', 39, 31, '#00529C'),
  ('kl1_incheon',  '인천 유나이티드',   '인천',    'football', 'kleague1', '인천',   'KR', 30, 26, '#004EA2'),
  ('kl1_daejeon',  '대전 하나 시티즌',  '대전',    'football', 'kleague1', '대전',   'KR', 49, 43, '#8B1A2B'),
  ('kl1_pohang',   '포항 스틸러스',     '포항',    'football', 'kleague1', '포항',   'KR', 82, 50, '#E3263A'),
  ('kl1_jeju',     '제주 유나이티드',   '제주',    'football', 'kleague1', '제주',   'KR', 38, 88, '#F58220'),
  ('kl1_gangwon',  '강원 FC',          '강원',    'football', 'kleague1', '춘천',   'KR', 52, 16, '#E95D0F'),
  ('kl1_gwangju',  '광주 FC',          '광주FC',  'football', 'kleague1', '광주',   'KR', 40, 63, '#FFC72C'),
  ('kl1_daegu',    '대구 FC',          '대구FC',  'football', 'kleague1', '대구',   'KR', 70, 54, '#003DA5'),
  ('kl1_gimcheon',  '김천 상무 FC',    '김천',    'football', 'kleague1', '김천',   'KR', 62, 50, '#1B3C71');

-- ============================================================
-- 시드 데이터: KBL (10팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('kbl_et',       '인천 전자랜드',     '전자랜드',     'basketball', 'kbl', '인천',   'KR', 30, 28, '#D4001C'),
  ('kbl_samsung',  '서울 삼성 썬더스',  '삼성 썬더스',   'basketball', 'kbl', '서울',   'KR', 36, 22, '#074CA1'),
  ('kbl_kcc',      '전주 KCC 이지스',   'KCC',         'basketball', 'kbl', '전주',   'KR', 44, 57, '#1B1B1B'),
  ('kbl_mobis',    '울산 현대모비스',    '현대모비스',    'basketball', 'kbl', '울산',   'KR', 79, 58, '#003DA5'),
  ('kbl_sk',       '서울 SK나이츠',     'SK나이츠',     'basketball', 'kbl', '서울',   'KR', 38, 24, '#CC0033'),
  ('kbl_lg',       '창원 LG세이커스',   'LG세이커스',    'basketball', 'kbl', '창원',   'KR', 67, 67, '#AD1F2D'),
  ('kbl_db',       '원주 DB 프로미',    '원주DB',       'basketball', 'kbl', '원주',   'KR', 52, 22, '#00703C'),
  ('kbl_kgc',      '안양 정관장',       '안양KGC',      'basketball', 'kbl', '안양',   'KR', 36, 29, '#CC0000'),
  ('kbl_sono',     '고양 소노 스카이거너스', '소노',     'basketball', 'kbl', '고양',   'KR', 34, 21, '#1C1C1C'),
  ('kbl_sono2',    '부산 BNK 썸',       'BNK',          'basketball', 'kbl', '부산',   'KR', 75, 65, '#FF6699');

-- ============================================================
-- 시드 데이터: V리그 남자 (7팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('vl_samsung',   '삼성화재 블루팡스',    '삼성화재',    'volleyball', 'kovo_men', '대전',   'KR', 47, 41, '#074CA1'),
  ('vl_korean',    '대한항공 점보스',      '대한항공',    'volleyball', 'kovo_men', '인천',   'KR', 32, 26, '#003A70'),
  ('vl_kb',        'KB손해보험 스타즈',    'KB손보',      'volleyball', 'kovo_men', '의왕',   'KR', 38, 31, '#FFB81C'),
  ('vl_woori',     '우리카드 우리WON',    '우리카드',    'volleyball', 'kovo_men', '서울',   'KR', 36, 24, '#003DA5'),
  ('vl_hyundai',   '현대캐피탈 스카이워커스','현대캐피탈',  'volleyball', 'kovo_men', '천안',   'KR', 45, 38, '#006B3F'),
  ('vl_ok',        'OK금융그룹 읏맨',     'OK금융',      'volleyball', 'kovo_men', '안산',   'KR', 34, 30, '#FF6600'),
  ('vl_pepper',    '한국전력 빅스톰',     '한국전력',    'volleyball', 'kovo_men', '수원',   'KR', 40, 33, '#E3263A');

-- ============================================================
-- 시드 데이터: V리그 여자 (7팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('vlw_hyundai',  '현대건설 힐스테이트',  '현대건설',     'volleyball', 'kovo_women', '수원',   'KR', 41, 32, '#006B3F'),
  ('vlw_heungkuk', '흥국생명 핑크스파이더스','흥국생명',    'volleyball', 'kovo_women', '인천',   'KR', 31, 25, '#E91E8C'),
  ('vlw_gs',       'GS칼텍스 서울KIXX',   'GS칼텍스',    'volleyball', 'kovo_women', '서울',   'KR', 37, 23, '#005EB8'),
  ('vlw_road',     '한국도로공사 하이패스', '도로공사',    'volleyball', 'kovo_women', '김천',   'KR', 63, 49, '#FF8C00'),
  ('vlw_ibk',      'IBK기업은행 알토스',   'IBK기업은행', 'volleyball', 'kovo_women', '화성',   'KR', 39, 34, '#004B87'),
  ('vlw_pepper',   'AI페퍼스',            'AI페퍼스',    'volleyball', 'kovo_women', '광주',   'KR', 39, 64, '#E3263A'),
  ('vlw_hillstate','정관장 레드스파크스',   '정관장',      'volleyball', 'kovo_women', '대전',   'KR', 48, 44, '#CC0000');

-- ============================================================
-- 시드 데이터: EPL (주요 6팀 + 주요 팀들)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('epl_manutd',     '맨체스터 유나이티드', '맨유',     'football', 'epl', 'Manchester', 'GB', 42, 42, '#DA291C'),
  ('epl_mancity',    '맨체스터 시티',      '맨시티',    'football', 'epl', 'Manchester', 'GB', 40, 44, '#6CABDD'),
  ('epl_liverpool',  '리버풀',            '리버풀',    'football', 'epl', 'Liverpool',  'GB', 38, 46, '#C8102E'),
  ('epl_arsenal',    '아스날',            '아스날',    'football', 'epl', 'London',     'GB', 55, 72, '#EF0107'),
  ('epl_chelsea',    '첼시',              '첼시',     'football', 'epl', 'London',     'GB', 53, 74, '#034694'),
  ('epl_tottenham',  '토트넘 홋스퍼',      '토트넘',    'football', 'epl', 'London',     'GB', 57, 71, '#132257'),
  ('epl_newcastle',  '뉴캐슬 유나이티드',  '뉴캐슬',    'football', 'epl', 'Newcastle',  'GB', 48, 28, '#241F20'),
  ('epl_astonvilla', '아스톤 빌라',        '아스톤빌라', 'football', 'epl', 'Birmingham', 'GB', 46, 56, '#670E36'),
  ('epl_brighton',   '브라이턴',           '브라이턴',   'football', 'epl', 'Brighton',   'GB', 54, 80, '#0057B8'),
  ('epl_westham',    '웨스트햄',           '웨스트햄',   'football', 'epl', 'London',     'GB', 58, 73, '#7A263A');

-- ============================================================
-- 시드 데이터: 라리가 (주요 팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('liga_barca',     'FC 바르셀로나',      '바르셀로나',  'football', 'laliga', 'Barcelona',  'ES', 82, 30, '#004D98'),
  ('liga_real',      '레알 마드리드',      '레알',       'football', 'laliga', 'Madrid',     'ES', 50, 48, '#FEBE10'),
  ('liga_atletico',  '아틀레티코 마드리드', '아틀레티코',  'football', 'laliga', 'Madrid',     'ES', 48, 50, '#CB3524'),
  ('liga_sevilla',   '세비야 FC',          '세비야',     'football', 'laliga', 'Seville',    'ES', 35, 72, '#D71920'),
  ('liga_bilbao',    '아틀레틱 빌바오',     '빌바오',     'football', 'laliga', 'Bilbao',     'ES', 42, 15, '#EE2523');

-- ============================================================
-- 시드 데이터: 분데스리가 (주요 팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('buli_bayern',    'FC 바이에른 뮌헨',   '바이에른',   'football', 'bundesliga', 'Munich',    'DE', 68, 82, '#DC052D'),
  ('buli_bvb',       '보루시아 도르트문트', '도르트문트', 'football', 'bundesliga', 'Dortmund',  'DE', 35, 42, '#FDE100'),
  ('buli_leverkusen','바이어 레버쿠젠',    '레버쿠젠',   'football', 'bundesliga', 'Leverkusen','DE', 33, 40, '#E32221'),
  ('buli_leipzig',   'RB 라이프치히',      '라이프치히', 'football', 'bundesliga', 'Leipzig',   'DE', 62, 40, '#DD0741'),
  ('buli_frankfurt', '아인트라흐트 프랑크푸르트', '프랑크푸르트', 'football', 'bundesliga', 'Frankfurt', 'DE', 42, 58, '#E1000F');

-- ============================================================
-- 시드 데이터: 세리에A (주요 팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('seriea_juve',    '유벤투스 FC',        '유벤투스',   'football', 'seriea', 'Turin',     'IT', 30, 22, '#000000'),
  ('seriea_inter',   '인테르 밀란',        '인테르',     'football', 'seriea', 'Milan',     'IT', 38, 20, '#009DDC'),
  ('seriea_acmilan', 'AC 밀란',           'AC밀란',     'football', 'seriea', 'Milan',     'IT', 36, 22, '#FB090B'),
  ('seriea_napoli',  'SSC 나폴리',        '나폴리',     'football', 'seriea', 'Naples',    'IT', 55, 60, '#12A0D7'),
  ('seriea_roma',    'AS 로마',           '로마',       'football', 'seriea', 'Rome',      'IT', 48, 50, '#8E1F2F');

-- ============================================================
-- 시드 데이터: 리그앙 (주요 팀)
-- ============================================================
INSERT INTO team_map_pins (team_id, team_name, team_short_name, sport, league_id, city, country, pin_x, pin_y, color) VALUES
  ('l1_psg',         '파리 생제르맹',      'PSG',       'football', 'ligue1', 'Paris',      'FR', 48, 28, '#004170'),
  ('l1_marseille',   '올림피크 마르세유',   '마르세유',   'football', 'ligue1', 'Marseille',  'FR', 58, 78, '#2FAEE0'),
  ('l1_lyon',        '올림피크 리옹',      '리옹',       'football', 'ligue1', 'Lyon',       'FR', 55, 60, '#004EA2'),
  ('l1_monaco',      'AS 모나코',          '모나코',     'football', 'ligue1', 'Monaco',     'FR', 70, 82, '#E50013'),
  ('l1_lille',       'LOSC 릴',           '릴',         'football', 'ligue1', 'Lille',      'FR', 42, 12, '#E20F18');

-- ============================================================
-- 경기장 자동 생성 (모든 팀에 Lv.1 경기장)
-- ============================================================
INSERT INTO team_stadiums (team_id, level, total_points, fan_count)
SELECT team_id, 1, 0, 0 FROM team_map_pins
ON CONFLICT (team_id) DO NOTHING;

-- ============================================================
-- Migration: 월드컵 이벤트 시스템
-- Date: 2026-05-07
-- Tables: events, event_groups, event_registrations,
--         event_leaderboard_snapshots
-- Alters: prediction_slips ADD COLUMN event_id
--
-- Idempotent — 재실행 안전. Supabase Dashboard SQL Editor 에 통째로 붙여넣고 RUN.
-- ============================================================

-- pgcrypto: gen_random_uuid() 위해. Supabase 는 기본 활성이지만 안전장치.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- 1. events: 이벤트 메타
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  prize_description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  registration_closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','live','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);

-- ─────────────────────────────────────────────
-- 2. event_groups: 그룹 (구너/콥/블루스)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  club_kor text,
  color text NOT NULL,
  motto text,
  source_channel text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, slug)
);
CREATE INDEX IF NOT EXISTS event_groups_event_idx ON event_groups(event_id);

-- ─────────────────────────────────────────────
-- 3. event_registrations: 사용자 등록 (변경 불가)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id text NOT NULL,                   -- Clerk user_id
  group_id uuid NOT NULL REFERENCES event_groups(id),
  traffic_source text,                     -- utm/ref 추적
  registered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)               -- 한 이벤트당 1번만 (변경 불가)
);
CREATE INDEX IF NOT EXISTS event_reg_event_user_idx
  ON event_registrations(event_id, user_id);
CREATE INDEX IF NOT EXISTS event_reg_group_idx
  ON event_registrations(group_id);
CREATE INDEX IF NOT EXISTS event_reg_traffic_idx
  ON event_registrations(event_id, traffic_source);

-- ─────────────────────────────────────────────
-- 4. prediction_slips 확장
--    NULL = 일반 슬립, 값 = 월드컵 이벤트 슬립
--    (leaderboard 집계 분기용)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prediction_slips') THEN
    EXECUTE 'ALTER TABLE prediction_slips ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS prediction_slips_event_idx ON prediction_slips(event_id) WHERE event_id IS NOT NULL';
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. event_leaderboard_snapshots: 일별 스냅샷 (트렌드 카드용)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  group_id uuid NOT NULL REFERENCES event_groups(id),
  captured_at timestamptz NOT NULL DEFAULT now(),
  accuracy numeric(5,2),
  profit_rate numeric(7,2),
  rank_in_group integer,
  total_in_group integer
);
CREATE INDEX IF NOT EXISTS event_lb_snap_user_idx
  ON event_leaderboard_snapshots(event_id, user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS event_lb_snap_group_idx
  ON event_leaderboard_snapshots(group_id, captured_at DESC);

-- ============================================================
-- RLS (Clerk JWT 의 sub claim 으로 user_id 매칭)
-- ============================================================

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- events: 누구나 조회 (open 이상)
DROP POLICY IF EXISTS "events_public_read" ON events;
CREATE POLICY "events_public_read" ON events
  FOR SELECT USING (status IN ('open','live','closed'));

-- event_groups: 누구나 조회
DROP POLICY IF EXISTS "event_groups_public_read" ON event_groups;
CREATE POLICY "event_groups_public_read" ON event_groups
  FOR SELECT USING (true);

-- event_registrations: 본인 것만 조회
DROP POLICY IF EXISTS "event_reg_own_read" ON event_registrations;
CREATE POLICY "event_reg_own_read" ON event_registrations
  FOR SELECT USING (auth.jwt() ->> 'sub' = user_id);

-- event_registrations: 본인 INSERT (UNIQUE 로 1번만 enforce)
DROP POLICY IF EXISTS "event_reg_own_insert" ON event_registrations;
CREATE POLICY "event_reg_own_insert" ON event_registrations
  FOR INSERT WITH CHECK (auth.jwt() ->> 'sub' = user_id);
-- UPDATE/DELETE 정책 없음 → RLS 자동 거부 (변경 불가 enforcement)

-- event_leaderboard_snapshots: 누구나 조회 (랭킹 공개)
DROP POLICY IF EXISTS "event_lb_snap_public_read" ON event_leaderboard_snapshots;
CREATE POLICY "event_lb_snap_public_read" ON event_leaderboard_snapshots
  FOR SELECT USING (true);

-- ============================================================
-- 시드 데이터: FIFA World Cup 2026 + 3 그룹
-- ============================================================

INSERT INTO events
  (slug, name, description, prize_description,
   start_at, end_at, registration_closes_at, status)
VALUES (
  'worldcup-2026',
  'FIFA World Cup 2026 그룹 대결',
  '응원 클럽 그룹에 가입해 월드컵 기간 동안 예측 대결',
  '각 그룹 1위에게 상품 증정',
  '2026-06-11 00:00:00+09',
  '2026-07-19 23:59:59+09',
  '2026-06-11 00:00:00+09',
  'open'
)
ON CONFLICT (slug) DO NOTHING;

WITH ev AS (SELECT id FROM events WHERE slug='worldcup-2026')
INSERT INTO event_groups
  (event_id, slug, name, club_kor, color, motto, source_channel, sort_order)
VALUES
  ((SELECT id FROM ev), 'gooner', 'Gooner', '아스날', '#EF0107',
   'Victoria Concordia Crescit', '아스날 채널', 1),
  ((SELECT id FROM ev), 'kop',    'Kopite', '리버풀', '#C8102E',
   'You''ll Never Walk Alone',   '리버풀 채널', 2),
  ((SELECT id FROM ev), 'blues',  'Blue',   '첼시',   '#034694',
   'Pride of London',            '첼시 채널',   3)
ON CONFLICT (event_id, slug) DO NOTHING;

-- ============================================================
-- 추가 (2026-05-07): events.league_codes
-- 월드컵 경기 식별용 코드 (betman 이 코드 배정하면 admin 에서 입력)
-- 빈 배열 = 코드 미배정 → /worldcup/games 는 안내 모드만 노출
-- ============================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS league_codes text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS betman_games_league_code_idx
  ON betman_games(league_code) WHERE league_code IS NOT NULL;

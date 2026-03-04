-- 038: 멀티플레이어 드래프트 게임 시스템
-- draft_rooms, draft_participants, draft_picks, draft_results

-- 1. 드래프트 방 테이블
CREATE TABLE IF NOT EXISTS draft_rooms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code text NOT NULL UNIQUE,
  game_mode_id text NOT NULL DEFAULT 'epl',
  host_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'drafting', 'completed', 'abandoned')),
  current_pick int NOT NULL DEFAULT 0,
  pick_deadline_at timestamptz,
  snake_order int[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_rooms_code ON draft_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_draft_rooms_status ON draft_rooms(status) WHERE status IN ('waiting', 'drafting');
CREATE INDEX IF NOT EXISTS idx_draft_rooms_host ON draft_rooms(host_user_id);

-- 2. 드래프트 참가자 테이블
CREATE TABLE IF NOT EXISTS draft_participants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  seat_index int NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
  display_name text NOT NULL,
  avatar_url text,
  is_ready boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id),
  UNIQUE (room_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_draft_participants_room ON draft_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_draft_participants_user ON draft_participants(user_id);

-- 3. 드래프트 픽 테이블
CREATE TABLE IF NOT EXISTS draft_picks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  pick_number int NOT NULL,
  seat_index int NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
  player_id text NOT NULL,
  is_auto_pick boolean NOT NULL DEFAULT false,
  picked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, pick_number),
  UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_room ON draft_picks(room_id, pick_number);

-- 4. 드래프트 결과 테이블
CREATE TABLE IF NOT EXISTS draft_results (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id bigint NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  seat_index int NOT NULL CHECK (seat_index BETWEEN 0 AND 3),
  total_cost numeric(6,1) NOT NULL DEFAULT 0,
  player_ids text[] NOT NULL DEFAULT '{}',
  gold_rewarded int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_results_user ON draft_results(user_id);

-- RLS 활성화
ALTER TABLE draft_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_results ENABLE ROW LEVEL SECURITY;

-- RLS 정책: SELECT는 모두 허용 (실시간 게임이므로)
CREATE POLICY "Anyone can view draft rooms" ON draft_rooms FOR SELECT USING (true);
CREATE POLICY "Anyone can view draft participants" ON draft_participants FOR SELECT USING (true);
CREATE POLICY "Anyone can view draft picks" ON draft_picks FOR SELECT USING (true);
CREATE POLICY "Anyone can view draft results" ON draft_results FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE는 service role만 (API 라우트에서 처리)

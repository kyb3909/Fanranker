-- =============================================
-- 라이브 채팅방 (경기 중 실시간 채팅)
-- 메시지는 DB 저장 없이 Supabase Realtime Broadcast 사용
-- =============================================

CREATE TABLE IF NOT EXISTS live_rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid REFERENCES betman_games(id) ON DELETE SET NULL,
  name text NOT NULL,                          -- "토트넘 vs 아스널"
  sport text NOT NULL DEFAULT 'football',      -- football, baseball, basketball, volleyball
  status text NOT NULL DEFAULT 'waiting',      -- waiting, live, ended, closed
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_live_rooms_status ON live_rooms(status);
CREATE INDEX idx_live_rooms_game ON live_rooms(game_id);
CREATE UNIQUE INDEX idx_live_rooms_game_unique ON live_rooms(game_id) WHERE game_id IS NOT NULL;

-- RLS
ALTER TABLE live_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_rooms_read" ON live_rooms FOR SELECT USING (true);

-- Supabase Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE live_rooms;

-- 경기장 건설 투자 기록
-- 재화: 승부예측 수익(net_profit)만 사용. 골드/볼 사용 안 함.
CREATE TABLE IF NOT EXISTS stadium_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  team_id text NOT NULL REFERENCES team_map_pins(team_id) ON DELETE CASCADE,
  points_invested bigint NOT NULL CHECK (points_invested > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stadium_investments_team ON stadium_investments(team_id);
CREATE INDEX IF NOT EXISTS idx_stadium_investments_user ON stadium_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_stadium_investments_time ON stadium_investments(created_at DESC);

-- RLS
ALTER TABLE stadium_investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stadium_investments_read" ON stadium_investments FOR SELECT USING (true);

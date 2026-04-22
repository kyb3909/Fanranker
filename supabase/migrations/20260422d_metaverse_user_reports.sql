-- ============================================================
-- metaverse_user_reports — 메타버스 유저 신고 (뮤트는 로컬 개인, 신고는 서버 기록)
-- ============================================================
-- 관리자가 검토해서 필요 시 해당 유저 정지·경고 조치.
-- 중복 신고 방지 — 같은 reporter→reported 쌍은 1일 1건만.
-- ============================================================

CREATE TABLE IF NOT EXISTS metaverse_user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id text NOT NULL,
  reported_user_id text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 40),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  context_scope text CHECK (context_scope IN ('world', 'room', 'local', 'other')),
  context_room_id uuid REFERENCES metaverse_chat_rooms(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  CHECK (reporter_user_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_metaverse_reports_reported
  ON metaverse_user_reports(reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metaverse_reports_status
  ON metaverse_user_reports(status, created_at DESC) WHERE status = 'open';

-- 중복 신고 방지 (1일 기준) — 같은 쌍이 최근 24시간 내 중복 제출 못 하게
CREATE UNIQUE INDEX IF NOT EXISTS uq_metaverse_reports_pair_daily
  ON metaverse_user_reports(reporter_user_id, reported_user_id, date_trunc('day', created_at));

ALTER TABLE metaverse_user_reports ENABLE ROW LEVEL SECURITY;

-- 본인이 제출한 신고 목록만 읽기 가능
CREATE POLICY "metaverse_reports_self_read"
  ON metaverse_user_reports FOR SELECT
  USING (reporter_user_id = (auth.jwt()->>'sub'));

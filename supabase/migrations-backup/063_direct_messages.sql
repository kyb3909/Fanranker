-- ============================================
-- 063: 쪽지(DM) 시스템
-- ============================================

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  receiver_id text NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  deleted_by_sender boolean DEFAULT false,
  deleted_by_receiver boolean DEFAULT false
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON direct_messages FOR SELECT USING (true);

CREATE POLICY "Users can insert messages"
  ON direct_messages FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own messages"
  ON direct_messages FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_dm_receiver ON direct_messages(receiver_id, created_at DESC) WHERE deleted_by_receiver = false;
CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_id, created_at DESC) WHERE deleted_by_sender = false;
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC
);

SELECT 'direct_messages table created!' as status;

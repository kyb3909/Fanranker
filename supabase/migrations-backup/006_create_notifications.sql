-- ============================================
-- STEP 6: Create notifications table
-- Run this AFTER 005_create_user_follows.sql
-- ============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- user_id: 알림을 받는 사용자 (Clerk user ID)
    user_id text NOT NULL,
    -- type: 알림 종류 ('comment', 'reply', 'new_post_by_followed')
    type text NOT NULL CHECK (type IN ('comment', 'reply', 'new_post_by_followed')),
    -- actor_id: 알림을 발생시킨 사용자 (댓글 단 사람, 글 작성자 등) (Clerk user ID)
    actor_id text NOT NULL,
    -- related_post_id: 관련 글 ID
    related_post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
    -- related_comment_id: 관련 댓글 ID (댓글/답글 알림일 경우)
    related_comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
    -- is_read: 읽음 여부
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_post ON notifications(related_post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment ON notifications(related_comment_id);

-- RLS for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
    ON notifications FOR SELECT
    USING ((auth.jwt()->>'sub') = user_id);

-- System can create notifications (authenticated users)
CREATE POLICY "Authenticated users can create notifications"
    ON notifications FOR INSERT
    WITH CHECK (true); -- RLS에서 추가 검증 필요

-- Users can update their own notifications (read/unread)
CREATE POLICY "Users can update their own notifications"
    ON notifications FOR UPDATE
    USING ((auth.jwt()->>'sub') = user_id)
    WITH CHECK ((auth.jwt()->>'sub') = user_id);

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'notifications table created!' as status;

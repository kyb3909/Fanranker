-- ============================================
-- 016: Add expert_prediction notification type
-- Purpose: Allow notifications when followed experts create new predictions
-- Dependencies: notifications table (006_create_notifications.sql)
-- ============================================

-- ============================================
-- Step 1: Drop existing CHECK constraint
-- ============================================

-- Remove the old CHECK constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- ============================================
-- Step 2: Add new CHECK constraint with expert_prediction type
-- ============================================

-- Add new CHECK constraint that includes 'expert_prediction'
ALTER TABLE notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('comment', 'reply', 'new_post_by_followed', 'expert_prediction'));

-- ============================================
-- Step 3: Add index for expert_prediction notifications (optional, for performance)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_notifications_type_expert ON notifications(type, created_at DESC) 
WHERE type = 'expert_prediction';

-- ============================================
-- Verification
-- ============================================
SELECT 'expert_prediction notification type added successfully!' as status;

-- 039: 정산 결과 알림 타입 추가 + metadata 컬럼
-- settlement_result 타입과 정산 상세 정보를 담을 metadata 컬럼 추가

-- 기존 CHECK 제약 제거
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 새 CHECK 제약 추가 (settlement_result 포함)
ALTER TABLE notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN ('comment', 'reply', 'new_post_by_followed', 'expert_prediction', 'settlement_result'));

-- metadata 컬럼 추가 (정산 결과 상세: match_id, is_correct, points_earned 등)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- settlement_result 알림 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_notifications_settlement
ON notifications (user_id, type) WHERE type = 'settlement_result';

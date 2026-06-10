-- betman_sync_state에 wisetoto 점수 동기화 전용 타임스탬프 추가
ALTER TABLE betman_sync_state
  ADD COLUMN IF NOT EXISTS last_score_sync_at timestamptz DEFAULT '1970-01-01T00:00:00Z';

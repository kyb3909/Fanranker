-- =============================================
-- 라이브 채팅방 상태 자동 동기화 함수
-- betman_games 상태에 따라 live_rooms 상태 업데이트
-- =============================================

CREATE OR REPLACE FUNCTION sync_live_room_status()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- scheduled → waiting: 경기 시작 30분 전
  UPDATE live_rooms lr
  SET status = 'waiting'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'scheduled'
    AND bg.match_time <= now() + interval '30 minutes';

  -- waiting → live: 경기가 시작됨 (in_progress)
  UPDATE live_rooms lr
  SET status = 'live'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'waiting'
    AND bg.status = 'in_progress';

  -- live → ended: 경기가 완료됨 (completed/cancelled)
  UPDATE live_rooms lr
  SET status = 'ended'
  FROM betman_games bg
  WHERE lr.game_id = bg.id
    AND lr.status = 'live'
    AND bg.status IN ('completed', 'cancelled');

  -- ended → closed: 경기 종료 후 30분 경과
  UPDATE live_rooms
  SET status = 'closed', closed_at = now()
  WHERE status = 'ended'
    AND game_id IN (
      SELECT bg.id FROM betman_games bg
      WHERE bg.status IN ('completed', 'cancelled')
        AND bg.updated_at < now() - interval '30 minutes'
    );

  -- 게임 없이 생성된 방: 24시간 후 자동 닫힘
  UPDATE live_rooms
  SET status = 'closed', closed_at = now()
  WHERE game_id IS NULL
    AND status NOT IN ('closed')
    AND created_at < now() - interval '24 hours';
END;
$$;

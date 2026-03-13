-- 059: MBTI 통계 시스템
-- profiles에 mbti 컬럼 추가 + 월드컵 MBTI 투표 통계 테이블

-- 1. profiles에 mbti 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mbti varchar(4);

-- 유효한 MBTI 값만 허용
ALTER TABLE profiles ADD CONSTRAINT profiles_mbti_check
  CHECK (mbti IS NULL OR mbti IN (
    'INTJ','INTP','ENTJ','ENTP',
    'INFJ','INFP','ENFJ','ENFP',
    'ISTJ','ISFJ','ESTJ','ESFJ',
    'ISTP','ISFP','ESTP','ESFP'
  ));

-- 2. 월드컵 MBTI별 투표 통계 (집계 캐시)
CREATE TABLE IF NOT EXISTS worldcup_mbti_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES worldcup_candidates(id) ON DELETE CASCADE,
  mbti varchar(4) NOT NULL,
  vote_count int NOT NULL DEFAULT 0,
  win_count int NOT NULL DEFAULT 0,
  UNIQUE (battle_id, candidate_id, mbti)
);

CREATE INDEX IF NOT EXISTS idx_worldcup_mbti_stats_battle
  ON worldcup_mbti_stats(battle_id);

-- RLS
ALTER TABLE worldcup_mbti_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view worldcup mbti stats"
  ON worldcup_mbti_stats FOR SELECT
  USING (true);

-- 3. MBTI별 참여자 수 캐시
CREATE TABLE IF NOT EXISTS worldcup_mbti_participants (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  battle_id uuid NOT NULL REFERENCES battle_rooms(id) ON DELETE CASCADE,
  mbti varchar(4) NOT NULL,
  participant_count int NOT NULL DEFAULT 0,
  UNIQUE (battle_id, mbti)
);

ALTER TABLE worldcup_mbti_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view worldcup mbti participants"
  ON worldcup_mbti_participants FOR SELECT
  USING (true);

-- 4. MBTI 투표 기록 RPC (atomic upsert)
CREATE OR REPLACE FUNCTION record_mbti_vote(
  p_battle_id uuid,
  p_candidate_id uuid,
  p_mbti varchar(4),
  p_is_winner boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 투표 수 증가
  INSERT INTO worldcup_mbti_stats (battle_id, candidate_id, mbti, vote_count, win_count)
  VALUES (p_battle_id, p_candidate_id, p_mbti, 1, CASE WHEN p_is_winner THEN 1 ELSE 0 END)
  ON CONFLICT (battle_id, candidate_id, mbti)
  DO UPDATE SET
    vote_count = worldcup_mbti_stats.vote_count + 1,
    win_count = worldcup_mbti_stats.win_count + CASE WHEN p_is_winner THEN 1 ELSE 0 END;
END;
$$;

-- 5. MBTI 참여자 수 기록 RPC
CREATE OR REPLACE FUNCTION record_mbti_participant(
  p_battle_id uuid,
  p_mbti varchar(4)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO worldcup_mbti_participants (battle_id, mbti, participant_count)
  VALUES (p_battle_id, p_mbti, 1)
  ON CONFLICT (battle_id, mbti)
  DO UPDATE SET participant_count = worldcup_mbti_participants.participant_count + 1;
END;
$$;

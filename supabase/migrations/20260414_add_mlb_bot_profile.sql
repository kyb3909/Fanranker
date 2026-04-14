-- MLB 뉴스 에이전트 발행용 봇 계정 추가
-- migration 035에서 user_bot_soccer_kr, user_bot_nba_kr만 있었음. Phase C에서 baseball 커뮤니티 확장
-- 관련 코드: data/agents/scripts/publish-run.js BOT_BY_COMMUNITY.baseball

INSERT INTO profiles (user_id, nickname, avatar_url)
VALUES
  ('user_bot_mlb_kr', '다이아몬드리포트', null)
ON CONFLICT (user_id) DO NOTHING;

SELECT 'mlb bot profile created' as status;

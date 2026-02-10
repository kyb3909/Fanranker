-- Reddit 시드 봇용 프로필 (Clerk 계정 없이 Service Role로 posts 삽입 시 사용)
-- user_id는 고정값으로, 봇이 게시물 작성 시 이 ID를 사용합니다.
INSERT INTO profiles (user_id, nickname, avatar_url)
VALUES ('user_reddit_seed_bot', '레딧 시드봇', null)
ON CONFLICT (user_id) DO NOTHING;

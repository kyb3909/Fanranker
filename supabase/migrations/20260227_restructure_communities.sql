-- 게시판 구조 개편: 10개 게시판으로 재구성
-- 스포츠: football, baseball, basketball, volleyball
-- 라이프: game, movies, music, idol, anime, free-board

-- 1. overseas-football → football 마이그레이션
UPDATE posts SET community_slug = 'football' WHERE community_slug = 'overseas-football';
UPDATE user_community_follows SET community_slug = 'football' WHERE community_slug = 'overseas-football';

-- 2. domestic-football 게시물 삭제 (더미 데이터)
DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE community_slug = 'domestic-football');
DELETE FROM votes WHERE post_id IN (SELECT id FROM posts WHERE community_slug = 'domestic-football');
DELETE FROM posts WHERE community_slug = 'domestic-football';
DELETE FROM user_community_follows WHERE community_slug = 'domestic-football';

-- 3. esports → game 마이그레이션
UPDATE posts SET community_slug = 'game' WHERE community_slug = 'esports';
UPDATE user_community_follows SET community_slug = 'game' WHERE community_slug = 'esports';

-- 4. tips → free-board 마이그레이션
UPDATE posts SET community_slug = 'free-board' WHERE community_slug = 'tips';
UPDATE user_community_follows SET community_slug = 'free-board' WHERE community_slug = 'tips';

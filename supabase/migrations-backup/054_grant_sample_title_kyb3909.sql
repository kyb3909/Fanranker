-- 운영자 직권: kyb3909 (user_38FwA7wLkxVsIgwkH6jTafXOXBE) 에게 샘플 칭호 부여
-- 형용사: 열정적인 (rare) + 명사: 구너 (football 커스텀)

-- 1) 형용사 칭호 "열정적인" 추가
INSERT INTO adj_titles (slug, title, description, rarity, board_slug)
VALUES ('passionate', '열정적인', '운영자 직권 부여', 'rare', 'football')
ON CONFLICT (slug) DO NOTHING;

-- 2) 명사 칭호 "구너" 추가 (football, 커스텀 — 레벨 0 = 특별 칭호)
INSERT INTO noun_titles (board_slug, required_level, title, price)
VALUES ('football', 0, '구너', 0)
ON CONFLICT (board_slug, required_level) DO NOTHING;

-- 3) 유저에게 형용사 칭호 부여
INSERT INTO user_adj_titles (user_id, adj_title_id, board_slug)
SELECT 'user_38FwA7wLkxVsIgwkH6jTafXOXBE', id, 'football'
FROM adj_titles WHERE slug = 'passionate'
ON CONFLICT (user_id, adj_title_id) DO NOTHING;

-- 4) 유저에게 명사 칭호 부여
INSERT INTO user_noun_titles (user_id, noun_title_id)
SELECT 'user_38FwA7wLkxVsIgwkH6jTafXOXBE', id
FROM noun_titles WHERE board_slug = 'football' AND title = '구너'
ON CONFLICT (user_id, noun_title_id) DO NOTHING;

-- 5) football 게시판에 장착
INSERT INTO user_equipped_titles (user_id, board_slug, adj_title_id, noun_title_id)
SELECT
  'user_38FwA7wLkxVsIgwkH6jTafXOXBE',
  'football',
  (SELECT id FROM adj_titles WHERE slug = 'passionate'),
  (SELECT id FROM noun_titles WHERE board_slug = 'football' AND title = '구너')
ON CONFLICT (user_id, board_slug) DO UPDATE SET
  adj_title_id = EXCLUDED.adj_title_id,
  noun_title_id = EXCLUDED.noun_title_id;

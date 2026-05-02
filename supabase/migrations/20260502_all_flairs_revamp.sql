-- ============================================
-- 전 종목 게시판 말머리 개편: 일반 카테고리 → 종목별 친숙한 팀/그룹/장르
-- 기존 flair 모두 is_active=false 로 비활성화 (게시글 flair_id 참조 보존)
-- 새 flair INSERT — 종목별로 한국 유저에 친숙한 단위
-- 자유 게시판(free-board)은 변경 없음
-- ============================================

-- 1. 자유 게시판 외 모든 종목 기존 flair 비활성화
UPDATE post_flairs
SET is_active = false, sort_order = 999
WHERE community_slug IN (
  'football','baseball','basketball','volleyball',
  'game','movies','music','idol','anime'
);

-- 2. 새 flair INSERT
INSERT INTO post_flairs (community_slug, name, color, sort_order, is_active) VALUES
  -- ── 축구 (EPL 빅6 + EPL + 라리가 빅2 + 라리가 + 분데스 + 세리에A 빅3 + 리게앙)
  ('football', '아스날',     '#EF0107', 1,  true),
  ('football', '맨유',       '#DA291C', 2,  true),
  ('football', '맨시티',     '#6CABDD', 3,  true),
  ('football', '리버풀',     '#C8102E', 4,  true),
  ('football', '첼시',       '#034694', 5,  true),
  ('football', '토트넘',     '#132257', 6,  true),
  ('football', 'EPL',        '#37003C', 7,  true),
  ('football', '레알',       '#FEBE10', 8,  true),
  ('football', '바르샤',     '#A50044', 9,  true),
  ('football', '뮌헨',       '#DC052D', 10, true),
  ('football', '분데스리가', '#D20515', 11, true),
  ('football', '세리에A',    '#0072B2', 12, true),
  ('football', 'AC밀란',     '#FB090B', 13, true),
  ('football', '인테르',     '#0068A8', 14, true),
  ('football', '유벤투스',   '#1A1A1A', 15, true),
  ('football', 'PSG',        '#004170', 16, true),
  ('football', '리게앙',     '#091C3E', 17, true),
  ('football', '라리가',     '#EE8707', 18, true),

  -- ── 야구 (KBO 10팀 + KBO + MLB 인기 4 + MLB)
  ('baseball', 'KIA',     '#ED1C24', 1,  true),
  ('baseball', '삼성',    '#074CA1', 2,  true),
  ('baseball', 'LG',      '#C30452', 3,  true),
  ('baseball', '두산',    '#131230', 4,  true),
  ('baseball', 'SSG',     '#CE0E2D', 5,  true),
  ('baseball', '롯데',    '#041E42', 6,  true),
  ('baseball', '한화',    '#FF6600', 7,  true),
  ('baseball', 'NC',      '#315288', 8,  true),
  ('baseball', 'KT',      '#000000', 9,  true),
  ('baseball', '키움',    '#570514', 10, true),
  ('baseball', 'KBO',     '#0F4A8A', 11, true),
  ('baseball', '다저스',  '#005A9C', 12, true),
  ('baseball', '양키스',  '#003087', 13, true),
  ('baseball', '레드삭스','#BD3039', 14, true),
  ('baseball', '컵스',    '#0E3386', 15, true),
  ('baseball', 'MLB',     '#041E42', 16, true),

  -- ── 농구 (NBA 인기 8 + NBA + KBL)
  ('basketball', '레이커스',  '#552583', 1,  true),
  ('basketball', '셀틱스',    '#007A33', 2,  true),
  ('basketball', '워리어스',  '#1D428A', 3,  true),
  ('basketball', '불스',      '#CE1141', 4,  true),
  ('basketball', '히트',      '#98002E', 5,  true),
  ('basketball', '너기츠',    '#0E2240', 6,  true),
  ('basketball', '76ers',     '#006BB6', 7,  true),
  ('basketball', '마버릭스',  '#00538C', 8,  true),
  ('basketball', 'NBA',       '#17408B', 9,  true),
  ('basketball', 'KBL',       '#CE1126', 10, true),

  -- ── 배구 (V리그 + 인기팀 + 국대)
  ('volleyball', 'V리그',         '#1E3A8A', 1, true),
  ('volleyball', '흥국생명',      '#F7931E', 2, true),
  ('volleyball', '현대건설',      '#00B04F', 3, true),
  ('volleyball', 'GS칼텍스',      '#FFCB05', 4, true),
  ('volleyball', '도로공사',      '#003DA5', 5, true),
  ('volleyball', 'IBK기업은행',   '#001E62', 6, true),
  ('volleyball', '페퍼저축',      '#007A47', 7, true),
  ('volleyball', '한국대표팀',    '#C8102E', 8, true),

  -- ── 게임 (한국 인기 게임)
  ('game', 'LoL',          '#C89B3C', 1,  true),
  ('game', '발로란트',     '#FF4655', 2,  true),
  ('game', '배그',         '#F2A900', 3,  true),
  ('game', '오버워치',     '#F99E1A', 4,  true),
  ('game', '메이플',       '#FF8000', 5,  true),
  ('game', '던파',         '#B91D33', 6,  true),
  ('game', '로스트아크',   '#1B6FE8', 7,  true),
  ('game', '스타크래프트', '#00B7C7', 8,  true),
  ('game', '디아블로',     '#B22222', 9,  true),
  ('game', 'FIFA',         '#008542', 10, true),
  ('game', '닌텐도',       '#E60012', 11, true),

  -- ── 영화 (장르별)
  ('movies', '액션',       '#DC143C', 1,  true),
  ('movies', '드라마',     '#4682B4', 2,  true),
  ('movies', '코미디',     '#FFA500', 3,  true),
  ('movies', '로맨스',     '#FF69B4', 4,  true),
  ('movies', '스릴러',     '#2F4F4F', 5,  true),
  ('movies', '호러',       '#4B0082', 6,  true),
  ('movies', 'SF',         '#00CED1', 7,  true),
  ('movies', '판타지',     '#9370DB', 8,  true),
  ('movies', '애니메이션', '#FF1493', 9,  true),
  ('movies', '다큐',       '#708090', 10, true),
  ('movies', '미스터리',   '#483D8B', 11, true),
  ('movies', '가족',       '#32CD32', 12, true),

  -- ── 음악 (장르별)
  ('music', 'K-Pop',   '#FF1493', 1,  true),
  ('music', '힙합',    '#000000', 2,  true),
  ('music', '발라드',  '#4682B4', 3,  true),
  ('music', '록',      '#DC143C', 4,  true),
  ('music', '인디',    '#228B22', 5,  true),
  ('music', 'R&B',     '#800080', 6,  true),
  ('music', 'OST',     '#FFA500', 7,  true),
  ('music', '재즈',    '#8B4513', 8,  true),
  ('music', '클래식',  '#2F4F4F', 9,  true),
  ('music', '콘서트',  '#FF4500', 10, true),

  -- ── 아이돌 (여자 그룹 위주, 4세대~5세대 인기)
  ('idol', '뉴진스',         '#1E1E1E', 1,  true),
  ('idol', '르세라핌',       '#B7BAEC', 2,  true),
  ('idol', '아이브',         '#6B3FA0', 3,  true),
  ('idol', '에스파',         '#FFC72C', 4,  true),
  ('idol', '(여자)아이들',   '#00BFA5', 5,  true),
  ('idol', '아일릿',         '#F8C8DC', 6,  true),
  ('idol', '베이비몬스터',   '#FFD700', 7,  true),
  ('idol', '키스오브라이프', '#FF6B9D', 8,  true),
  ('idol', '미야오',         '#FFB6C1', 9,  true),
  ('idol', '트와이스',       '#FF85B0', 10, true),
  ('idol', '블랙핑크',       '#F38AAB', 11, true),
  ('idol', '레드벨벳',       '#FF0000', 12, true),
  ('idol', 'K-Pop',          '#FF1493', 13, true),

  -- ── 애니
  ('anime', '일본애니',  '#FF1493', 1,  true),
  ('anime', '신작',      '#FFD700', 2,  true),
  ('anime', '추천',      '#32CD32', 3,  true),
  ('anime', '리뷰',      '#4682B4', 4,  true),
  ('anime', '만화',      '#DC143C', 5,  true),
  ('anime', '웹툰',      '#00BFA5', 6,  true),
  ('anime', '캐릭터',    '#FF69B4', 7,  true),
  ('anime', '코스프레',  '#9370DB', 8,  true),
  ('anime', '명대사',    '#FFA500', 9,  true),
  ('anime', '잡담',      '#6B7280', 10, true)

ON CONFLICT (community_slug, name) DO UPDATE
  SET color      = EXCLUDED.color,
      sort_order = EXCLUDED.sort_order,
      is_active  = EXCLUDED.is_active;

SELECT 'all flairs revamped: football 18 / baseball 16 / basketball 10 / volleyball 8 / game 11 / movies 12 (장르) / music 10 (장르) / idol 13 (여자그룹) / anime 10 | free-board 미변경' AS status;

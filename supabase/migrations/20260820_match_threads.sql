-- 불판 (라이브 매치 스레드) — 2026-08-20
-- 라인업 발표 시 매치센터 화이트리스트 경기의 응원 스레드 게시물을 자동 생성한다.
-- posts.match_game_id 가 불판↔경기 양방향 연결의 축:
--   · 글 상세: 값이 있으면 본문 위에 라이브 스코어 스트립 렌더
--   · 매치센터: gameId 로 불판을 찾아 "불판 참여" 링크
alter table posts add column if not exists match_game_id uuid;

-- 경기당 불판 1개 (크론 중복 생성 방지 — 낙관적 생성 후 충돌은 무시)
create unique index if not exists posts_match_game_id_key
  on posts (match_game_id) where match_game_id is not null;

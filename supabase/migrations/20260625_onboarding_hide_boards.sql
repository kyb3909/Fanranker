-- 온보딩 콜드 스타트 방어 (2026-06-25, 유튜버 홍보 전)
--
-- 신규 유입이 빈 게시판 10개를 보면 "죽은 사이트"로 느껴 이탈한다.
-- 글이 쌓인 곳(축구/자유)과 홍보 타겟(캣스날=아스날)만 남기고 나머지 토픽 보드를 숨긴다.
--
-- 게시판 노출은 전부 categories.is_active 로 통제됨:
--   - explore(운동장): is_active=true 필터
--   - /api/categories: is_active=true 필터 → 글쓰기 게시판 선택·사이드바도 자동
-- 따라서 코드 변경 0줄, 이 토글만으로 explore/글쓰기/사이드바에서 동시에 사라진다.
--
-- 트래픽이 늘면 slug 별로 is_active=true 로 하나씩 복원하면 된다.
-- 노출 유지: football(축구), free-board(자유), catsenal(캣스날, football 하위 채널).
-- 기존 글은 그대로 보존(soft hide) — 직접 URL 접근은 가능하나 목록에서만 빠짐.

update categories
set is_active = false
where slug in (
  'baseball',
  'basketball',
  'volleyball',
  'game',
  'anime',
  'movies',
  'music',
  'idol'
);

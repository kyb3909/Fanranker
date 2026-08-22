-- 아스날 팀 게시판 (2026-08-22 운영자: "아스날 게시판 하나 만들고 엠블럼 옆에 실록")
-- worldcup 보드 선례(20260701_worldcup_board.sql) — categories insert 만으로 /community/arsenal
-- 라우트·글쓰기·필터가 DB 기반으로 자동 동작한다. 헤더의 엠블럼·실록 링크만 코드 분기.
-- ⚠️ 캣스날(catsenal)은 아스날 팬 "유튜버" 보드라 별개 — 병존한다.
insert into categories (slug, name, icon, sort_order, is_active, parent_slug, description)
values ('arsenal', '아스날', '🔴', 15, true, 'football', '구너들의 아스날 게시판 — 경기·이적 이야기, 그리고 실록')
on conflict (slug) do nothing;

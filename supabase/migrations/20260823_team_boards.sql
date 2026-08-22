-- 팀 게시판 13개 추가 (2026-08-23 운영자: "첼시·맨시티·맨유·리버풀·토트넘 + 레알·바르셀로나·
-- 아틀레티코·뮌헨·도르트문트·밀란·유벤투스·인테르") — 아스날 보드(20260822b) 패턴 확장.
-- 헤더 커스텀(크레스트·시즌 사가 링크) 재료는 lib/constants/team-boards.ts (creators.ts 와
-- 같은 2파일 패턴). 게시판 노출은 이 categories 행만으로 자동 동작.
insert into categories (slug, name, icon, sort_order, is_active, parent_slug, description) values
  ('chelsea',    '첼시',       '🔵',   11, true, 'football', '첼시 팬 게시판 — 경기·이적 이야기'),
  ('liverpool',  '리버풀',     '🔴',   12, true, 'football', '리버풀 팬 게시판 — 경기·이적 이야기'),
  ('mancity',    '맨시티',     '🩵',   13, true, 'football', '맨시티 팬 게시판 — 경기·이적 이야기'),
  ('manutd',     '맨유',       '😈',   14, true, 'football', '맨유 팬 게시판 — 경기·이적 이야기'),
  ('tottenham',  '토트넘',     '🐓',   15, true, 'football', '토트넘 팬 게시판 — 경기·이적 이야기'),
  ('realmadrid', '레알',       '👑',   16, true, 'football', '레알 마드리드 팬 게시판 — 경기·이적 이야기'),
  ('barcelona',  '바르셀로나', '🔵🔴', 17, true, 'football', '바르셀로나 팬 게시판 — 경기·이적 이야기'),
  ('atletico',   '아틀레티코', '⚪🔴', 18, true, 'football', '아틀레티코 마드리드 팬 게시판 — 경기·이적 이야기'),
  ('bayern',     '뮌헨',       '🔴⚪', 19, true, 'football', '바이에른 뮌헨 팬 게시판 — 경기·이적 이야기'),
  ('dortmund',   '도르트문트', '🟡',   21, true, 'football', '도르트문트 팬 게시판 — 경기·이적 이야기'),
  ('milan',      '밀란',       '⚫🔴', 22, true, 'football', 'AC밀란 팬 게시판 — 경기·이적 이야기'),
  ('juventus',   '유벤투스',   '🦓',   23, true, 'football', '유벤투스 팬 게시판 — 경기·이적 이야기'),
  ('inter',      '인테르',     '🐍',   24, true, 'football', '인테르 팬 게시판 — 경기·이적 이야기')
on conflict (slug) do nothing;

-- 아스날을 팀 보드 묶음 맨 앞으로 (기존 15 → 10)
update categories set sort_order = 10 where slug = 'arsenal';

-- 크리에이터 보드는 팀 보드 뒤로 (20~23 → 40~43. 팀 보드 사이에 끼는 것 방지)
update categories set sort_order = 40 where slug = 'catsenal';
update categories set sort_order = 41 where slug = 'chelookey';
update categories set sort_order = 42 where slug = 'cog';
update categories set sort_order = 43 where slug = 'libig';

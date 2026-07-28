-- editor 역할 신설 — 돈 버튼 없이 콘텐츠 검수만 위임하기 위한 등급.
--
-- 배경: 운영자가 1명인데 AI 검수 큐가 하루 ~47건 유입된다(2026-07-29 기준 대기 174건).
-- EPL 개막(8/21) 유입이 겹치면 물리적으로 혼자 못 버티는데, 지금 위임할 수 있는 건
-- admin 전권뿐이다 — 거기엔 정산·환불·경제조정 버튼이 딸려온다.
--   · moderator 는 이름과 달리 관리자 패널 진입 자체가 불가하고(lib/supabase/admin.ts),
--     실제 쓰임은 게시판 공지 작성 여부 하나뿐이라 재사용하지 않았다.
--   · 대신 editor 를 추가해 "새 작업대(/admin2) + 검수 API" 만 열어준다.
--
-- 권한 경계 (코드: lib/admin/roles.ts)
--   editor 가능  : /admin2 진입, AI 뉴스·커뮤글 검수 발행/반려, 대시보드 조회
--   editor 불가  : 정산·환불·경제조정·권한변경·사용자 관리 등 기존 /admin 전 영역

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'editor'::text, 'moderator'::text, 'user'::text]));

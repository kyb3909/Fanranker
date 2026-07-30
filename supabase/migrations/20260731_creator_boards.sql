-- 시즌 오픈 이벤트 공략 채널 보드 3개 (2026-07-31)
--
-- 캣스날(아스날) 검증 완료에 따라 Cog 라인 채널을 동일 패턴으로 추가:
--   첼루키(첼시) · 리빅=리버풀빅클럽이야(리버풀) · 코그 COG(첼루키×리빅 공동)
-- 코드 측 레지스트리는 lib/constants/creators.ts — 영상 싱크(/api/cron/sync-videos)와
-- /community/{slug} 크리에이터 보드 렌더는 레지스트리 기준으로 자동 동작한다.
-- 이 마이그레이션은 게시판 노출(categories)만 추가한다 (football 하위, 캣스날과 동일).

insert into categories (slug, name, icon, sort_order, is_active, parent_slug)
values
  ('chelookey', '첼루키', '🦁', 21, true, 'football'),
  ('cog', '코그', '🟢', 22, true, 'football'),
  ('libig', '리버풀빅클럽이야', '🔴', 23, true, 'football')
on conflict (slug) do nothing;

-- 시즌 오픈 팬덤 대항전 이벤트 (2026-07-31, docs/EVENT_SEASON_OPEN.md)
--
-- 월드컵 이벤트 인프라(events/event_groups/event_registrations/event_leaderboard_snapshots)
-- 재사용. status='draft' 로 시드 — 페이지·등록은 open 전까지 잠김, 운영자가 /admin/event
-- 또는 SQL 로 open 전환. 날짜는 플레이스홀더(8/15 개막 가정) — 확정 시 운영자가 수정.
--
-- 팀 슬러그는 월드컵과 동일한 팬덤명(kop/blues/gooner) — 채널 매핑:
--   blues=첼루키(첼시), kop=리빅(리버풀), gooner=캣스날(아스날), 코그는 공동(양쪽 유입).

insert into events (slug, name, description, prize_description, start_at, end_at, registration_closes_at, status, league_codes)
values (
  'season-open-2026',
  '시즌 오픈 팬덤 대항전',
  '리버풀 vs 첼시 vs 아스날 — 시즌 개막 4주, 팬덤의 자존심을 건 승부예측 대항전',
  '유니폼 5명 · 스팀 5만원권 10명 · 매일 밤 치킨 추첨 · 승리 팬덤 미스터리 상품 · 참가자 전원 한정 호칭 "창단 멤버"',
  '2026-08-15 00:00:00+09',
  '2026-09-13 23:59:59+09',
  '2026-09-06 23:59:59+09',
  'draft',
  array['EPL']
)
on conflict (slug) do nothing;

insert into event_groups (event_id, slug, name, club_kor, color, motto, source_channel, sort_order)
select e.id, g.slug, g.name, g.club_kor, g.color, g.motto, g.source_channel, g.sort_order
from events e,
  (values
    ('kop', 'Kop', '리버풀', '#C8102E', '너는 절대 혼자 걷지 않는다', 'libig', 1),
    ('blues', 'Blues', '첼시', '#034694', '자존심은 파랗다', 'chelookey', 2),
    ('gooner', 'Gooner', '아스날', '#EF0107', '북런던은 빨갛다', 'catsenal', 3)
  ) as g(slug, name, club_kor, color, motto, source_channel, sort_order)
where e.slug = 'season-open-2026'
on conflict (event_id, slug) do nothing;

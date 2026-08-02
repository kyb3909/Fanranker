-- 시즌 오픈 이벤트를 2팀(kop/blues)으로 축소 — 아스날(gooner) 그룹 제거.
--
-- 배경: 대결 구도가 리빅(리버풀) vs 첼루키(첼시) **2인**으로 확정됐다 (2026-08-02 운영자).
-- 20260731b 가 3팀을 시드했으나 register API 가 enum ["kop","blues"] 로 좁혀졌으므로,
-- 시드를 그대로 두면 **새로 구축한 DB 에 등록 불가능한 팀이 보이는** 불일치가 생긴다.
--
-- 안전성: 적용 시점에 season-open-2026 의 gooner 그룹은 등록 0건 / 스냅샷 0건이었다(실측).
-- 월드컵 이벤트에도 slug='gooner' 그룹이 있으나 **event_id 가 다른 별개 행**이라 영향 없다
-- (그래서 slug 만으로 지우면 안 되고 이벤트로 한정해야 한다).

delete from public.event_groups g
using public.events e
where g.event_id = e.id
  and e.slug = 'season-open-2026'
  and g.slug = 'gooner'
  and not exists (select 1 from public.event_registrations r where r.group_id = g.id)
  and not exists (select 1 from public.event_leaderboard_snapshots s where s.group_id = g.id);

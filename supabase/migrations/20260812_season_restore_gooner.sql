-- 시즌 오픈 이벤트에 아스날(gooner) 그룹 복원 — 2팀 → 3팀 (2026-08-12 운영자 요청).
--
-- 배경: 20260802b 가 아스날을 지웠다. 당시 근거는 "대결 구도가 리빅 vs 첼루키 2인으로
-- 확정"이었고, 등록 0건이라 안전하게 지울 수 있었다. 운영자가 이번에 아스날을 다시
-- 넣기로 했다 — 그때 메모에도 "일단은 제외"라 여지를 열어둔 결정이었다.
--
-- 값은 20260731b 의 원본 시드를 그대로 되돌린다 (색·모토·정렬순서·채널 매핑 동일):
--   gooner = 아스날, 소스 채널 catsenal(캣스날), sort_order 3.
--
-- 안전성:
--  · on conflict do nothing — 이미 있으면 무시라 재실행해도 안전하다.
--  · events.description 은 손대지 않는다. 아스날을 뺄 때도 안 고쳤어서 여전히
--    "리버풀 vs 첼시 vs 아스날" 인데, 복원하면 오히려 그 문구가 맞아진다(실측 확인).
--  · 월드컵 이벤트에도 slug='gooner' 그룹이 있으나 event_id 가 다른 별개 행이라
--    무관하다 — 그래서 여기서도 이벤트로 한정한다(20260802b 와 같은 이유).

insert into event_groups (event_id, slug, name, club_kor, color, motto, source_channel, sort_order)
select e.id, 'gooner', 'Gooner', '아스날', '#EF0107', 'Victoria Concordia Crescit', 'catsenal', 3
from events e
where e.slug = 'season-open-2026'
on conflict (event_id, slug) do nothing;

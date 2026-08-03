-- 홈 히어로(Top Story) 운영자 큐레이션 — posts.hero_pinned_at
--
-- 배경(2026-08-03 운영자): 히어로가 레딧 화력(news_reservoir.raw.heat) 자동 순위였는데,
-- "메인에 올리는 건 내가 선택하는 것만" 으로 전환. 알고리즘 선정을 끄고 관리자가
-- 글 상세에서 직접 건다/내린다.
--
-- is_global_notice(전체 공지 고정, 20260627) 와 같은 결: posts 에 컬럼 하나 + 관리자 전용
-- 토글. boolean 이 아니라 timestamptz 인 이유 — 여러 개를 걸었을 때 "최근에 건 순"으로
-- 히어로 순서를 정하기 위해(정렬키 겸용).

alter table public.posts
  add column if not exists hero_pinned_at timestamptz;

comment on column public.posts.hero_pinned_at is
  '홈 히어로(Top Story) 수동 고정 시각. NULL = 미고정. 관리자 전용, 최근 고정 순으로 히어로 정렬.';

-- 히어로 조회는 "고정된 글만" 뽑으므로 부분 인덱스로 충분
create index if not exists posts_hero_pinned_at_idx
  on public.posts (hero_pinned_at desc)
  where hero_pinned_at is not null;

-- 봇 뉴스 자동 말머리용 "성격" 말머리 (football)
-- 봇 기사는 대부분 이적/일반뉴스라, 팀 말머리 매칭이 안 되는 경우(마이너 팀)에도
-- 최소 "이적"/"뉴스"는 자동 부착할 수 있게 성격 말머리를 활성화/추가한다.
-- team_id 는 NULL — 팬 활동점수(user_flair_scores) 와 무관.

-- 기존에 비활성으로 시드돼 있던 "뉴스" 말머리를 활성화
update post_flairs
set is_active = true, sort_order = 20
where community_slug = 'football' and name = '뉴스';

-- "이적" 성격 말머리 신규 (없을 때만)
insert into post_flairs (community_slug, name, color, sort_order, is_active, team_id)
select 'football', '이적', '#0ea5e9', 19, true, null
where not exists (
  select 1 from post_flairs where community_slug = 'football' and name = '이적'
);

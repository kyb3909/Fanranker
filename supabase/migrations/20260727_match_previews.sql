-- 경기 프리뷰 자동 글 (docs/PRD-match-preview.md)
-- soccerway ANALYSIS 추출 → 드라이톤 재작성 → 봇 발행 파이프라인의 상태 테이블.

create table if not exists match_previews (
  id uuid primary key default gen_random_uuid(),
  soccerway_mid text not null unique,
  soccerway_url text not null,
  -- betman 매핑 (nullable — 매핑 실패해도 프리뷰 글 자체는 성립)
  game_id uuid references betman_games(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'published', 'failed')),
  home_team text,
  away_team text,
  league text,
  kickoff_at timestamptz,
  -- 추출 원문 보관 → 재작성 품질 검수·재생성용 (agg_reservoir 패턴)
  raw_text text,
  rewritten jsonb,
  post_id uuid references posts(id) on delete set null,
  error text,
  audit jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists match_previews_status_idx on match_previews (status);
create index if not exists match_previews_game_id_idx on match_previews (game_id);

-- 서버(service role) 전용 테이블 — anon/authenticated 정책 없음
alter table match_previews enable row level security;

-- 발행 대상 게시판: 비활성 → 담벼락/게시판 목록 미노출, 위젯·예측 카드·직접 URL 진입 전용
insert into categories (slug, name, is_active, description)
values ('match-preview', '경기 프리뷰', false, '경기별 자동 프리뷰 — 오늘의 경기·승부예측에서 진입')
on conflict (slug) do nothing;

-- 발행 봇 프로필
insert into profiles (user_id, nickname)
values ('user_bot_preview_kr', '경기 프리뷰')
on conflict (user_id) do nothing;

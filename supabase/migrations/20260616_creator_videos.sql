-- 20260616_creator_videos.sql
--
-- 크리에이터(유튜버) 영상 싱크 테이블. 캣스날 단일 채널 테스트 파일럿.
-- YouTube RSS(feeds/videos.xml)에서 수집한 영상을 creator_id 기준으로 저장.
-- 읽기는 public(anon), 쓰기는 service role(/api/cron/sync-videos)만.

create table if not exists public.creator_videos (
  id uuid primary key default gen_random_uuid(),
  creator_id text not null, -- 테스트 단계에선 'catsenal' 같은 slug 허용
  youtube_video_id text not null,
  title text not null,
  thumbnail_url text not null,
  published_at timestamptz not null,
  synced_at timestamptz not null default now(),
  unique (creator_id, youtube_video_id)
);

create index if not exists creator_videos_creator_published_idx
  on public.creator_videos (creator_id, published_at desc);

alter table public.creator_videos enable row level security;

-- 읽기: 공개. 영상 목록은 공개 정보 (anon/authenticated 모두 허용).
drop policy if exists "creator_videos_public_read" on public.creator_videos;
create policy "creator_videos_public_read" on public.creator_videos
  for select
  using (true);

-- 쓰기(insert/update/delete): 정책 없음 → service role(RLS 우회)만 가능.
--   /api/cron/sync-videos 가 service role 클라이언트로 upsert 한다.

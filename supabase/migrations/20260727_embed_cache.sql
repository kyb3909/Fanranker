-- oEmbed 결과 영구 캐시 — 외부 서비스(fxtwitter/YouTube/IG oEmbed) 호출을
-- 리소스당 평생 1회 수준으로 줄인다. 키는 provider:id 정규화 형태.
-- service role 전용 (RLS enable + policy 없음 = anon/authed 접근 차단).
create table if not exists embed_cache (
  url text primary key,
  provider text not null,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table embed_cache enable row level security;

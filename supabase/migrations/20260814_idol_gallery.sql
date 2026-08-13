-- 아이돌 갤러리 (2026-08-14) — 찍덕(홈마) 트윗 큐레이션.
-- 저작권 원칙: 이미지를 재호스팅하지 않는다. 트윗 URL 과 X CDN 미디어 참조만 저장하고,
-- 브라우저가 X 에서 직접 받는다. 원본 삭제 = 갤러리에서도 사라짐 (촬영자 통제권 유지).
create table if not exists gallery_items (
  id uuid primary key default gen_random_uuid(),
  tweet_url text not null unique,
  author_name text,          -- 표시명
  author_handle text,        -- @핸들 (출처 표기)
  media jsonb not null default '[]'::jsonb,  -- [{type:'photo'|'video', url, thumbnail_url}]
  tag text,                  -- 아이돌/그룹 태그 (추후 필터용)
  created_by text,           -- 등록 운영자 clerk user_id
  created_at timestamptz not null default now()
);

create index if not exists gallery_items_created_at_idx on gallery_items (created_at desc);

-- 읽기·쓰기 모두 API(service role) 경유 — 클라이언트 직접 접근 없음. 정책 없이 잠근다.
alter table gallery_items enable row level security;

-- 기사↔사가 링크에 엔트리 참조 추가 — 사가 타임라인에서 "타고 들어온 그 기사"의
-- 본문을 해당 엔트리 자리에 펼쳐 보여주기 위함 (2026-08-03 오너).
alter table public.saga_article_links
  add column if not exists entry_id uuid references public.saga_entries(id) on delete set null;

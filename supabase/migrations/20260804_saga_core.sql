-- 사가 엔진 코어 (Phase A W1) — 스펙: docs/saga/SAGA_ENGINE_PRD.md, 확정 스키마: docs/saga/P0_AUDIT.md §4
--
-- 사가 = 자동 생성·자동 성장하는 위키 문서. Phase A 는 transfer 만 구현하지만 테이블은
-- day one 부터 saga_type 제네릭이다 (PRD 원칙 4 — match/season 이 마이그레이션 없이 꽂혀야 함).
-- 그래서 stage/outcome 은 DB CHECK 를 걸지 않는다 — 타입별 유효 세트가 달라서
-- lib/saga/stages.ts 가 검증의 단일 소스다 (트레이드오프는 P0_AUDIT §6-8).
--
-- 댓글·팬점수·알림은 앵커 posts 행 경유로 기존 시스템을 그대로 얻는다 (P0 오딧:
-- comments.post_id NOT NULL + 트리거 3종이 post 전제 → polymorphic 불가, 앵커가 정답).
-- user_id 는 전부 text (Clerk) — PRD §5 초안의 uuid 는 오딧에서 정정됨.

-- ── 사가 문서 본체 ──────────────────────────────────────────────
create table if not exists public.sagas (
  id            uuid primary key default gen_random_uuid(),
  saga_type     text not null check (saga_type in ('transfer','match','season')),
  slug          text not null unique,
  title         text not null,
  -- 멱등키. transfer: 'transfer:{player_key}:{direction}:{window_key}' (D2 — 목적지 제외)
  identity_key  text not null unique,
  -- 타입별 자유 형태. transfer: {player_key, player_name_kr, direction, club_slug, ...}
  subject       jsonb not null,
  -- 정산 잡 필터 (예: '2026-summer')
  window_key    text not null,
  stage         text not null default 'interest',
  status        text not null default 'active' check (status in ('active','closed')),
  -- closed 시 확정: done | collapsed | stayed (코드 검증 — lib/saga/stages.ts)
  outcome       text,
  -- 미확정 루머 noindex 해제 스위치 (D7) — done 확정 시 true
  is_confirmed  boolean not null default false,
  -- 자체 작성 요약 (검수 수정 가능). 외부 본문 아님 (D5)
  summary       text,
  -- 댓글·알림·팬점수의 접합점 — 숨김 보드의 실제 posts 행
  anchor_post_id uuid not null references public.posts(id),
  entry_count   int not null default 0,
  -- 피드 정렬키 — 이벤트 발행 시 갱신 = 범프
  last_event_at timestamptz not null default now(),
  -- 정산 CAS 가드 (재정산 방지)
  settled_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create index if not exists sagas_feed_idx on public.sagas (status, last_event_at desc);
create index if not exists sagas_window_idx on public.sagas (window_key) where status = 'active';

comment on table public.sagas is
  '사가 문서 본체 — 자동 생성·자동 성장 위키. stage/outcome 검증은 lib/saga/stages.ts (타입별 세트가 달라 DB CHECK 없음).';

-- ── 연표 엔트리 (클러스터 1개 = 엔트리 1개, D9) ─────────────────
create table if not exists public.saga_entries (
  id          uuid primary key default gen_random_uuid(),
  saga_id     uuid not null references public.sagas(id) on delete cascade,
  -- 원출처×단계×시간버킷 해시 — 같은 소식 받아쓰기 N건이 같은 키 = 발행 멱등
  cluster_key text not null,
  headline    text not null,
  -- 자체 작성 1~2문장. ⚠️ 외부 기사 본문 컬럼은 의도적으로 없다 (D5 구조적 보장)
  summary     text,
  tier        text not null check (tier in ('official','tier1','rumor')),
  -- 이 엔트리로 전이된 단계 (단계 변화 없으면 null)
  stage_after text,
  -- 원출처 1건: {reporter, outlet, url, published_at}
  origin      jsonb not null,
  -- 받아쓰기 접기: [{outlet, url, title}]
  echoes      jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (saga_id, cluster_key)
);

create index if not exists saga_entries_timeline_idx on public.saga_entries (saga_id, occurred_at desc);

-- ── 투표 (append-only 원장, D10·여론 시계열) ────────────────────
-- poll_votes 의 upsert(이력 소실) 결함을 정정한 설계 — 현재 스탠스는
-- DISTINCT ON (user_id) ORDER BY created_at DESC 계산식, 그래프는 일 버킷 집계.
create table if not exists public.saga_votes (
  id         uuid primary key default gen_random_uuid(),
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  scope      text not null check (scope in ('main','entry')),
  entry_id   uuid references public.saga_entries(id) on delete cascade,
  user_id    text not null,
  -- main: 'go'|'stay' / entry: 'believe'|'fake' — 값 검증은 코드 (타입 확장 대비)
  choice     text not null check (char_length(choice) between 1 and 20),
  created_at timestamptz not null default now(),
  constraint saga_votes_entry_scope check (scope = 'main' or entry_id is not null)
);

create index if not exists saga_votes_series_idx on public.saga_votes (saga_id, scope, created_at);
create index if not exists saga_votes_user_idx on public.saga_votes (saga_id, user_id, scope, created_at desc);
create index if not exists saga_votes_entry_idx on public.saga_votes (entry_id) where entry_id is not null;

-- ── 댓글 스탠스 스냅샷 (소환 원장, D10) ─────────────────────────
-- comments 테이블 무변경 — 댓글 API 가 anchor_post_id 역조회 히트 시 fire-and-forget insert.
create table if not exists public.saga_comment_stances (
  comment_id uuid primary key references public.comments(id) on delete cascade,
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  -- 작성 시점 메인 스탠스 (미투표면 null) — 나중에 투표를 바꿔도 이 값은 불변
  stance     text,
  created_at timestamptz not null default now()
);

create index if not exists saga_comment_stances_saga_idx on public.saga_comment_stances (saga_id);

-- ── RLS — 공개 읽기(문서·연표) / 나머지 service role 전용 ────────
alter table public.sagas enable row level security;
drop policy if exists "sagas_public_read" on public.sagas;
create policy "sagas_public_read" on public.sagas for select using (true);

alter table public.saga_entries enable row level security;
drop policy if exists "saga_entries_public_read" on public.saga_entries;
create policy "saga_entries_public_read" on public.saga_entries for select using (true);

-- 투표·스냅샷은 정책 0개 = API(service role) 전용. 집계는 서버가 수행 (poll_votes 관례)
alter table public.saga_votes enable row level security;
alter table public.saga_comment_stances enable row level security;

-- ── 앵커 인프라: 봇 계정 + 숨김 보드 ────────────────────────────
-- agg_reservoir(20260722c) 페르소나 시드 패턴. 사가 봇은 문서 앵커 글의 명목상 작성자.
insert into public.profiles (user_id, nickname, role, onboarding_completed)
values ('user_saga_bot', '사가 기록관', 'user', false)
on conflict (user_id) do nothing;

-- is_active=false → 게시판 목록·온보딩에 노출 안 됨 (노출 규칙 = categories.is_active).
-- 앵커 글 자체는 /post/[id] 로 접근 가능하나 W1 에서 /saga/[slug] 로 redirect 를 붙인다.
insert into public.categories (slug, name, description, is_active, sort_order)
values ('saga', '사가', '사가 문서 앵커 보드 (비노출) — 댓글·알림 접합용', false, 999)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 사가 엔진 Phase A W2 — 파이프라인 저수지 + 정산 원장 (docs/saga/P0_AUDIT.md §4)
--
-- saga_reservoir : HITL 검수 큐 (agg_reservoir 20260722c 선례).
--   news_reservoir 를 재사용하지 않는 이유: 검수 화면이 source->>type='hermes'
--   하드필터라 사가 항목이 보이지 않는다 (P0 오딧 판정).
-- saga_settlements : 정산 멱등 원장 (W4 가 소비 — 테이블만 먼저).
-- notifications type CHECK : + saga_settled (W4 알림용).
-- ─────────────────────────────────────────────────────────────────

-- ── 1. saga_reservoir — 수집→추출→클러스터→검수 상태 기계 ──────────
create table if not exists public.saga_reservoir (
  id          uuid primary key default gen_random_uuid(),
  -- 멱등키: 같은 기사를 두 번 수집하지 않는다 (ingest cron 재실행 안전)
  source_url  text not null unique,
  -- 출처 메타: { kind: 'ticker'|'rss', ticker_id?, outlet?, reporter?, feed? }
  source      jsonb not null default '{}'::jsonb,
  title       text not null,
  headline_kr text,
  -- 판단 재료 원문 조각 (요약·발췌) — UI 노출 금지, D5 저작권 (본문 전문 저장 금지)
  raw         jsonb not null default '{}'::jsonb,
  -- 추출 결과: { player_key, player_name_kr, direction, clubs[], stage_signal, tier, confidence }
  extracted   jsonb,
  -- 클러스터링 결과: 배정된 사가 identity_key + 클러스터 키 (검수 화면이 표시/수정)
  saga_hint   text,
  cluster_key text,
  status      text not null default 'ingested'
    check (status in ('ingested','extracted','clustered','queued','approved','published','rejected','discarded')),
  error       text,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists saga_reservoir_status_idx
  on public.saga_reservoir (status, created_at desc);
create index if not exists saga_reservoir_hint_idx
  on public.saga_reservoir (saga_hint) where saga_hint is not null;

-- ── 2. saga_settlements — 정산 멱등 원장 (W4 소비) ─────────────────
create table if not exists public.saga_settlements (
  saga_id    uuid not null references public.sagas(id) on delete cascade,
  user_id    text not null,
  choice     text not null,
  correct    boolean not null,
  points     integer not null default 0,
  -- null = 보드 일일 100점 상한에 걸려 이월 대기 (스윕 cron 이 채움)
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (saga_id, user_id)
);

create index if not exists saga_settlements_pending_idx
  on public.saga_settlements (user_id) where awarded_at is null;

-- ── 3. notifications type CHECK — + saga_settled ──────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'comment'::text, 'reply'::text, 'new_post_by_followed'::text,
    'expert_prediction'::text, 'settlement_result'::text, 'saga_settled'::text
  ]));

-- ── RLS — 전부 service role 전용 (정책 0개). 신규 RPC 0개 = anon 부여 사고 원천 차단 ──
alter table public.saga_reservoir enable row level security;
alter table public.saga_settlements enable row level security;

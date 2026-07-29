-- 모더레이션 기반 스키마 — 판정 / 조치 / 검토 큐 3분리 (P1 Phase 1)
--
-- ⚠️ 이 파일은 설계 승인 전까지 적용하지 않는다.
--
-- 설계 원칙
--   · 판정(verdict)과 조치(action)를 분리한다. 판정이 나도 조치가 없을 수 있고,
--     조치는 나중에 사람이 뒤집을 수 있다(overridden). overridden 은 이후
--     자동화 승급 판단의 유일한 근거가 되므로 절대 빼지 않는다.
--   · 같은 대상에 판정이 여러 번 쌓일 수 있다(RULE → LLM → HUMAN 재판정).
--     unique 제약을 걸지 않고 이력으로 남긴다.
--   · 기존 테이블은 건드리지 않는다. 유일한 예외 = posts.visibility_score 추가.
--
-- 6월 브랜치(moderation-agent)의 moderation_verdicts 와 이름이 같지만 그 마이그레이션은
-- 프로덕션에 적용된 적이 없다(2026-07-29 확인: moderation% 테이블 0개). 이 파일이 정본이고
-- 브랜치 쪽 마이그레이션은 폐기한다 — 룰 필터 코드만 이식한다.

-- ── 1. 판정 기록 ──────────────────────────────────────────────
create table if not exists public.moderation_verdicts (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id text not null,
  verdict text not null check (verdict in ('VIOLATION', 'NO_VIOLATION', 'UNCERTAIN')),
  violated_category text,        -- SPAM_AD | REGION_SLUR | POLITICS | TAUNT | ... (P2에서 확장)
  confidence real,               -- 0..1
  decided_by text not null check (decided_by in ('RULE', 'LLM', 'HUMAN')),
  reasoning text,                -- 규칙명/점수 내역 또는 모델 근거. ⚠️ 신고자 정보 기록 금지
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_verdicts_target
  on public.moderation_verdicts (target_type, target_id);
create index if not exists idx_moderation_verdicts_created
  on public.moderation_verdicts (created_at desc);

-- ── 2. 실행된 조치 ────────────────────────────────────────────
create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.moderation_verdicts (id),
  action text not null check (action in ('NO_ACTION', 'VISIBILITY_DOWN', 'BLIND', 'DELETE')),
  actor text not null check (actor in ('AGENT', 'HUMAN')),
  -- 사람이 에이전트 조치를 뒤집었는가 — 자동화 승급/강등 판단의 근거 데이터
  overridden boolean not null default false,
  override_direction text check (override_direction in ('UPGRADE', 'DOWNGRADE')),
  created_at timestamptz not null default now(),
  reverted_at timestamptz        -- 조치 철회 시각 (모든 조치는 되돌릴 수 있어야 한다)
);

create index if not exists idx_moderation_actions_verdict
  on public.moderation_actions (verdict_id);
create index if not exists idx_moderation_actions_created
  on public.moderation_actions (created_at desc);

-- ── 3. 사람 검토 대기열 ───────────────────────────────────────
create table if not exists public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.moderation_verdicts (id),
  priority smallint not null default 0,      -- 높을수록 먼저 검토
  status text not null default 'PENDING' check (status in ('PENDING', 'RESOLVED')),
  assigned_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,              -- 검토자 (content_reports.resolved_by 와 동일 컨벤션)
  created_at timestamptz not null default now()
);

create index if not exists idx_moderation_queue_pending
  on public.moderation_queue (priority desc, created_at)
  where status = 'PENDING';

-- ── 4. posts.visibility_score — 유일한 기존 테이블 변경 ────────
-- 노출 감소(VISIBILITY_DOWN)용 배수. 1 = 기존 동작 그대로.
-- temperature 를 직접 깎지 않는 이유: pg_cron 이 매분 재계산해서 다음 분에 복원된다.
-- 피드 정렬에 곱하는 방식은 P1 Phase 2 조치 매핑에서 구현한다.
alter table public.posts
  add column if not exists visibility_score real not null default 1;

-- ── RLS: service_role 전용 (워커/어드민 모두 service role 클라이언트 사용) ──
alter table public.moderation_verdicts enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_queue enable row level security;
-- 정책을 만들지 않음 = anon/authenticated 접근 불가. service_role 은 RLS 우회.

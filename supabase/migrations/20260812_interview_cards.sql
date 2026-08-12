-- 인터뷰 발췌 조직 (2026-08-12) — 구단 서브레딧 인터뷰 → 시즌 사가 연대기 카드
--
-- 파이프라인 (각 단계는 별개 cron, 통신은 이 테이블로만 — 런타임 멀티에이전트 금지):
--   채방관  interview-scout   : news_reservoir 에서 인터뷰 후보 선별 (LLM 0회)
--   발췌관  interview-extract : 원문에서 발언 원문을 "그대로" 오려냄 (LLM 1회)
--                               → 기계 대조: 원문 부분문자열이 아니면 폐기 (환각 구조적 0)
--                               → 한국어 번역 (LLM 1회) + 표기 사전 사후 검사
--   검수    /admin/interviews : 사람 승인 → 시즌 사가 연대기 엔트리로 발행
--
-- status: pending → ready → published / skipped / rejected / dead_letter

create table if not exists interview_cards (
  id uuid primary key default gen_random_uuid(),
  reservoir_id text not null references news_reservoir(id) on delete cascade,
  team_id text not null,              -- 시즌 사가 subject.team_id ('arsenal' 등)
  subreddit text not null,
  source_url text,                    -- 원문 기사 URL (출처 귀속)
  source_title text not null,
  material text not null,             -- raw.articleText 스냅샷 — 대조의 원본
  speaker text,                       -- 발언자 (발췌관 산출)
  quotes jsonb not null default '[]'::jsonb,  -- [{en, ko}] — en 은 원문 그대로(검증됨)
  headline_ko text,
  status text not null default 'pending',
  hold_reason text,
  error text,
  attempt_count int not null default 0,
  occurred_at timestamptz not null,   -- 원 보도 시각 (연대기 배치 기준)
  saga_id uuid references sagas(id),  -- 발행된 시즌 사가
  entry_id uuid,                      -- 발행된 saga_entries.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 멱등: 같은 저수지 행은 카드 1장
create unique index if not exists interview_cards_reservoir_uniq on interview_cards (reservoir_id);
create index if not exists interview_cards_status_idx on interview_cards (status, created_at);

-- service role 전용 (team_dictionary 와 동일 — 정책 없는 RLS)
alter table interview_cards enable row level security;

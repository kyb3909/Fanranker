-- 실록 단계 2 — 팀 사전 + betman↔Soccerway 경기 매핑 시도 원장 (shadow)
--
-- 목적: betman 경기(한글 팀명 문자열)를 Soccerway canonical ID(팀 해시)에 접붙여
-- 경기 데이터 파이프라인(라인업·이벤트·평점)의 신원 기반을 만든다 (PRD D16).
--
-- 2026-08-07 실측으로 확정된 발견 경로 (docs/gauntlet/missing-information.md I-3b 개정):
--  - www.soccerway.com 신 플랫폼은 전면 SPA — 날짜/리그/팀 페이지의 경기 목록은
--    클라이언트 렌더라 정적 발견 불가. 이전 "날짜 페이지 정적 fetch" 전제는 기각됨
--    (빌라-뮌헨 사례는 seoFooter 인기 경기 위젯이었음).
--  - 대신 **팀 해시 2개로 /match/{slug-hash}/{slug-hash}/ URL을 직접 구성**하면
--    정적 200/404 판별 + SSR title("Bayern Munich v Aston Villa" — 홈 v 원정 순서)
--    + meta description("On 07/08/2026 … Club Friendly 2026")으로 날짜·대회까지 나온다.
--    순서를 뒤집어도 canonical 로 301 — 구성 순서는 무관하다.
--  - 따라서 사전(팀 해시)이 신원의 전부다. 팀 해시는 구 URL(/teams/{country}/{slug}/{id}/)
--    301 리다이렉트로 정적 수확 가능 (id 오류는 홈페이지 soft-fail — 감지됨).
--
-- 설계 원칙 (news_assignments 관례 이식)
--  1. 판정(proposed/ambiguous/no_candidate/team_unresolved)과 실행 실패(fetch_error)를
--     같은 값으로 합치지 않는다. status(ok/retry_wait/dead_letter)가 재시도 가능성을 따로 말한다.
--  2. 같은 (경기, 입력 해시, 술어 버전)의 ok 는 부분 유니크로 1회 봉인 — 재배포·중복 cron 방어.
--  3. append-only. 재시도는 새 행 + attempt 증가.
--  4. **shadow 전용**: 이 원장은 betman_games.mapped_* 를 쓰지 않는다. 실기록은
--     골든셋 게이트(G-매칭 50쌍) 통과 후 별도 단계에서만.

-- ── 팀 사전 ──────────────────────────────────────────────────────────
-- "왕은 Soccerway ID" (target-architecture §2.1). 후보 자동 제안 + 사람 확정 패턴.
create table if not exists public.team_dictionary (
  soccerway_team_id text primary key,          -- 해시 (예: 빌라 W00wmLO0)
  slug              text not null,             -- URL 슬러그 (예: aston-villa) — match URL 구성용
  name_en           text not null,
  name_kr           text,                      -- 대표 한글 표기 (오너 확정 라벨)
  aliases_kr        text[] not null default '{}',  -- betman·네이버·사가 표기 흡수
  -- proposed = 자동 시드/수확 (매핑 shadow 에는 사용), confirmed = 오너 확정 (실기록 자격)
  status            text not null default 'proposed'
                    check (status in ('proposed', 'confirmed', 'rejected')),
  free_api_team_id  text,                      -- 무료 API 보정용 보조 ID (nullable)
  team_map_pin_id   text,                      -- 스타디움 연계 (nullable)
  source            text not null default 'seed',  -- seed | redirect_harvest | crumb | admin
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists team_dictionary_aliases_kr_idx
  on public.team_dictionary using gin (aliases_kr);
create index if not exists team_dictionary_status_idx
  on public.team_dictionary (status);

-- ── 경기 매핑 시도 원장 (shadow) ─────────────────────────────────────
create table if not exists public.match_mapping_attempts (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references public.betman_games(id) on delete cascade,
  -- 팀명 2개 + 킥오프의 해시. betman 데이터가 바뀌면 값이 바뀌어 재평가가 열린다.
  input_hash     text not null,
  -- 술어/파서 버전 — 버전이 오르면 전 경기 재평가가 열린다.
  predicate_version text not null,
  attempt        integer not null default 1 check (attempt >= 1),

  -- 판정: proposed(후보 확정 제안) / ambiguous(날짜 불일치 등 모호 — 검수) /
  --       no_candidate(404 — 소커웨이에 해당 쌍 경기 없음) /
  --       team_unresolved(사전 미등재 — 사전 보강 신호) / fetch_error(실행 실패)
  outcome text not null check (outcome in (
    'proposed', 'ambiguous', 'no_candidate', 'team_unresolved', 'fetch_error'
  )),
  status text not null default 'ok' check (status in ('ok', 'retry_wait', 'dead_letter')),

  -- 해석 결과 (betman 기준 홈/원정 → soccerway 해시)
  home_team_id   text references public.team_dictionary(soccerway_team_id),
  away_team_id   text references public.team_dictionary(soccerway_team_id),
  unresolved_names text[] not null default '{}', -- team_unresolved 일 때 미등재 한글 표기

  -- 구성·검증 결과
  candidate_url  text,                          -- 구성한 /match/…/ URL (canonical 반영)
  page_home_en   text,                          -- SSR title 의 홈팀 (Soccerway 정본)
  page_away_en   text,
  page_date      date,                          -- meta description 의 경기 날짜
  page_tournament text,
  -- betman 홈/원정과 Soccerway 홈/원정이 다름 — 자동 스왑 금지, 검수 큐 신호 (I-3b)
  home_away_flip boolean,

  -- headless(단계 3)에서 수확할 report 식별자 — 지금은 항상 null
  soccerway_mid  text,

  error          text,
  latency_ms     integer check (latency_ms is null or latency_ms >= 0),
  run_id         text not null,
  created_at     timestamptz not null default now(),

  -- 실패 행은 error 를 가진다. 판정 행은 error 가 없다.
  constraint mma_error_shape check (
    (outcome = 'fetch_error' and error is not null)
    or (outcome <> 'fetch_error' and error is null)
  ),
  -- proposed 는 검증된 후보의 최소 형태를 갖춘다
  constraint mma_proposed_shape check (
    outcome <> 'proposed'
    or (candidate_url is not null and page_date is not null
        and home_team_id is not null and away_team_id is not null)
  )
);

-- 같은 (경기, 입력, 술어 버전)의 확정 판정은 1회만 — 재호출 봉인 (dead_letter 도 재시도 소진이므로 봉인)
create unique index if not exists match_mapping_attempts_ok_uniq
  on public.match_mapping_attempts (game_id, input_hash, predicate_version)
  where (status in ('ok', 'dead_letter'));

create index if not exists match_mapping_attempts_outcome_idx
  on public.match_mapping_attempts (outcome, created_at desc);
create index if not exists match_mapping_attempts_game_idx
  on public.match_mapping_attempts (game_id, created_at desc);

-- service role 전용 (정책 없음 = anon/authenticated 접근 불가)
alter table public.team_dictionary enable row level security;
alter table public.match_mapping_attempts enable row level security;

comment on table public.team_dictionary is
  '실록 단계 2: Soccerway canonical 팀 사전. 후보 자동 제안 + 오너 확정(confirmed). 실기록은 confirmed 만.';
comment on table public.match_mapping_attempts is
  '실록 단계 2: betman↔Soccerway 경기 매핑 시도 원장 (shadow — betman_games.mapped_* 미기록). 골든셋 게이트 후 실기록.';

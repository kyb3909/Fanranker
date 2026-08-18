-- 매치 라인업·리포트 영구 저장 (2026-08-18 운영자: "서비스가 너무 일관성이 없다")
--
-- 문제: soccerway 해석에 킥오프 −150분 ~ +24시간 창이 걸려 있고, 창을 벗어나면
--       resolveEventCore 가 "none" 을 돌려준다. 그 한 줄이 **라인업·리포트·스탯을
--       한꺼번에** 끈다. 받아온 것을 저장하지 않으니 하루 지난 경기를 열면 텅 빈다 —
--       같은 페이지가 열어보는 시각에 따라 다르게 보이는 것이 일관성 붕괴의 정체였다.
--
-- 해결: 창은 **바깥에 요청을 보낼지**만 정하고, 화면에 뭘 보여줄지는 저장분이 정한다.
--       한 번 확보한 라인업·리포트는 영구히 남는다.
--
-- game_id 는 betman_games.id 를 가리키지만 FK 를 걸지 않는다 — betman 재수집으로
-- 경기 행이 교체될 때 애써 모은 라인업이 같이 날아가면 안 된다 (본말전도).

create table if not exists match_lineups (
  game_id text primary key,
  event_id text not null,
  -- LineupResponse 의 ready 형태 그대로 (home/away DisplaySide + kickoff)
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists match_reports (
  game_id text primary key,
  event_id text not null,
  title text not null,
  paragraphs text[] not null,
  created_at timestamptz not null default now()
);

comment on table match_lineups is '확보한 라인업 영구 보관 — soccerway 는 경기 하루 뒤 라인업을 더 이상 주지 않는다';
comment on table match_reports is '검증을 통과한 한국어 매치 리포트 보관 — 재생성 비용(LLM)과 원본 소실 양쪽을 막는다';

-- 서버(서비스 롤)만 읽고 쓴다. 클라이언트는 페이지 서버 컴포넌트를 통해서만 본다.
alter table match_lineups enable row level security;
alter table match_reports enable row level security;

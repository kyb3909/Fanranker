-- 경기 결과 교차검증 원장 (2026-08-30 운영자 확정)
--
-- "크로스 체크가 완료되고, 오류가 있으면 알림으로 알려주고, 그게 다 되어야
--  이후에 맞춘 것도 정산을 해서 진행" — 축구 정산 앞에 검증 게이트를 세운다.
--
-- 흐름: 와이즈토토가 결과를 쓰면 → 크론이 LFA(산 피드)와 대조해 여기 verdict 를
-- 남기고 → settlePredictions 가 축구 completed 경기는 verdict 를 보고서만 정산한다.
--
-- verdict:
--   match     두 출처 일치 — 정산 허용
--   mismatch  불일치 — 정산 보류 + 디스코드 알림. 사람이 풀 때까지 안 나간다
--   pending   LFA 미확인(색인에 없거나 종료 전) — 재시도 대기
--   waived    LFA 커버리지 밖(마이너 리그 등)으로 판정 유예 시한 초과 — 와이즈토토
--             단독으로 정산 허용. 없으면 커버리지 밖 경기의 유저 지급이 영영 얼어붙는다
--
-- 축구 외 종목은 이 테이블을 거치지 않는다 (LFA 가 축구 전용).

create table if not exists betman_result_checks (
  game_id uuid primary key references betman_games(id) on delete cascade,
  verdict text not null check (verdict in ('match', 'mismatch', 'pending', 'waived')),
  betman_score text,
  lfa_score text,
  checked_at timestamptz not null default now(),
  -- 불일치 알림 1회 보장 (같은 사고를 15분마다 다시 울리지 않게)
  alerted_at timestamptz
);

comment on table betman_result_checks is
  '축구 결과 LFA×와이즈토토 교차검증 — settlePredictions 의 정산 게이트가 읽는다';

-- pending 재시도 스캔용
create index if not exists idx_result_checks_verdict on betman_result_checks (verdict)
  where verdict in ('pending', 'mismatch');

-- 서버(service role) 전용 — 클라이언트가 읽고 쓸 이유가 없다
alter table betman_result_checks enable row level security;

-- BET_TYPE_MAP / RESULT_HANDI_MAP 에 없는 betman 게임/결과를 raw 로 보관.
-- 분류 코드(전반전 등)가 아직 서비스에 추가되지 않은 상태에서 데이터만 캡처해
-- 운영자가 sample 을 보고 신규 베팅 유형을 식별할 수 있게 한다.
--
-- 정산/UI 와는 무관 — 어떤 서비스 코드도 이 테이블을 읽지 않는다.

CREATE TABLE IF NOT EXISTS public.betman_unknown_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'game'  : 경기 데이터 파싱(parseGames) 중 BET_TYPE_MAP 에 없는 betTypId
  -- 'result': 결과 수집(winrstDetl) 중 RESULT_HANDI_MAP 에 없는 HANDI_VAL
  source TEXT NOT NULL CHECK (source IN ('game', 'result')),

  gm_ts TEXT NOT NULL,

  -- ON CONFLICT 단순화를 위해 NOT NULL + sentinel default. 실제 NULL 이면 -1/'' 로 저장.
  game_no INTEGER NOT NULL DEFAULT -1,
  bet_typ_id TEXT NOT NULL DEFAULT '',
  handi_val INTEGER NOT NULL DEFAULT -1,

  -- 'result' 소스 부가 정보
  game_result TEXT,
  mch_score TEXT,
  home_score INTEGER,
  away_score INTEGER,

  -- 양 소스 공통
  sport TEXT,
  league_code TEXT,
  home_team_name TEXT,
  away_team_name TEXT,
  match_time TIMESTAMPTZ,

  -- betman 응답의 모든 컬럼을 key=value 로 보존. 신규 코드 분석용.
  raw_data JSONB NOT NULL,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT betman_unknown_games_uniq UNIQUE (source, gm_ts, game_no, bet_typ_id, handi_val)
);

CREATE INDEX IF NOT EXISTS idx_betman_unknown_games_first_seen
  ON public.betman_unknown_games (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_betman_unknown_games_bet_typ_id
  ON public.betman_unknown_games (bet_typ_id)
  WHERE bet_typ_id <> '';

CREATE INDEX IF NOT EXISTS idx_betman_unknown_games_handi_val
  ON public.betman_unknown_games (handi_val)
  WHERE handi_val <> -1;

COMMENT ON TABLE public.betman_unknown_games IS
  'BET_TYPE_MAP/RESULT_HANDI_MAP 에 없는 betman 게임/결과 raw 캡처. 신규 베팅 유형(전반전 등) 식별용. 정산/UI 미사용.';

-- service_role 만 접근 (VPS scraper → cron-auth API → service role).
-- 일반 클라이언트 / RLS 사용자에겐 노출되지 않는다.
ALTER TABLE public.betman_unknown_games ENABLE ROW LEVEL SECURITY;

-- 리그별 순위표 캐시 (VPS Playwright 스크래퍼가 주기적으로 수집)
-- league_id: lib/standings/naver-leagues.ts 의 id (kbo, epl, ...)
-- data: 순위 행 배열 jsonb, 예: [{ "rank": 1, "teamName": "팀명", "points": 50, ... }, ...]
-- fetched_at: 수집 시각 (KST 권장)

CREATE TABLE standings_cache (
  league_id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE standings_cache IS '네이버 스포츠 순위표 크롤 결과 (VPS cron + Playwright)';

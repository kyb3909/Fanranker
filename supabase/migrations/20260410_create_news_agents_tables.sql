-- 뉴스 에이전트 newsroom 파이프라인 (Phase A)
-- data/agents/ 시스템의 중앙 reservoir + alias dictionary
-- 모든 에이전트는 news_reservoir의 status 컬럼을 전이시키며 동작한다.
-- 자세한 설계: data/agents/docs/architecture-and-workflow.md

-- ============================================================================
-- 1) news_reservoir: 모든 뉴스 후보의 단일 출처
-- ============================================================================
CREATE TABLE IF NOT EXISTS news_reservoir (
  id              text PRIMARY KEY,                        -- e.g. reddit_<sub>_<postid>
  source          jsonb NOT NULL,                          -- platform, subreddit, postId, author, ...
  urls            jsonb NOT NULL,                          -- reddit, article, socials[]
  raw             jsonb NOT NULL,                          -- title, excerpt, lang
  normalized      jsonb,                                   -- normalized fields + candidate entities
  entities        jsonb,                                   -- resolved entities (after naming)
  unresolved      jsonb,                                   -- unresolved naming queue
  tags            text[],                                  -- 한국어 태그 (issue, league, position, team)
  issue_type      text,                                    -- transfer/injury/contract/...
  scores          jsonb NOT NULL,                          -- credibility, newsworthiness, namingConfidence, ...
  dedupe_key      text NOT NULL,
  status          text NOT NULL,                           -- ReservoirStatus enum (text 유지, code에서 강제)
  decision        jsonb,                                   -- desk decision
  assignment      jsonb,                                   -- writer assignment
  draft           jsonb,                                   -- KoreanBrief
  publish         jsonb,                                   -- PublishMeta (Phase B)
  external_key    text UNIQUE,                             -- community board 멱등성 키
  audit           jsonb NOT NULL DEFAULT '[]'::jsonb,      -- AuditEntry[]
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_reservoir_status      ON news_reservoir(status);
CREATE INDEX IF NOT EXISTS idx_news_reservoir_dedupe_key  ON news_reservoir(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_news_reservoir_created_at  ON news_reservoir(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_reservoir_issue_type  ON news_reservoir(issue_type) WHERE issue_type IS NOT NULL;

-- updated_at 자동 갱신 트리거 함수 (다른 마이그레이션과 충돌하지 않게 news_ 네임스페이스)
CREATE OR REPLACE FUNCTION news_reservoir_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS news_reservoir_updated_at ON news_reservoir;
CREATE TRIGGER news_reservoir_updated_at
  BEFORE UPDATE ON news_reservoir
  FOR EACH ROW EXECUTE FUNCTION news_reservoir_set_updated_at();

ALTER TABLE news_reservoir ENABLE ROW LEVEL SECURITY;
-- 정책 없음 = service role만 접근. anon/authenticated 차단.

COMMENT ON TABLE news_reservoir IS
  'Newsroom 파이프라인 중앙 reservoir. 모든 뉴스 에이전트는 이 테이블의 status 컬럼을 전이시키며 동작한다. data/agents/ 참조.';

-- ============================================================================
-- 2) news_alias_dictionary: 한국식 표기 마스터 (선수/팀/감독/대회)
-- ============================================================================
CREATE TABLE IF NOT EXISTS news_alias_dictionary (
  id              text PRIMARY KEY,                        -- e.g. player_salah_mo
  category        text NOT NULL CHECK (category IN ('player','team','coach','competition')),
  preferred_ko    text NOT NULL,
  romanized       text NOT NULL,
  surfaces        text[] NOT NULL,                         -- 매칭 키 (lowercase 권장)
  hangul_alts     text[],                                  -- 잘못된 한글 변형 (참고용)
  disambiguation  text,
  confidence      double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  ko_first_seen   text,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- surface 매칭은 GIN으로 가속 (lowercased surface in any() 검색)
CREATE INDEX IF NOT EXISTS idx_news_alias_surfaces ON news_alias_dictionary USING GIN (surfaces);
CREATE INDEX IF NOT EXISTS idx_news_alias_category ON news_alias_dictionary(category);

DROP TRIGGER IF EXISTS news_alias_updated_at ON news_alias_dictionary;
CREATE TRIGGER news_alias_updated_at
  BEFORE UPDATE ON news_alias_dictionary
  FOR EACH ROW EXECUTE FUNCTION news_reservoir_set_updated_at();

ALTER TABLE news_alias_dictionary ENABLE ROW LEVEL SECURITY;
-- 정책 없음. admin/dev 도구 (service role)에서만 수정.

COMMENT ON TABLE news_alias_dictionary IS
  '선수/팀/감독/대회의 한국어 표기 마스터. Naming Resolver가 READ-ONLY로 사용. 수정은 admin 작업.';

-- ============================================================================
-- 3) admin view: 단계별 큐 길이 (운영 모니터링용)
-- ============================================================================
CREATE OR REPLACE VIEW news_reservoir_queue_lengths AS
SELECT status, count(*) AS count
FROM news_reservoir
GROUP BY status
ORDER BY count DESC;

COMMENT ON VIEW news_reservoir_queue_lengths IS
  '단계별 reservoir 큐 길이. desk_held가 비정상적으로 크면 alias dictionary 확장이 필요한 신호.';

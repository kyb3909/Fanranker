# Fanranker News Agents

축구 뉴스 자동 수집/검수/요약/게시 newsroom 파이프라인.

## 현재 상태: Phase A — r/soccer 슬라이스
- 입력: r/soccer 1곳만
- 출력: reservoir에 `drafted` 상태로 멈춤. **자동 발행 OFF.**
- 사람이 매일 reservoir를 보고 발행 여부 결정
- 검증 후 SEO/Publisher 단계 붙이고 자동화 ON

## 무엇이 아닌가
- 단순 크롤러가 아니다 (`data/crawlers/`가 그 역할)
- 무차별 자동 발행기가 아니다

## 무엇인가
중앙 `news_reservoir` 테이블을 둘러싼 13개 에이전트 파이프라인 (Phase A는 일부만 구현). 각 에이전트는 reservoir의 status를 전이시키며 idempotent하게 동작한다.

## 디렉터리
- `docs/` — architecture-and-workflow.md, style-guide.md
- `prompts/` — 에이전트별 system prompt (model-agnostic markdown)
- `schemas/` — TypeScript 타입과 IO 계약
- `config/` — subreddits, source credibility, alias seeds, model tiers

## Phase A 포함 파일
- README.md (이 파일)
- docs/architecture-and-workflow.md
- docs/style-guide.md
- schemas/reservoir-item.ts
- schemas/alias-dictionary.ts
- config/subreddits.json (r/soccer만)
- config/source-credibility.json
- config/alias-seeds.json (~58개 시드)
- config/model-tiers.json (Anthropic 단일 벤더)
- prompts/credibility-filter.md
- prompts/korean-naming-resolver.md
- prompts/desk-reviewer.md
- prompts/summary-writer.md

## Phase B 이후 추가될 것 (지금은 없음)
- prompts/organizer, news-normalizer, tagging, social-link-collector, deduplication, assignment, seo-formatter, final-publisher
- schemas/publish-payload.ts, agent-io.ts
- docs/model-strategy.md, guardrails.md
- config/degrade-modes.json
- pipeline/ 실행 코드 (runner, stages, reservoir adapter)

## 빠른 시작 (Phase A)
1. **마이그레이션 적용** — `supabase/migrations/20260410_create_news_agents_tables.sql`
   - Supabase Studio SQL Editor에서 실행하거나 Supabase CLI 사용 (`supabase db push`)
   - 생성: `news_reservoir`, `news_alias_dictionary` 테이블 + `news_reservoir_queue_lengths` 뷰
   - `news_dedupe_cache`는 Phase B (embedding 도입 시)
2. **alias 시드 import**
   ```sh
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node data/agents/scripts/seed-aliases.js
   ```
   재실행 안전 (PK upsert).
3. 기존 `data/crawlers/core/reddit-fetcher.js`로 r/soccer 글을 가져와 reservoir에 INSERT (status=ingested)
4. `prompts/credibility-filter.md` → Haiku 호출 → 통과/탈락
5. (얇은 normalizer 코드 스텁) → normalized
6. `prompts/korean-naming-resolver.md` → Sonnet 호출 → enriched
7. `prompts/desk-reviewer.md` → Sonnet 호출 → desk_approved
8. `prompts/summary-writer.md` → Opus 호출 → drafted
9. **여기서 멈춤.** 사람이 Supabase Table Editor로 보고 검수
   - 큐 모니터링: `SELECT * FROM news_reservoir_queue_lengths;`

## 운영 원칙
- 비싼 모델은 reservoir 통과한 항목에만 사용 (writer는 desk_approved에만)
- 모든 status 전이는 audit log를 남긴다
- 사람이 검토해야 할 hold 큐는 항상 비어 있어야 정상
- alias dictionary는 시간이 지날수록 자라야 한다 (manual feedback loop)

## 통합 노트
- Reddit 수집: 기존 `data/crawlers/core/reddit-fetcher.js` 재사용
- 게시: Phase A는 dry-run. 실제 community board API 매핑은 Phase B에서
- 기존 `data/crawlers/core/summarizer.js`는 건드리지 않음. Phase B 검증 후 deprecate
- 발행 cap: 하루 30건 (USD가 아니라 건수 기준 — Phase A 안전장치)

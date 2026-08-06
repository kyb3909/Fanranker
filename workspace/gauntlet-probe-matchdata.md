# 경기 데이터·시즌 위키 실태 조사 (gauntlet-probe-matchdata)

- 조사일: 2026-08-06 · 조사관: 경기 데이터·시즌 위키 조사관
- 방법: 저장소 전수 Grep/정독 + 프로덕션 Supabase `information_schema`·행수 실측 (SELECT only)
- 표기 원칙: 증거는 `파일:라인` 또는 SQL 실측. 증거 없는 서술은 "추정:" 접두. **코드 주석은 사실로 취급하지 않음** (실제로 주석과 실측이 어긋난 사례 2건 발견 — §4, §6 참조)

---

## ① 엔티티 14종 존재 매트릭스

판정 기준: **실재** = DB에 데이터가 있고 살아있는 코드가 읽거나 씀 / **부분** = 스키마·스텁·정적 파일 등 일부만 / **없음** = 테이블도 수집·저장 코드도 없음.

| # | 개념 | 판정 | DB 실재 (실측) | 코드 타입/사용 파이프라인 | 근거 |
|---|---|---|---|---|---|
| 1 | competition | **부분·분산** | `leagues` 15행 + `league_aliases` 10행 — **레거시, 코드 참조 0** (prod 스키마 덤프 유래, id에 `betman-epl` 등) | 정본 대회 테이블 없음. 실사용 식별자는 4계열로 분산 (§3-C) | `supabase/migrations/00000000000001_prod_schema.sql:5506`; Grep `from("leagues")` 앱 코드 0히트 |
| 2 | season | **부분** | `prediction_seasons` 테이블 실재하나 **0행** | 시즌 마스터 없음. 실사용: sagas `saga_type='season'` subject.season("2026-27"), `SAGA_WINDOW_KEY="2026-summer"`(이적윈도), 네이버 seasonCode, 시즌 경계 상수 7/1 | SQL: prediction_seasons=0; `lib/saga/config.ts:7`; `lib/saga/season.ts:113-117`; `lib/standings/naver-leagues.ts:64` |
| 3 | match | **부분·이원** | live: `betman_games` **35,761행** (최신 match_time 2026-08-09) / legacy: `matches` **10행 전부 더미**(id `match1`~`match10`, 2026-01-17 정지) + `match_odds` 10행(bet365형 `fi`/`event_id` 컬럼, 동일 시점 정지) / `match_previews` **1행** | betman 파이프라인(VPS crawl + wisetoto 스코어)만 살아있음. `matches`는 코드 참조 0 | SQL 실측; Grep `from("matches")` 앱 코드 0히트; `app/api/wisetoto/sync/route.ts:114-127` |
| 4 | team | **부분·다원** | legacy `teams` 100행(2026-01-23 정지)+`team_aliases` 84행 — **코드 참조 0** / live `team_map_pins` 11행(`epl_arsenal` 형식) | 정본 팀 테이블 없음. 활성 체계만 6종 (§3-A) | Grep `from("teams")` 0히트; `team_aliases` 히트는 database.types.ts와 스키마 덤프뿐; SQL: 핀 11행 |
| 5 | player | **부분 — 마스터 테이블 없음** | DB 선수 테이블 **없음**. 대체물: `news_alias_dictionary` category='player' **910행**(표기 사전) | 정적 파일 `public/data/fpl-players.json` **820명**(EPL, name/nameKo/team/teamKo/position/price)이 사실상 스쿼드 마스터 — 시즌위키 스쿼드·드래프트 게임 공용. 사가는 `subject.player_key` 슬러그 | SQL: player alias 910; Grep `"id":` fpl json 820히트; `lib/saga/season.ts:72-85`; `lib/draft/server-players.ts` |
| 6 | article | **실재** | `posts` + `news_reservoir` 1,889행(뉴스룸 원장: raw/normalized/entities/draft/publish/audit) + `news_candidates`·`news_candidate_events`(후보 원장+상태전이) + `news_ticker_items` + `agg_reservoir`(휴면) | 뉴스룸(VPS 스캐너→검수→발행)·티커·애그리게이터 | SQL 실측; `lib/news/publish.ts` |
| 7 | story_cluster | **부분 — 키 방식, 전용 테이블 없음** | `saga_entries.cluster_key`(`player:stage:day`) + `echoes` jsonb(D9 접기) — 95엔트리/95클러스터(아직 1:1). `saga_reservoir.cluster_key`, `news_reservoir.dedupe_key` | 클러스터를 행으로 갖는 테이블 없음. URL 우선 + cluster_key 동일성으로 에코 접기 | `lib/saga/publish.ts:56-100`; SQL: entries=95, distinct cluster=95 |
| 8 | transfer_saga | **실재** | `sagas` transfer **50 active + 1 closed**, `saga_entries` 95, `saga_reservoir` 192, `saga_votes` 1, `saga_article_links` 61 | RSS→ingest→extract→HITL/자동 발행. cron: saga-ingest(30분)·saga-extract(15분)·saga-deadline(매일) | SQL 실측; `vercel.json:68-78`; `lib/saga/create.ts` |
| 9 | lineup | **없음** | 테이블 없음 | 수집 코드 0줄. Grep `lineup` 히트는 드래프트 게임(판타지 픽 보드)·문서·PRD뿐. 근접물은 legacy `matches.stats/events` jsonb(더미 10행, 죽음) | Grep 전수; `components/draft/pitch-viz.tsx`는 게임 UI |
| 10 | appearance(출전) | **없음** | 테이블 없음 | 코드 0줄. fpl json에도 출전 기록 없음(포지션·가격만) | Grep `appearance\|출전` 앱 코드 0히트 (문서·드래프트 CSV뿐) |
| 11 | match_event | **없음** (live 기준) | legacy `matches.events` jsonb만 존재(더미) | wisetoto는 **스코어만**(h_score/a_score), betman results도 스코어/결과만. ⚠️ `news_candidate_events`는 이름과 달리 **뉴스 후보 상태전이 로그**(from_state/to_state/reason_code) — 경기 이벤트 아님 | `app/api/wisetoto/sync/route.ts:110-127`; SQL: nce 컬럼 실측 |
| 12 | rating(평점) | **없음** | 테이블 없음 (`reviews`는 커미션 리뷰) | `평점\|player_rating\|match_rating` Grep — app/lib/components/scripts **0히트** (유일 히트는 `data/agent-test/generated-posts.json` 테스트 데이터) | Grep 전수 |
| 13 | settlement | **실재(베팅) / 스키마만(사가)** | `settlement_audit_log` **1,374행**(betman 정산 실가동, before/after_state) + `pending_refunds` / `saga_settlements` **0행** | betman: settle-pending cron 15분. 사가: **D15(2026-08-06 오너)로 대량 정산 취소** — 스키마만 향후 대비 유지 | SQL 실측; `vercel.json:16-18`; `docs/saga/SAGA_ENGINE_PRD.md:69` (D15) |
| 14 | wiki_revision | **없음** | 리비전/버전 테이블 없음 | "변경안 생성→검증→반영" 개념 코드에 부재. 유일한 사후 수정 문 = published-fixes PATCH의 **in-place 갱신** — 이전 값은 표기 학습(learnFromDeskEdit) 입력으로만 소비되고 **저장되지 않음** | `app/api/admin/published-fixes/route.ts:163-179, 190-207, 223-231`; 테이블 전수 목록에 revision류 없음 |

요약: 14종 중 **온전한 실재는 3종**(article, transfer_saga, settlement-베팅측). 경기 기록 계열(lineup/appearance/match_event/rating)은 **4종 전부 없음**. competition/team/player는 마스터 부재 + 식별자 분산.

---

## ② Soccerway·경기 기록·평점 현황 — 실재 vs 계획

### Soccerway 전수 (리포 전체 Grep — 정확히 5개 파일)

| 파일 | 성격 |
|---|---|
| `docs/PRD-match-preview.md` | 계획 (2026-07-27 초안) — ANALYSIS 섹션 headless 추출→드라이톤 재작성 |
| `supabase/migrations/20260727_match_previews.sql` | 구현 — 테이블(+ 비활성 게시판 `match-preview`, 봇 `user_bot_preview_kr` 시드) |
| `data/agents/scripts/preview-extract-run.js` | 구현 — Playwright headless, 앵커 `"Pre-Match Analysis:"` innerText 추출 (T0) |
| `data/agents/scripts/preview-publish-run.js` | 구현 — gpt-4.1-mini 재작성 + 도박 문구 하드가드 + posts 발행 (T1) |
| `docs/saga/SAGA_ENGINE_PRD.md:65` | **부정** — D11 "Soccerway 등 스크래핑은 ToS·유지비 문제" |

### match-preview 파이프라인 구현 정도 (PRD §7의 3단 대비)

- **map-run (리그 일정→betman 매핑→draft 생성): 미구현.** `data/agents/scripts/`에 preview-* 는 extract/publish 2본뿐. extract는 `--url=` 수동 입력으로 행을 upsert한다(`preview-extract-run.js:84-96`).
- extract-run·publish-run: 구현 완료, cron **미등록**(vercel.json에 preview 계열 없음 — PRD의 "초기 수동 실행" 원칙과 일치).
- **DB 실측: 총 1행.** 2026-07-27 MLS 뉴욕시티–토론토, status=published, post_id 있음, **game_id NULL·kickoff_at NULL** → betman 매핑은 단 한 번도 수행된 적 없음.
- **노출 동선 4개(위젯 링크·예측 카드 버튼·슬립 직후·경기 후 업데이트) 전부 미구현** — `app/`·`components/`에 `match_previews` 참조 0 (Grep 실측; "프리뷰" 히트는 링크 썸네일·saga-preview 등 무관).
- 결론: **1회 검증 발행까지 간 vertical slice 초입에서 정지.** PRD Phase 1의 성공 지표(조회수·전환) 측정 불가 상태.

### 순위표 (standings) — 실재하나 5개월 정지

- 수집: `scripts/standings-scraper.ts` — **네이버 스포츠 api-gw**(`api-gw.sports.naver.com`) 순수 fetch (Soccerway 아님, Playwright 아님 — 파일 주석 "Playwright 불필요"). 리그 15개 정의: `lib/standings/naver-leagues.ts:20-123` (EPL·라리가·분데스·세리에A·리그앙·K1·K2·KBO·MLB·NPB·KBL·WKBL·NBA·KOVO남녀).
- 저장: `POST /api/cron/standings/ingest` (CRON_SECRET) → `standings_cache` 리그당 1행 jsonb upsert (`app/api/cron/standings/ingest/route.ts:49-57`). 원시 row를 그대로 저장하고, 읽기 쪽(`lib/standings/column-map.ts:19-27`)이 한글/영문 컬럼명 후보(`팀명`/`team`/…)로 유연 매핑. **팀명 매칭 = 네이버가 준 한글 표기 그대로, 별도 정규화·ID 없음.**
- **실측: 15개 리그 전부 `fetched_at` 2026-03-11** — 오늘 기준 약 5개월 묵음. 스케줄러는 리포 어디에도 없음(vercel.json·`.github/workflows/`(ci.yml뿐) 모두 부재) → 수동 또는 리포 밖(VPS crontab) 실행이었고 3/11 이후 안 돌았다.
- 소비처: `/api/standings`(위젯), **시즌 위키 순위 헤더**(`lib/saga/season.ts:87-111` — `data[].팀명 === team_kr` 정확일치). ⚠️ season.ts:92 주석은 "시즌 전엔 **직전 시즌 최종 순위**가 남아 있으므로"라 하지만 실측 데이터는 3/11자 = **2025-26 시즌 중간 순위**다 — 주석≠사실 사례.

### 라이브 스코어 (wisetoto)

- 별도 저장 테이블 **없음** — `betman_games.home_score/away_score/status`를 직접 UPDATE (`app/api/wisetoto/sync/route.ts:114-127`).
- 경기 식별: 활성 `betman_rounds.gm_ts`(회차) × wisetoto `gm_no`(경기번호) → `(round_id, game_no)` 매칭. 즉 wisetoto 스코어는 **betman 경기와 완전히 연결**되어 있고, 그 외 어떤 경기 체계와도 연결 없음.
- 스코어 외 데이터(득점자·라인업·이벤트)는 요청도 저장도 하지 않음 (`fetchWiseTotoScores`는 h_score/a_score만 파싱).

### API-Football

- **코드 0줄.** Grep 히트는 문서 2곳뿐: `docs/saga/SAGA_ENGINE_PRD.md`(D11 결정, B1 EPIC, 리스크 "Phase B에서 플랜 확정", Open Q3)와 `docs/saga/P0_AUDIT.md:48` "미결: Q3 API-Football 예산(Phase B 전)".
- 즉 D11이 지정한 유일한 경기 데이터 공급원이 **예산 미결 + 미착수** 상태.

### MatchSaga

- 타입 계층에는 존재: `lib/saga/stages.ts:10` `SagaType = "transfer" | "match" | "season"`, identity 스텁 `match:{fixture_id}` (`lib/saga/identity.ts:38-40` — D3 그대로), slug `m-{fixture_id}` (identity.ts:77).
- **생성 코드·cron·UI 분기 없음. DB에 match 사가 0건** (실측: season 3 / transfer 51뿐). fixture_id를 공급할 소스(API-Football)가 없으니 당연한 귀결.

---

## ③ 팀·선수·대회·경기 식별 체계 전수

### A. 팀 — 서로 다른 체계 **8종** (활성 6 + 레거시 2)

| # | 체계 | 형식 예 | 상태 |
|---|---|---|---|
| 1 | legacy `teams.id` | `arsenal`, `betman-ajax` | 죽음 (2026-01-23 정지, 코드 참조 0) |
| 2 | legacy `team_aliases` | fk→teams, "Betman 축약명 등" | 죽음 (동일) |
| 3 | `team_map_pins.team_id` | `epl_arsenal` (11핀) ← `post_flairs.team_id`(6클럽)·stadium 기부 | 활성 |
| 4 | 시즌 사가 `subject.team_id` | `arsenal` (bare — **핀의 `epl_arsenal`과 형식 불일치**) + `team_kr`·`team_fpl`·`aliases[]` | 활성 (`scripts/saga-seed-seasons.ts:25-47`) |
| 5 | `betman_games.home/away_team_name` | 한글 텍스트 (ID 없음) | 활성 — 예측·정산·시즌위키 일정의 기준 |
| 6 | `standings_cache.data[].팀명` | 네이버 한글 표기 | 활성(데이터는 정지) |
| 7 | `fpl-players.json` `team`/`teamKo` | `Arsenal`/`아스널` | 활성 (정적) |
| 8 | `news_alias_dictionary` category='team' | 32행 (surfaces 매칭) | 활성 (뉴스룸 정규화) |

체계 간 조인은 전부 **한글 표기 문자열 매칭**: 시즌위키 일정 = `home_team_name.eq.{alias}` (`lib/saga/season.ts:126`), 순위 = `팀명 === team_kr` (season.ts:98), 연대기 = `headline.ilike.%{alias}%` (season.ts:183). FK로 이어진 팀 체계는 존재하지 않는다.

### B. 선수 — **3종** (+게임 콘텐츠 별도)

1. `public/data/fpl-players.json` 820명 (생성: `scripts/parse-fpl-players.mjs` + `data/fpl-korean-names.mjs`) — 시즌위키 스쿼드·드래프트 공용
2. `news_alias_dictionary` category='player' 910행 (`romanized`/`preferred_ko`/`surfaces`/`hangul_alts`) — 뉴스 표기 + 사가 canonicalize (`lib/saga/canonical.ts`)
3. 사가 `subject.player_key` — `normalizePlayerKey()` 슬러그(예: `jordan-henderson`), identity_key에 박힘 (`lib/saga/identity.ts:11-18`)
   - (별도) 드래프트 게임 CSV(`docs/draft-games-csv/`)는 게임 콘텐츠용 자체 선수 목록

1↔2 연결은 P0_AUDIT.md:23 "fpl→alias 시드 변환 1회"로 단방향 시드만. **선수 마스터 테이블은 없다.**

### C. 대회/리그 — **5종** (활성 4 + 레거시 1)

1. legacy `leagues.id` (`epl`, `betman-epl`…) — 죽음
2. `STANDINGS_LEAGUES` 상수 id (`epl`, `kleague1`…) → `standings_cache.league_id`
3. `betman_games.league_code` — **85+종 원시 코드 혼재** (실측: `EPL`·`K리그1`·`분데스리`·`EFL챔` 같은 한글 축약 + `SC001`·`BS004` 내부코드 + `UCL` 등)
4. `events.league_codes text[]` — betman 코드 재사용 (실측: `EPL|라리가|분데스리|세리에A|프리그1|UCL|UEL|UECL`)
5. `news_alias_dictionary` category='competition' 13행

### D. 경기 — **4종**

1. `betman_games.id`(uuid) + 자연키 `(round_id, game_no)` — 유일한 활성 체계 (wisetoto·정산·예측 전부 이 위)
2. legacy `matches.id` (`match1`… 더미) — 죽음. ⚠️ `betman_games`에 `mapped_match_id/mapped_home_team_id/mapped_away_team_id/mapped_league_id` 컬럼이 있으나 **35,761행 중 채워진 행 0** — 레거시 연결 시도의 화석
3. `match_previews.soccerway_mid` — 외부 soccerway mid (1행)
4. (예약) 사가 match identity `match:{fixture_id}` — API-Football fixture_id 전제, 미사용

---

## ④ 시즌 위키(실록) 현황 + 수정 이력

### 실체

- `sagas` saga_type='season' **3건**: `arsenal-2026-27` / `liverpool-2026-27` / `chelsea-2026-27` (2026-08-03 시드, `scripts/saga-seed-seasons.ts` — 3팀 하드코딩, 멱등 upsert).
- **entry_count 0 / saga_entries 0 — 설계상 정상**: "시즌 위키 — 연대기 사료로 연결만 (엔트리는 transfer 전용)" (`lib/saga/publish.ts:221-227` 코드 확인). 시즌 사가에는 엔트리를 쌓지 않는다.
- 문서 본문 = **저장물이 아니라 요청 시 조립되는 뷰** (`app/saga/[slug]/page.tsx` → `season-wiki.tsx:59-69`):
  - 순위 헤더 ← `standings_cache`(현재 3/11자 묵은 데이터, `standingIsLastSeason` 플래그로 기준일 표시)
  - 일정·결과 ← `betman_games` 한글 팀명 `.or(eq)` 매칭 + 경기단위 dedup (season.ts:119-157)
  - 스쿼드 ← fpl-players.json (season.ts:72-85)
  - 연대기(실록) ← ①transfer `saga_entries.headline ilike %팀별칭%` ②완료 경기 ③`saga_article_links` 기사 — 시간 오름차순 (season.ts:176-230)

### 지금 실제로 쌓이는 것 = saga_article_links **뿐** (실측 9건, 활발)

- 자동: 발행 훅 `linkArticleToSaga` → 이적 기사가 아니면 `linkArticleToSeasonWiki` — **시즌 사가 subject.aliases의 제목 포함(includes) 텍스트 매칭**, 첫 매칭 팀 1개만 (publish.ts:135-154, post_id PK upsert). 뉴스 발행 경로에 `after()`로 배선 (`lib/news/publish.ts:278-287`).
- 수동: 검수 화면의 사가 지정 → season 분기는 링크만 추가 (publish.ts:222-227).
- 실측 최근 링크(총 9): 8/5 리버풀 소보슬라이 인터뷰·키건 추모, 8/5 아르테타 비니시우스 링크, 8/4 소보슬라이 완장 해명, 8/4 첼시 무드리크 복귀 2건, 8/3 하베르츠 인터뷰 등 — 인터뷰·반응 사료가 의도대로 붙고 있음.
- 즉 **PRD §4.4 SeasonSaga의 섹션들(라운드별 연혁·누적 스탯·월간 리캡·이적 장부 롤업·장기 예측)은 전부 미구현**이고, 현행 시즌 위키는 "묵은 순위 + betman 일정 + 정적 스쿼드 + 텍스트 매칭 연대기"다.

### 수정 이력(리비전) — 없음. 수정 문은 published-fixes 하나

- `app/api/admin/published-fixes/route.ts` (스스로 "발행 후에 교정하는 **유일한 문**"이라 주석, 코드도 일치): 기사(title/content) · 엔트리(headline/tier) · 사가(title/player_kr)를 **in-place UPDATE**. 이전 값은 `learnFromDeskEdit`(표기 학습)에 넘겨진 뒤 소멸 — 리비전 행 없음, diff 보관 없음, 롤백 불가.
- D8(AI 작성 + 유저 제안/투표)의 "제안" 메커니즘도 미구현 — 유저 참여는 saga_votes(메인 투표)·댓글뿐.

### 수동 작성 내용을 자동화가 덮어쓸 수 있는 경로 — 2개 실재 + 1개 이론

1. **naming-audit 전역 치환 (실재, 가장 넓음)**: `app/api/cron/naming-audit/route.ts:180-192` — 교정쌍 확정 시 `saga_entries`를 **`headline ilike %표기%` 전역 검색**해 문자열 치환. 봇 기사 스코프와 무관하게 **모든 엔트리**(운영자가 published-fixes로 손본 헤드라인 포함)가 대상. 가드: 네이버 근거 fail-closed + `plausibleCorrection`(음차 차이만) + 수동 트리거(vercel.json 미등록, CRON_SECRET). 즉 "표기"에 한정된 재덮어쓰기이지만, 운영자 수정본을 다시 만질 수 있는 유일한 자동 경로.
2. **published-fixes의 앵커 동기화 (수동 문 자체의 부수효과)**: 사가 제목 수정 시 앵커 post 제목도 UPDATE (route.ts:230-232) — 앵커 글 제목을 따로 손봤다면 덮임.
3. **appendEntry upsert 레이스 (이론)**: `lib/saga/create.ts:160-175` upsert가 `onConflict:"saga_id,cluster_key", ignoreDuplicates:false` — 같은 cluster_key 재유입 시 headline/tier/origin을 덮어쓸 수 있는 원시 능력이 있다. 유일 호출자 `upsertSagaEntry`(publish.ts:60-100)가 사전 select로 URL/cluster_key 일치를 찾아 **에코로 접기** 때문에 정상 경로에선 도달 불가하나, select→upsert 사이 레이스는 막지 않는다.
4. 반대로 **sagas.title/summary는 안전**: 자동 경로(appendEntry)는 stage/entry_count/last_event_at/confirmation만 갱신 (create.ts:189-199). `getOrCreateSaga`는 기존 사가에 title을 덮지 않음(조회 즉시 반환, create.ts:45-50). 시즌 사가 summary를 갱신하는 코드는 시드 스크립트 외 전무.

---

## ⑤ D11 충돌 — 원문 대조

**docs/saga/SAGA_ENGINE_PRD.md:65 (D11, 재논의 금지 결정 로그):**
> | D11 | 경기·시즌 데이터는 크롤링이 아닌 **API** (API-Football 계열 — 라인업·이벤트·순위 필요). 크롤러는 이적설 전용 | Soccerway 등 스크래핑은 ToS·유지비 문제 |

**같은 문서 §8 가드레일 (260행):**
> | 크롤링 | 이적설 기사 수집만. robots.txt 준수, RSS 우선. 경기 데이터 스크래핑 금지 (D11) |

**docs/PRD-match-preview.md:35-39 (§3 수집 기술):**
> - Soccerway는 SPA. 데이터는 Flashscore 피드(…)와 GraphQL로 분산 — **역공학은 취약**하고 서명 변경에 깨진다.
> - 대신 **Playwright headless로 경기 페이지를 열고 렌더된 ANALYSIS 섹션의 innerText를 추출** (검증 완료: …).
> - 실행 위치: **Vultr VPS** (기존 크롤러 cron 옆).

### 대조 판정

- **시간 순서**: match-preview PRD(2026-07-27, 스크립트·테이블·발행 1건까지 착수) → 사가 PRD D11(P0 오딧 2026-08-03 전후 확정). 나중 문서가 앞 문서의 수단을 근거("Soccerway 등 스크래핑은 ToS·유지비 문제")째로 부정하지만, **match-preview PRD를 명시 폐기하는 문구는 양쪽 어디에도 없다.**
- **좁게 읽으면 양립 가능**: D11의 대상은 "경기·시즌 **데이터**(라인업·이벤트·순위)"이고 match-preview가 긁는 것은 ANALYSIS **산문 텍스트**다. 그러나 D11의 근거(ToS·유지비)는 산문 추출에도 그대로 적용되고, §8 가드레일 "경기 데이터 스크래핑 금지"와 preview의 폼·상대전적·승률 수치 추출은 정면 충돌한다.
- **겹치는 지면**: MatchSaga B2 "D-2 프리뷰 생성"(D14 — "리뷰·프리뷰는 외부 텍스트를 가져오지 않고 **데이터에서 생성**", PRD:68·101)과 match-preview(외부 텍스트 재작성)는 **같은 결과물(경기 프리뷰 글)의 경쟁 설계**다. D14를 따르면 match-preview 방식 자체가 금지 방향.
- **현실은 제3의 길**: 정작 지금 순위는 API-Football도 Soccerway도 아닌 **네이버 비공식 api-gw**로 수집(§②)되어, D11의 "순위는 API-Football 계열" 원칙과도 불일치(그마저 3/11 정지). Soccerway 파이프라인은 1건 발행 후 정지. API-Football은 예산 미결(Open Q3)·코드 0줄.
- 결론: **문서상 우선순위 미해소.** D11이 "재논의 금지"인 이상 match-preview PRD는 사실상 좌초 상태로 보이나, 폐기 선언이 없어 테이블·스크립트·봇 계정·비활성 게시판이 살아있는 채로 남아 있다. → 오너 결정 필요 항목 (§⑥).

### 참고 — 다른 문서의 경기 데이터 서술

- `docs/BETMAN_SYSTEM.md:25, 442, 574`: 경기 데이터 = 회차(gmTs) 단위 Playwright 수집 → `data/{gmTs}.json` → DB. betman 체계 내 이야기이며 라인업·평점 없음.
- `docs/PROJECT.md:297-305`: "경기 데이터 수집 (betman-sync.yml)·betman-results.yml" — **해당 GitHub 워크플로는 리포에 없음**(`.github/workflows/` 실측 ci.yml 1개). CLAUDE.md의 현행 서술(Vultr VPS cron)과 어긋나는 **낡은 문서**.

---

## ⑥ 코드만으로 판단 불가 목록

1. **Vultr VPS crontab 실태** — preview-extract/publish가 cron 등록됐는지(PRD는 "수동 실행 후 cron 전환" 계획), standings-scraper가 어디서 돌다가 3/11에 왜 멈췄는지, VPS `/opt/news-scanner`에 soccerway 관련 코드가 더 있는지. 전부 리포 밖.
2. **map-run의 존재** — 리포에는 없지만 VPS에만 작성됐을 가능성 (다만 DB의 game_id 전부 NULL이라, 있더라도 실행된 적은 없다).
3. **D11 vs match-preview의 승자** — 문서상 미해소(§⑤). match_previews 테이블·봇 계정·`match-preview` 비활성 게시판을 유지할지 폐기할지는 오너 결정.
4. **API-Football 예산(Open Q3)** — PRD·P0_AUDIT 모두 "미결". Phase B(B1 데이터 연동, 9월)의 선행 조건인데 오늘까지 결정 흔적 없음.
5. **fpl-players.json의 원천·갱신 주기** — `scripts/parse-fpl-players.mjs`+`data/fpl-korean-names.mjs`로 생성되는 것까지 확인. 입력이 FPL 공식 API 덤프인지, 이적 반영 갱신을 언제 다시 돌리는지는 리포에 기록 없음 (2026-27 스쿼드 정확도 = 시즌위키 스쿼드 정확도).
6. **standings 재가동 계획** — 시즌위키 순위 헤더가 3/11자 데이터를 "기준일" 표기와 함께 내보내는 중. 8/22 개막 전 재가동 여부는 운영 결정.
7. (교훈 기록) **주석 불신 사례 2건**: `lib/saga/season.ts:92` "직전 시즌 최종 순위" ↔ 실측은 시즌 중간(3/11) 스냅샷 / `docs/PROJECT.md:297` betman-sync.yml ↔ 워크플로 부재. 본 보고서의 판정은 전부 실측 우선.

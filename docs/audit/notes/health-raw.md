# 구조 건강 진단 원자료 (Phase 4)

- 일시: 2026-08-08 / 도구: knip, madge 8.x, ripgrep / 기준 커밋: ee06d1ea (main)
- 규칙: 모든 판정은 `상대경로:라인` 또는 도구 원출력 근거. 미확인 = ❓

## 1. 죽은 코드 (`pnpm exec knip`, exit 0)

| 카테고리 | 개수 |
|---|---|
| Unused files | 5 |
| Unused devDependencies | 1 (`@tailwindcss/typography`, package.json:90) |
| Unused exports | 41 |
| Unused exported types | 76 |
| Configuration hints | 9 (knip.json entry 패턴 다수 no-match — **knip 설정 자체가 낡아 신뢰도 주의**) |

미사용 파일 5개 전체:

| 파일 |
|---|
| components/header/gold-balance.tsx (골드 경제 숨김과 일치) |
| components/home/content-section.tsx |
| components/worldcup/worldcup-recap-board.tsx |
| lib/youtube/resolve-channel.ts |
| \_\_tests\_\_/_stubs/server-only.ts |

미사용 export 상위 30 (knip 출력 순):

| Export | 위치 |
|---|---|
| SPORT_ICONS | types/betting.ts:321 |
| TRANSFER_OUTCOMES | lib/saga/stages.ts:20 |
| buildTipTapDoc | lib/agg/publish.ts:41 |
| ASSIGNMENT_DUPLICATE_THRESHOLD 외 상수 12종 | lib/news/assignment-desk.ts:72–147 (한 파일에 13개 집중) |
| TEAM_KEYWORDS | lib/discord/news-notify.ts:26 |
| isPrivateIp | lib/ssrf-guard.ts:34 |
| useStadiumPip | components/metaverse/stadium-pip.tsx:45 |
| generateVsIssue / VS_AUTO_ON_CONFIDENCE | lib/news/vs-issue.ts:43,159 |
| NEWS_CANDIDATE_STATES | lib/news/candidate-ledger.ts:6 |
| FOOTBALL_CATEGORY_ID / FOOTBALL_SLUG / hasVisualContent | lib/news/publish.ts:40,41,351 |
| PREDICATE_VERSION | lib/soccerway/match-mapping.ts:37 |
| upsertSagaEntry / linkArticleToSeasonWiki | lib/saga/publish.ts:31,135 |
| parseFeed | lib/saga/sources/rss.ts:53 |
| FEMALE_BASIC_AVATAR_KEY / MALE_ARSENAL_AVATAR_KEY | lib/metaverse/avatar/presets.ts:72,73 |
| SPORT_ICONS / sportColorFill | components/my-predictions/prediction-types.ts:2 |
| CONTENT_FREE_PHRASES / MIN_BODY_LENGTH | lib/news/content-quality.ts:9,19 |
| fetchRelatedTransferSagas | lib/saga/season.ts:278 |
| SAGA_BOT_USER_ID | lib/saga/create.ts:19 |
| PopoverAnchor | components/ui/popover.tsx:42 |
| gandalfTexKey / gandalfIsOneShot / GANDALF_BODY_TEX / GANDALF_HAIR_TEX | lib/metaverse/avatar/gandalf-avatar.ts:94–175 |

미사용 타입 76개는 lib/news/* (assignment-desk 9개 포함), lib/saga/* 에 집중. 전체 목록은 knip 재실행으로 재현 가능.

## 2. 순환 의존 (`pnpm exec madge --circular --extensions ts,tsx .`)

```
Processed 1101 files (19.3s) (367 warnings)
✔ No circular dependency found!
```

**사이클 0개.** (367 warnings 는 madge 의 unresolved import 경고 — 사이클 아님)

## 3. 갓 파일 (ts/tsx 줄수 상위, git ls-files 기준)

| 줄수 | 파일 | 한 줄 평 |
|---|---|---|
| 6,583 | lib/supabase/database.types.ts | 자동생성 타입 — 제외 대상, 책임 논의 무의미 |
| 1,207 | lib/metaverse/scenes/side-scroller-scene.ts | Phaser 씬 1개지만 내부 메서드 57개 — 입력/렌더/네트워크 동기화 혼재 |
| 1,050 | components/post-card/post-card-content.tsx | 서브컴포넌트 6+ (썸네일·캐러셀·비디오·YouTube·X 프리뷰) — 미디어 렌더러 팩토리가 카드 안에 내장 |
| 1,024 | app/season/page.tsx | 페이지 1개 + 내부 섹션 9블록 — 시즌 이벤트 전체를 단일 RSC에 |
| 949 | scripts/seed-bot-content.ts | 시드 스크립트 — 운영 코드 아님 |
| 860 | app/admin/news-review/fast-review.tsx | 검수 UI 단일 컴포넌트에 키보드 단축키·큐 상태·발행 액션 결합 |
| 858 | scripts/vps-betman-scraper.ts | VPS 스크립트 — 프로빙/파싱/재시도 혼재하나 배포 단위가 파일 1개라 의도적 |
| 852 | \_\_tests\_\_/lib/draft/engine.test.ts | 테스트 — 허용 |
| 812 | lib/metaverse/scenes/indoor-map-scene.ts | 데이터 기반 맵 씬 — 타일·충돌·전환 |
| 781 | components/draft/multi-draft-result.tsx | 서브컴포넌트 6개 (TeamDetail/ScoreCard/ScoreBar…) — 결과 화면 전용 묶음, 응집도는 있음 |
| 764 | components/draft/multi-draft-board.tsx | 드래프트 보드 UI+상태 |
| 757 | components/draft/draft-board.tsx | multi-draft-board 와 유사 구조 (중복 의심 — §9 외 추가 후보) |
| 745 | app/api/betman/prediction/route.ts | POST+GET 2 핸들러뿐인데 745줄 — 검증·차감·통계 로직이 라우트에 인라인 |
| 741 | tests/audit/full-app-audit.spec.ts | 감사 하네스 — 허용 |
| 736 | components/metaverse/highbury-stage.tsx | Realtime 채널·프레즌스·렌더 결합 |
| 734 | lib/metaverse/scenes/world-map-scene.ts | 월드맵 씬 |

## 4. 역방향 의존 (lib/ → app/ import)

`from "@/app` grep (lib/ 전수): **0건** ✅

## 5. 에러 삼킴

### 5a. 빈 catch 블록 (`catch {}` / 주석만 있는 catch)
- 완전히 빈 인라인 `catch {}`: **0건**
- 주석만 있는 catch: **56건 / 40파일** — 전수 확인 결과 **전부 주석 부착 = 의도적 best-effort**. 무단 삼킴 0건.

대표 (전수는 grep `catch\s*(\([^)]*\))?\s*\{\s*(//..)?\s*\}` multiline 로 재현):

| 위치 | 주석 | 분류 |
|---|---|---|
| lib/cron/log-run.ts:49 | "로그 기록 실패는 무시 — cron 본 동작 보호" | 의도적 |
| lib/tiptap/sanitize.ts:125 | "drop" | 의도적 |
| app/api/posts/route.ts:377 | "revalidate 실패는 응답에 영향 없음" | 의도적 |
| app/sitemap.ts:55 | "실패 시 정적 페이지만 반환" | 의도적 |
| hooks/use-post-card-actions.ts:126 | "non-critical" | 의도적 |
| app/admin/notes/page.tsx:29,52,70,88 | "silent" ×4 | 의도적이나 **어드민 저장 실패가 UI에 무표시** — 유일한 UX 우려 지점 |
| components/my-predictions/prediction-history.tsx:61 | "predictions list will show empty" | 의도적 |
| (외 33파일 동일 패턴) | | |

### 5b. `.catch(() => {})` — 총 57건 (앱 코드 29 + tests/scripts 28)

앱 코드 29건 분류 (각 파일 열어 확인):

| 위치 | 맥락 | 분류 |
|---|---|---|
| lib/betman/result-fetcher.ts:43 / game-fetcher.ts:107 | "세션 확보용 사전 호출 (실패 무시)" 주석 | 의도적 |
| app/api/wisetoto/sync/route.ts:68,91,139 | sync_live_room_status RPC 보조 갱신 | 의도적 (주석 有) |
| app/api/cron/news-auto-publish/route.ts:252, news-comment-reports/route.ts:169, saga-extract/route.ts:165, season-chicken-draw/route.ts:185 | Discord 알림 fire-and-forget | 의도적 (주석 無 — 알림 실패 관측 불가는 감수한 설계) |
| hooks/use-betting-community-stats.ts:48, use-draft-room-game.ts:131,139 | 통계/재접속 신호 fetch | 의도적 best-effort |
| components/* 12건 (user-menu:31, board-follow:21, poll-widget:40, main-vote:53, community-content:113, card-news-feed:265, worldcup-recap-board:49, metaverse 6건) | 뷰 카운트·채널 disconnect 정리 | 의도적 best-effort |
| lib/metaverse/realtime/{sidescroll-channel:64, server-broadcast:52} | removeChannel 정리 | 의도적 |
| lib/tiptap/extensions/embed-paste.ts:279 | 붙여넣기 임베드 해석 실패 | 의도적 |
| app/sign-up/[[...sign-up]]/page.tsx:427, app/dev/saga-preview/[slug]/vote-card.tsx:41 | 계측/개발 프리뷰 | 의도적 |

**판정: 무단 삼킴(주석·맥락 모두 없는 침묵) 0건. 다만 Discord ops 알림 4곳은 실패가 어디에도 기록되지 않아 "알림 시스템 자체가 죽어도 모름" 구조** (app/api/cron/news-auto-publish/route.ts:252 등).

## 6. 경계 침범 (클라이언트 ↔ 시크릿)

- `SUPABASE_SERVICE_ROLE` / `lib/supabase/admin` 참조 37파일 전수 → 전부 서버 전용(app/api routes, app/admin 서버파일, lib 서버모듈, scripts, tests). `"use client"` 파일 교집합: **0건** ✅
  - app/admin/event/actions.ts 는 `"use server"` :1, app/admin/layout.tsx 는 RSC (지시어 없음)
- `"use client"` 파일 중 `process.env` 참조: 3건 — 전부 `NODE_ENV` 만 (components/pwa-register.tsx:20, app/lounge/page.tsx:17, app/metaverse/uk/layout.tsx:8. 뒤 2개는 실제로는 지시어 없는 서버 파일, 본문에 "use client" 문자열 포함) ✅
- components/ · hooks/ 디렉토리에서 supabase/server·admin import: **0건** ✅
- lib/supabase/server.ts:19 의 "use client" 는 주석 문구 (오탐 아님 확인)

## 7. 결합도 — 핵심 테이블 폭발 반경 (`.from("…")` 참조)

| 테이블 | 참조 파일 수 | 총 호출 수 | 스키마 변경 시 영향 |
|---|---|---|---|
| posts | **63** | 103 | 앱 전역 — 라우트 30+, 페이지 10+, lib 8, cron 11 |
| betman_predictions | 25 | 42 | 정산·통계·어드민 |
| news_reservoir | 21 | 41 | 뉴스 파이프라인 + 어드민 |

posts 참조 상위 (호출 수 기준): app/api/posts/[id]/route.ts:5회, app/api/admin/published-fixes/route.ts:5, lib/feed/cardnews.ts:4, app/api/posts/[id]/notice/route.ts:4, app/page.tsx:3, app/explore/page.tsx:3, app/admin/page.tsx:3, app/admin/content/posts/route.ts:3, scripts/rehost-post-images.ts:3 … (전수 63파일은 grep `\.from\("posts"\)` 재현)

betman_predictions 상위: app/api/betman/prediction/route.ts:5, lib/betman/settle.ts:3, lib/ga4/fetch-weekly-report.ts:3, app/api/cron/ops-monitor/route.ts:3, app/admin/page.tsx:3 …

news_reservoir 상위: app/api/cron/news-auto-publish/route.ts:5, app/api/cron/news-interest-filter/route.ts:5, app/api/admin2/dashboard/route.ts:3, app/api/admin/news-review/route.ts:3, app/api/news/agent-draft/route.ts:3 …

**수치 요약: posts 컬럼 하나 바꾸면 63개 파일 검토 대상.** 리포지토리 계층 없이 라우트가 직접 쿼리하는 구조.

## 8. 인증 누락 — cron 라우트

app/api/cron/**/route.ts 33개 전수 (중첩 standings/ingest 포함):

| 결과 | 개수 |
|---|---|
| verifyCronSecret 호출 확인 | **33 / 33** ✅ |
| 누락 | 0 |

(app/api/cron/standings/ingest/route.ts:24 포함. app/api/wisetoto/sync 은 cron 디렉토리 밖이라 범위 외 — vercel.json cron 대상이므로 별도 확인 권장 ❓)

## 9. 중복 로직 후보

| 후보 | 조사 결과 | 판정 |
|---|---|---|
| 온도 계산 | TS: lib/temperature.ts:68 `computeTemperature` (app/post/[id]/page.tsx 에서 사용) vs SQL: `update_active_post_temperatures` RPC (supabase/migrations/00000000000001_prod_schema.sql, cron app/api/cron/update-temperatures/route.ts:22 호출) | **이중 구현 (TS+SQL)** — 공식 변경 시 두 곳 동기화 필요. TS쪽은 표시용, SQL쪽은 배치용으로 역할은 분리 |
| 정산 | 코어 `settlePredictions` 단일 (lib/betman/settle.ts:148). settle-sweep.ts:95, api/betman/settle/route.ts:136, api/predictions/settle/route.ts:180, cron/settle-pending 모두 재사용 | 중복 아님 ✅ |
| KST 변환 (`9*3600`/`9*60*60`) | **31건 / 21파일** 인라인 산술 (lib/betman/daily-round.ts:22,40,115 · lib/saga/cluster.ts:85 · app/transfer/transfer-client.tsx:26,27,36 · app/api/cron/news-auto-publish/route.ts:83,85 등). 공용 util 없음 | **중복 확정** — kstDay 류 헬퍼가 lib/saga/cluster.ts:84, app/api/cron/saga-extract/route.ts:42 등에 사본으로 존재 |
| 제목 유사도 | 구현 2개: lib/ops/title-similarity.ts:35 `bigramTitleSimilarity` (invariant-audit 사용) vs lib/saga/cluster.ts:66 `titleSimilarity` 토큰 Jaccard (news-auto-publish:393, assignment-desk:417 사용) | **이중 구현** — 알고리즘·임계값 다름(0.35 vs DUP_SUSPECT_MIN). 같은 "중복 기사 탐지" 목적에 감사용/발행용이 서로 다른 잣대 |
| (부수 발견) 드래프트 보드 | components/draft/draft-board.tsx(757줄) vs multi-draft-board.tsx(764줄) 구조 유사 | 후보만 기록 ❓ (본문 대조 미수행) |

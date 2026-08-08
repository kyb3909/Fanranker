# 코드베이스 전수 인벤토리 (Phase 0)

> 작성: 2026-08-08 아키텍처 감사 Phase 0. 모든 항목은 실제 파일/DB 확인 기준, 근거 경로 병기.
> 확인 못 한 항목은 ❓ 표시.

## 요약

| 항목 | 개수 | 근거 |
|---|---|---|
| 페이지 라우트 (`page.tsx`) | 99 | `app/**/page.tsx` Glob |
| API 라우트 (`route.ts`) | 221 | `app/api/**/route.ts` Glob |
| 마이그레이션 파일 | 63 | `supabase/migrations/` (+ `migrations-backup/` 별도) |
| 마이그레이션 내 CREATE TABLE (유니크) | 167 | grep `CREATE TABLE` |
| 라이브 DB public 테이블 | 161 | `information_schema.tables` 실측 (2026-08-08) |
| Vercel cron | 27 | `vercel.json` |
| pg_cron 잡 (DB에만 존재) | 6 | `docs/PG_CRON_JOBS.md` (2026-08-06 실측 기록) |
| Supabase Edge Function | 1 (`betman-sync-watchdog`, 리포에 소스 없음) | `docs/PG_CRON_JOBS.md` |
| 자체 package.json 서브 패키지 | 3 (`data/agents`, `data/crawlers`, `data/agent-test`) | find package.json |

---

## 1. 디렉토리 지도

### 최상위

| 디렉토리 | 설명 (실제 내용 기준) |
|---|---|
| `app/` | Next.js 15 App Router — 페이지 45개 세그먼트 + `api/` + `robots.ts`/`sitemap.ts`/`opengraph-image.tsx` |
| `components/` | 기능별 React 컴포넌트 (admin, betting, draft, home, metaverse, saga, stadium, ui …) |
| `hooks/` | 공용 훅 30개 (use-feed, use-betting-*, use-draft-room-*, use-comments …) |
| `lib/` | 도메인 로직·클라이언트 (supabase, betman, saga, news, metaverse, middleware, moderation …) |
| `data/` | VPS 배포용 셸 스크립트 사본 + 서브패키지(agents/crawlers/agent-test) + 원시 데이터 파일 |
| `docs/` | 운영/PRD/아키텍처 문서 (PROJECT.md, BETMAN_SYSTEM.md, OPERATIONS.md, PG_CRON_JOBS.md, saga/, gauntlet/ …) |
| `scripts/` | tsx/node CLI 56개 (betman-*, saga-*, seed-*, standings-*, avatar 에셋 도구 …) |
| `supabase/` | `migrations/` 63개 + `migrations-backup/` + `snippets/` + `config.toml`. **`functions/` 없음** |
| `__tests__/` | Vitest 단위 테스트 |
| `e2e/` | Playwright 스모크/회귀 (`playwright.config.ts`) |
| `tests/` | `audit/` (프로덕션 BFS 감사 하니스) + `e2e/` (여정 테스트, `playwright.e2e.config.ts`) |
| `public/` | 정적 자산 (`map/` 픽셀아트 지도, `games/*.html` 미니게임 등) |
| `types/` | 공용 타입 (betting 등) |
| `styles/` | 스타일 보조 |
| `workspace/` | 작업 노트/리포트 (커밋되는 스크래치) |
| `design-references/`, `design_handoff_minimal_sport/` | 디자인 참고 자료 |
| `aseprite-mcp/`, `avatar-pro/`, `avatar-pro-xl/` | 아바타/에셋 도구 관련 (감사 범위 외 보조) ❓세부 미확인 |
| 루트 산재 파일 | 스크린샷 png/csv/md 다수 (`ERROR.jpg`, `wembley.png`, `가오픈_준비.md` 등) — 리포 위생 이슈 후보 |

### 주요 2단계

- `app/`: `about, admin(31p), admin2(5p), api(221r), cardnews, community, content-policy, design-demo, design-preview, dev, explore, games, login-link, lounge, metaverse, my-posts, my-predictions, onboarding, payments, post, prediction, privacy, profile, saga, search, season, settings, share, shop, sign-up, snack, sso-callback, stadium, terms, transfer, worldcup, write` (근거: `ls app`)
- `lib/`: `admin, agg, analytics, api, betman, comments, constants, cron, discord, draft, embed, event, feed, ga4, image(s), metaverse, middleware, moderation, naming, news, ops, portone, predictions, saga, soccerway, stadium, standings, supabase, tiptap, transfer, utils, worldcup, youtube` + 단일 파일(env.ts, rate-limit.ts, temperature.ts, sanitize-embed.ts, ssrf-guard.ts, cron-auth.ts, discord-notify.ts …)
- `components/`: `admin, analytics, battle, betting, cardnews, community, creator, draft, editor, games, header, home, legal, metaverse, my-predictions, news-talk, post-card, post-detail, prediction, profile, saga, season, shop, sidebar, sign-up, stadium, sticker, ui, worldcup, write` + 앱셸/공용 단일 컴포넌트
- `data/`: `agents/`(뉴스룸 멀티에이전트, 자체 pkg), `crawlers/`(Reddit+Naver, 자체 pkg), `agent-test/`(자체 pkg), VPS 셸 사본(`sync-v2.sh, sync-v3.sh, fetch-results.sh, wisetoto-sync-scores.sh, betman-integrity-check.sh, deploy-vps.sh`), 원시 json/csv
- `docs/`: `agents/, architecture/, audit/, design-prompts/, design-review-2026-07-27/, draft-games-csv/, evidence/, gauntlet/, harness/, refactor/, saga/` + 문서 40여 개

---

## 2. 페이지 라우트 전수 (99개)

설명은 각 파일 상단(~14줄) 실독 기준.

### 공개/코어

| URL | 파일 | 설명 |
|---|---|---|
| `/` | `app/page.tsx` | 홈 (Server Component, ISR 300s, 카드뉴스 히어로+피드+경기) |
| `/explore` | `app/explore/page.tsx` | 게시판 둘러보기("운동장", ISR 60s, 오늘 글 집계) |
| `/community/[slug]` | `app/community/[slug]/page.tsx` | 게시판 상세 (뉴스 티커 + 피드 + 사이드바) |
| `/community` | `app/community/page.tsx` | → `/explore` 리다이렉트 (안전망) |
| `/post/[id]` | `app/post/[id]/page.tsx` | 게시글 상세 (SSR TipTap 렌더 + 댓글 + VS폴 + jsonLd) |
| `/write` | `app/write/page.tsx` | 글쓰기 (TipTap 에디터, 클라이언트) |
| `/search` | `app/search/page.tsx` | 통합 검색 (클라이언트) |
| `/share` | `app/share/page.tsx` | "지금 뜨는 토픽" 공유 페이지 |
| `/snack` | `app/snack/page.tsx` | 떡밥 피드 (풀스크린 카드, force-dynamic) |
| `/cardnews` | `app/cardnews/page.tsx` | 홈 카드뉴스 교체 전 테스트 페이지 (noindex) |
| `/transfer` | `app/transfer/page.tsx` | 이적시장 상황판 (오피셜/유력/찌라시 타임라인) |
| `/saga` | `app/saga/page.tsx` | 이적 사가 목록 ("살아있는 이적설 문서") |
| `/saga/[slug]` | `app/saga/[slug]/page.tsx` | 사가 상세 (연표 + 메인 투표 + 댓글 + 시즌 위키) |
| `/prediction` | `app/prediction/page.tsx` | 승부예측 메인 (ISR 300s, 경기/슬립은 클라 fetch) |
| `/my-predictions` | `app/my-predictions/page.tsx` | 내 예측 기록 |
| `/my-posts` | `app/my-posts/page.tsx` | 내가 쓴 글 (클라이언트) |
| `/profile/[id]` | `app/profile/[id]/page.tsx` | 프로필 (본인=설정 뷰, 타인=공개 뷰 분기) |
| `/settings` | `app/settings/page.tsx` | 프로필 페이지로 리다이렉트 |
| `/payments` | `app/payments/page.tsx` | 토큰 거래 내역/충전 탭 (클라이언트) |
| `/shop` | `app/shop/page.tsx` | 상점 (스티커·칭호·픽셀아트) |
| `/season` | `app/season/page.tsx` | 시즌 이벤트 허브 (카운트다운·팀픽·주간 추첨) |
| `/about` | `app/about/page.tsx` | 서비스 소개 (정적) |
| `/privacy` | `app/privacy/page.tsx` | 개인정보처리방침 (정적) |
| `/terms` | `app/terms/page.tsx` | 이용약관 (정적) |
| `/content-policy` | `app/content-policy/page.tsx` | 게시물 운영정책 (정적) |

### 인증/온보딩

| URL | 파일 | 설명 |
|---|---|---|
| `/sign-up/[[...sign-up]]` | `app/sign-up/[[...sign-up]]/page.tsx` | 커스텀 Clerk 가입 (UTM 귀속·퍼널 이벤트 포함) |
| `/onboarding` | `app/onboarding/page.tsx` | → `/sign-up` 리다이렉트 |
| `/sso-callback` | `app/sso-callback/page.tsx` | Clerk SSO 리다이렉트 콜백 |
| `/login-link` | `app/login-link/page.tsx` | Clerk sign-in token(ticket) 원클릭 로그인 (관리자 발급) |

### 게임

| URL | 파일 | 설명 |
|---|---|---|
| `/games` | `app/games/page.tsx` | 게임 허브 |
| `/games/draft` | `app/games/draft/page.tsx` | 드래프트 게임 선택 화면 |
| `/games/draft/arsenal` | `app/games/draft/arsenal/page.tsx` | 아스날 레전드 드래프트 (싱글) |
| `/games/draft/epl` | `app/games/draft/epl/page.tsx` | EPL FPL 드래프트 (싱글) |
| `/games/draft/epl/rooms` | `app/games/draft/epl/rooms/page.tsx` | 공개 멀티 드래프트 방 목록 |
| `/games/draft/epl/room/[id]` | `app/games/draft/epl/room/[id]/page.tsx` | 멀티 드래프트 대기방 (join 처리) |
| `/games/draft/epl/room/[id]/play` | `.../play/page.tsx` | 멀티 드래프트 진행 보드 |
| `/games/draft/epl/room/[id]/result` | `.../result/page.tsx` | 멀티 드래프트 결과 |
| `/games/corner-hero` | `app/games/corner-hero/page.tsx` | 코너킥 히어로 (iframe `/games/corner-hero.html` + 리더보드) |
| `/games/pass-survivor` | `app/games/pass-survivor/page.tsx` | 패스 서바이버 (iframe + 리더보드) |
| `/games/rondo` | `app/games/rondo/page.tsx` | 론도 (iframe + 리더보드) |

### 스타디움/메타버스

| URL | 파일 | 설명 |
|---|---|---|
| `/stadium` | `app/stadium/page.tsx` | 경기장 월드 (팀 경기장 키우기) |
| `/stadium/[teamId]` | `app/stadium/[teamId]/page.tsx` | 팀 경기장 방 (ISR 30s) |
| `/stadium/map/[region]` | `app/stadium/map/[region]/page.tsx` | 지역별 픽셀아트 지도 |
| `/stadium/chat-preview` | `app/stadium/chat-preview/page.tsx` | Phaser StadiumChatScene 개발 프리뷰 |
| `/metaverse` | `app/metaverse/page.tsx` | 국가 선택 — prod 는 `/metaverse/highbury` 로 강제 리다이렉트 |
| `/metaverse/highbury` | `app/metaverse/highbury/page.tsx` | 하이버리 스타디움 (PIP 바인딩, 상주 스테이지) |
| `/metaverse/prototype` | `app/metaverse/prototype/page.tsx` | 프로토타입 검증용 (게스트 진입, noindex) |
| `/metaverse/interior-demo` | `app/metaverse/interior-demo/page.tsx` | 사이드스크롤러 실내 씬 데모 (noindex) |
| `/metaverse/uk` | `app/metaverse/uk/page.tsx` | UK 월드맵 (클라이언트 이미지 맵 — 월드맵 체인 폐기 방향) |
| `/lounge` | `app/lounge/page.tsx` | 팬 라운지 (Phaser, 하이버리 통일 결정 반영) |

### 월드컵 이벤트

| URL | 파일 | 설명 |
|---|---|---|
| `/worldcup` | `app/worldcup/page.tsx` | 이벤트 랜딩 (참가 CTA + 룰 모달) |
| `/worldcup/register` | `app/worldcup/register/page.tsx` | 참가 신청 |
| `/worldcup/register/done` | `app/worldcup/register/done/page.tsx` | 신청 완료 (Gooner 그룹 안내) |
| `/worldcup/games` | `app/worldcup/games/page.tsx` | 월드컵 경기 예측 (BettingPage lazy) |
| `/worldcup/leaderboard` | `app/worldcup/leaderboard/page.tsx` | 리더보드 |
| `/worldcup/my-predictions` | `app/worldcup/my-predictions/page.tsx` | 내 월드컵 예측 (noindex) |
| `/worldcup/result` | `app/worldcup/result/page.tsx` | 결과 발표 (podium) |

### 관리자 `/admin` (31개, requireAdmin 레이아웃)

| URL | 파일 | 설명 |
|---|---|---|
| `/admin` | `app/admin/page.tsx` | 대시보드 (KPI·시스템 상태·크롤러·알림) |
| `/admin/operations` | `app/admin/operations/page.tsx` | 운영 모니터링 + 데이터 정합성 경보 |
| `/admin/system` | `app/admin/system/page.tsx` | 시스템 상태 (cron 모니터·크롤러 이력·큐 백로그) |
| `/admin/analytics` | `app/admin/analytics/page.tsx` | 주간 분석 리포트 |
| `/admin/stats` | `app/admin/stats/page.tsx` | 예측 통계 (SWR 클라이언트) |
| `/admin/users` | `app/admin/users/page.tsx` | 사용자 목록 |
| `/admin/users/[userId]` | `app/admin/users/[userId]/page.tsx` | 사용자 상세 탭 |
| `/admin/experts` | `app/admin/experts/page.tsx` | 전문가 인증 관리 |
| `/admin/matches` | `app/admin/matches/page.tsx` | 경기 관리 (betman 일정표 + 전체 목록) |
| `/admin/settlements` | `app/admin/settlements/page.tsx` | 예측 정산 처리 |
| `/admin/refunds` | `app/admin/refunds/page.tsx` | 환불 큐 |
| `/admin/tokens` | `app/admin/tokens/page.tsx` | 토큰 경제 모니터링 |
| `/admin/event` | `app/admin/event/page.tsx` | 월드컵 이벤트 운영 콘솔 (league_codes/status 액션) |
| `/admin/news-review` | `app/admin/news-review/page.tsx` | 뉴스 검수 정본 (사가 검수 + 발행 후 교정 + 표기사전 후보 통합) |
| `/admin/team-dictionary` | `app/admin/team-dictionary/page.tsx` | 팀 사전 + betman↔Soccerway 경기 매핑 (실록 2-B) |
| `/admin/saga-review` | `app/admin/saga-review/page.tsx` | → `/admin/news-review` 리다이렉트 (2026-08-04 통합) |
| `/admin/agg-review` | `app/admin/agg-review/page.tsx` | AI 커뮤글 검수 |
| `/admin/agg-training` | `app/admin/agg-training/page.tsx` | AI 글 학습 엔트리 관리 |
| `/admin/notes` | `app/admin/notes/page.tsx` | 관리자 메모 (클라이언트 CRUD) |
| `/admin/content/posts` | `app/admin/content/posts/page.tsx` | 게시글 관리 (attachNicknames 우회) |
| `/admin/content/comments` | `app/admin/content/comments/page.tsx` | 댓글 관리 |
| `/admin/content/reports` | `app/admin/content/reports/page.tsx` | 신고 큐 |
| `/admin/content/metaverse-reports` | `.../metaverse-reports/page.tsx` | 메타버스 신고 큐 |
| `/admin/content/boards` | `app/admin/content/boards/page.tsx` | 카테고리(게시판) 관리 |
| `/admin/content/moderators` | `.../moderators/page.tsx` | 게시판 MOD 지정 |
| `/admin/content/notices` | `app/admin/content/notices/page.tsx` | 게시판 일괄 공지 등록 |
| `/admin/content/banners` | `app/admin/content/banners/page.tsx` | 배너 관리 |
| `/admin/content/polls` | `app/admin/content/polls/page.tsx` | 폴 생성/노출 관리 |
| `/admin/content/stickers` | `app/admin/content/stickers/page.tsx` | 스티커 승인 |
| `/admin/content/ticker` | `app/admin/content/ticker/page.tsx` | 뉴스 티커 관리 + 크롤러 상태 |
| `/admin/content/newsroom` | `app/admin/content/newsroom/page.tsx` | 뉴스룸 큐 열람 (data/agents 산출) |

### 운영 작업대 `/admin2` (5개, requireStaff 레이아웃 — editor 허용)

| URL | 파일 | 설명 |
|---|---|---|
| `/admin2` | `app/admin2/page.tsx` | 운영 작업대 (Workbench + 인사이트 + 채널 퍼널) |
| `/admin2/news` | `app/admin2/news/page.tsx` | `/admin/news-review` 화면 재사용 래퍼 (같은 컴포넌트 공유) |
| `/admin2/agg` | `app/admin2/agg/page.tsx` | `/admin/agg-review` 재사용 래퍼 |
| `/admin2/reports` | `app/admin2/reports/page.tsx` | `/admin/content/reports` 재사용 래퍼 |
| `/admin2/saga` | `app/admin2/saga/page.tsx` | → `/admin2/news` 리다이렉트 |

### 개발/프리뷰 전용

| URL | 파일 | 설명 |
|---|---|---|
| `/design-demo` | `app/design-demo/page.tsx` | 디자인 데모 (레이아웃이 prod 차단) |
| `/design-demo/feed-typography` | `.../feed-typography/page.tsx` | 피드 타이포그래피 데모 (하드코딩 데이터) |
| `/design-demo/success-modal` | `.../success-modal/page.tsx` | 예측 완료 모달 검증 하니스 |
| `/design-preview` | `app/design-preview/page.tsx` | 담벼락 디자인 개선안 프리뷰 (실데이터, GNB 미노출) |
| `/dev/galdcup` | `app/dev/galdcup/page.tsx` | 갈드컵 댓글 공방 목업 (전부 하드코딩, **untracked**) |
| `/dev/saga-preview/[slug]` | `app/dev/saga-preview/[slug]/page.tsx` | 사가 상세 리디자인 프리뷰 (실데이터·실투표, **untracked**) |

---

## 3. API 라우트 전수 (221개)

메서드는 각 파일의 `export function/const GET|POST|…` grep 실측. 역할은 파일 상단 주석/경로 기준.

### posts / comments / feed

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/posts` | GET,POST | 피드 조회 + 글 작성 (공지 게이트, OG 출처) |
| `/api/posts/[id]` | GET,PATCH,DELETE | 글 단건 조회/수정/삭제 |
| `/api/posts/[id]/vote` | GET,POST | 글 투표 |
| `/api/posts/[id]/bookmark` | GET,POST | 북마크 토글 |
| `/api/posts/[id]/view` | POST | 조회수 기록 (ip_hash distinct) |
| `/api/posts/[id]/notice` | GET,PATCH | 전체 공지 지정 (admin 전용) |
| `/api/posts/hot-alerts` | GET | 인기글 알림 |
| `/api/posts/my` | GET | 내 글 목록 |
| `/api/comments` | GET,POST | 댓글 조회/작성 (비밀댓글 role 검증) |
| `/api/comments/[id]` | PATCH,DELETE | 댓글 수정/삭제 |
| `/api/comments/[id]/vote` | POST | 댓글 투표 |
| `/api/bookmarks` | GET | 내 북마크 목록 |
| `/api/feed/cardnews` | GET | 카드뉴스 피드 (비로그인 공개) |
| `/api/feed/snack` | GET | 떡밥 피드 카드 (비로그인 공개) |
| `/api/feed/predictions` | GET | 예측 피드 (배당률 버킷화) |
| `/api/search` | GET | 통합 검색 |
| `/api/categories` | GET | 게시판 카테고리 목록 |
| `/api/flairs` | GET | 게시판별 말머리 목록 |
| `/api/flair-prefs` | GET,POST | 말머리 즐겨찾기/뮤트 |
| `/api/flair/donate` | POST | flair 점수 → 팀 경기장 기부 RPC |
| `/api/topic-share` | GET | 게시판 최근 글 제목 기반 토픽 |
| `/api/reports` | POST | 콘텐츠 신고 (중복 방지) |

### community / users / profile / follow

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/community/[slug]/follow` | GET,POST,DELETE | 게시판 팔로우 |
| `/api/community/[slug]/notice` | GET | 게시판 공지 |
| `/api/community/[slug]/ticker` | GET | 게시판 뉴스 티커 |
| `/api/community/follows` | GET | 내 팔로우 게시판 |
| `/api/community/popular` | GET | 인기 게시판 |
| `/api/profile/me` | GET,PATCH,DELETE | 내 프로필 (온보딩 쿠키 동기화 포함) |
| `/api/profile/me/titles` | GET | 내 호칭 잠금/해제 목록 |
| `/api/profile/me/display-title` | POST | 표시 호칭 설정 |
| `/api/profile/[userId]` | GET | 공개 프로필 (display_title + flair top) |
| `/api/profile/check-nickname` | GET | 닉네임 중복 확인 |
| `/api/users/[id]/follow` | GET,POST | 유저 팔로우 (기자 한정 정책) |
| `/api/users/block` | GET,POST | 유저 차단 |
| `/api/users/experts` | GET | 전문가 목록 |
| `/api/follow` | GET,POST | 팔로우 통합 |
| `/api/notifications` | GET,PATCH | 알림 조회/읽음 |
| `/api/attribution` | POST | 가입 최초터치 채널 원장 기록 |

### betman / predictions (승부예측)

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/betman/games` | GET,POST | 경기 목록 조회 / VPS 경기 등록 |
| `/api/betman/prediction` | GET,POST | 슬립 제출/조회 (홀짝 중단, 이벤트 슬립 지원) |
| `/api/betman/results` | POST | 결과 수신 (VPS) |
| `/api/betman/scores` | POST | 스코어 수신 |
| `/api/betman/settle` | POST | 정산 실행 |
| `/api/betman/round` | POST | 회차 등록 |
| `/api/betman/rankings` | GET | 랭킹 |
| `/api/betman/my-stats` | GET | 내 예측 통계 |
| `/api/betman/community-stats` | GET | 커뮤니티 통계 (이벤트 슬립 제외) |
| `/api/betman/pending-results` | GET | 미결과 경기 |
| `/api/betman/expire-pending` | POST | 만료 pending 처리 |
| `/api/betman/stats/recalculate` | POST | 통계 재계산 |
| `/api/betman/sync-state` | GET,POST | VPS 동기화 상태 |
| `/api/betman/manual-sync` | POST | 수동 동기화 트리거 |
| `/api/betman/unknown-games` | POST | 미매핑 경기 업서트 |
| `/api/predictions/my` | GET | 내 예측 (구 matches 계열) |
| `/api/predictions/purchase` | POST | 예측 구매 |
| `/api/predictions/settle` | GET,POST | 예측 정산 |
| `/api/wisetoto/sync` | GET | 라이브 스코어 동기화 (rewrite `/api/live-scores/*`) |
| `/api/standings` | GET | 리그 순위표 (ISR 5분) |
| `/api/rankings` | GET | 종합 랭킹 |

### 경제 (tokens / gold / points / payments)

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/tokens/balance` | GET | 볼 잔액 |
| `/api/tokens/history` | GET | 볼 거래 내역 |
| `/api/tokens/spend` | POST | 볼 차감 (`spend_tokens` RPC) |
| `/api/gold/balance` | GET | 골드 잔액 |
| `/api/gold/history` | GET | 골드 내역 |
| `/api/gold/reward` | POST | 골드 보상 (허용 타입/상한 검증) |
| `/api/points/` | GET | 보드 포인트 |
| `/api/points/history` | GET | 포인트 내역 |
| `/api/payments/purchase` | GET,POST | 포트원 결제 구매 |

### shop / titles / stickers / pixel-art

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/stickers` | GET,POST | 스티커 목록/업로드 |
| `/api/stickers/[id]` | POST | 스티커 투표 등 액션 |
| `/api/stickers/my` | GET | 내 스티커 |
| `/api/stickers/packs` | GET | 스티커 팩 |
| `/api/titles/my` | GET | 내 칭호 |
| `/api/titles/display` | GET | 유저들 표시 칭호 배치 조회 |
| `/api/titles/equip` | POST | 칭호 장착 |
| `/api/titles/noun` | GET | 명사 칭호 목록 |
| `/api/titles/noun/purchase` | POST | 명사 칭호 구매 |
| `/api/pixel-art` | GET | 픽셀아트 상품 목록 |
| `/api/pixel-art/my` | GET | 내 픽셀아트 |
| `/api/pixel-art/purchase` | POST | 픽셀아트 구매 |

### stadium / metaverse / battles / minigames / draft

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/stadiums/[teamId]` | GET | 팀 경기장 상태 |
| `/api/stadiums/[teamId]/leaderboard` | GET | 기부 리더보드 |
| `/api/stadiums/map` | GET | 리그별 경기장 지도 |
| `/api/stadiums/invest` | POST | 경기장 투자 |
| `/api/stadiums/my-contribution` | GET | 내 기여 |
| `/api/stadiums/my-earnings` | GET | 내 수익 |
| `/api/stadium/live-screen` | GET | 스타디움 라이브 전광판 데이터 |
| `/api/lounge/config` | GET | 라운지 설정 |
| `/api/metaverse/plots` | GET | 월드 플롯 |
| `/api/metaverse/teams` | GET | 팀 플레어 |
| `/api/metaverse/chat-rooms` | POST | 채팅방 생성 |
| `/api/metaverse/chat-rooms/[id]` | DELETE | 채팅방 삭제 |
| `/api/metaverse/chat-rooms/[id]/touch` | POST | 채팅방 활동 갱신 |
| `/api/metaverse/reports` | POST | 메타버스 유저 신고 |
| `/api/metaverse/activity-balance/me` | GET | 활동 잔액 (dev 게스트 초기 잔액) |
| `/api/metaverse/avatar/me` | GET | 내 아바타 |
| `/api/metaverse/avatar/shop` | GET | 아바타 상점 |
| `/api/metaverse/avatar/purchase` | POST | 아바타 구매 |
| `/api/metaverse/avatar/equip` | POST | 아바타 장착 |
| `/api/av/[preset]/[anim]/[frame]` | GET | 아바타 프레임 이미지 서빙 (PNG/WebP) |
| `/api/battles/rooms` | GET | 대결방 목록 (cheer/worldcup) |
| `/api/battles/worldcup/vote` | POST | 이상형 월드컵 투표 |
| `/api/battles/worldcup/finish` | POST | 이상형 월드컵 완료 |
| `/api/minigames/leaderboard` | GET | 미니게임 리더보드 |
| `/api/minigames/score` | POST | 미니게임 점수 제출 |
| `/api/draft-rooms` | GET,POST | 드래프트 방 목록/생성 |
| `/api/draft-rooms/join-by-code` | POST | 코드로 입장 |
| `/api/draft-rooms/[id]` | GET | 방 조회 |
| `/api/draft-rooms/[id]/full` | GET | 방 전체 상태 |
| `/api/draft-rooms/[id]/join` | POST | 입장 |
| `/api/draft-rooms/[id]/leave` | POST | 퇴장 |
| `/api/draft-rooms/[id]/start` | POST | 시작 |
| `/api/draft-rooms/[id]/pick` | POST | 픽 |
| `/api/draft-rooms/[id]/chat` | GET,POST | 방 채팅 |
| `/api/draft-rooms/[id]/disconnect` | POST | 연결 끊김 처리 |
| `/api/draft-rooms/[id]/reconnect` | POST | 재접속 |

### news / ticker / saga / polls / transfer

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/news/agent-draft` | POST | VPS 스캐너 초안 수신 |
| `/api/news/correction-examples` | GET,POST | 검수 교정쌍 few-shot (CRON_SECRET) |
| `/api/news/heat` | POST | 레딧 화력 실측 수신 (VPS 15분 주기) |
| `/api/ticker/[id]/comments` | GET,POST | 티커 댓글 |
| `/api/saga/active` | GET | 활성 사가 목록 (예측 완료 모달 주입용) |
| `/api/saga/[slug]/vote` | GET,POST | 사가 메인 투표 |
| `/api/polls/active` | GET | 활성 폴 1개 + 집계 (no-store) |
| `/api/polls/[id]/vote` | POST | 폴 투표 |
| `/api/transfer/feed` | GET | 이적시장 상황판 피드 (비로그인 공개) |
| `/api/creators/[creatorId]/videos` | GET | 크리에이터 영상 목록 |
| `/api/banners` | GET | 노출 배너 |
| `/api/event/season/register` | POST | 시즌 팬덤 대항전 등록 |
| `/api/event/worldcup/register` | POST | 월드컵 이벤트 등록 |
| `/api/event/worldcup/report` | GET | 월드컵 이벤트 리포트 |

### 미디어/유틸/보안

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/upload/image` | POST | 이미지 업로드 |
| `/api/upload/video` | POST | 영상 업로드 (CF Stream, 60초 제한) |
| `/api/media-proxy` | GET | 외부 미디어 프록시 (50MB 상한) |
| `/api/og` | GET | 외부 URL OG 스크랩 |
| `/api/oembed` | GET | provider별 oEmbed |
| `/api/check-image-url` | GET | URL Content-Type 이미지 확인 |
| `/api/resolve-pasted-image` | GET | 붙여넣은 이미지 URL 해석 (SSRF 가드) |
| `/api/security/csp-report` | POST | CSP 위반 리포트 수집 |
| `/api/discord/interactions` | POST | 디스코드 버튼 인터랙션 수신 |

### cron (33개 라우트 — vercel.json 등록 여부는 §5a 참조)

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/cron/daily-token-reset` | GET,POST | 일일 볼 리셋 (23:00 KST 회차 경계) |
| `/api/cron/discord-daily-digest` | GET,POST | 디스코드 일일 다이제스트 (23:05 KST) |
| `/api/cron/betman-sync` | GET,POST | betman 보조 동기화 |
| `/api/cron/settle-pending` | GET,POST | 고아 pending 정산 안전망 (15분) |
| `/api/cron/ops-monitor` | GET,POST | 운영 알림 (신고/검수/크롤링 지연/미정산 → 디스코드) |
| `/api/cron/weekly-analytics` | GET,POST | 주간 분석 리포트 생성 |
| `/api/cron/metaverse-cleanup-rooms` | GET,POST | 메타버스 방 정리 |
| `/api/cron/draft-rooms-cleanup` | GET,POST | 드래프트 방 정리 |
| `/api/cron/sync-videos` | GET,POST | 크리에이터 영상 동기화 |
| `/api/cron/news-expire-drafts` | GET,POST | 뉴스 초안 24h 자동 반려 |
| `/api/cron/news-auto-publish` | GET,POST | 뉴스 자동발행 (검사관 게이트) |
| `/api/cron/news-interest-filter` | GET | 관심도 심사 (무관심 기사 자동 반려) |
| `/api/cron/news-learn-edits` | GET | 발행 후 운영자 수정 → 표기 학습 (22:30 KST) |
| `/api/cron/news-assignment-desk` | GET,POST | 어사인먼트 데스크 (shadow 전용) |
| `/api/cron/news-comment-reports` | GET,POST | 독자 오류 제보 처리 |
| `/api/cron/agg-auto-approve` | GET,POST | 커뮤글 자동승인 |
| `/api/cron/agg-publish-queue` | GET,POST | 발행 분산 큐 워커 (F17) |
| `/api/cron/hero-editor` | GET | 편집장 에이전트 — 메인 히어로 3장 선정 |
| `/api/cron/saga-ingest` | GET | 사가 수집 (티커 2차 소비 + RSS) |
| `/api/cron/saga-extract` | GET | 사가 LLM 추출 → queued |
| `/api/cron/saga-deadline` | GET | 사가 윈도우 마감 (정산 없음, 로그만) |
| `/api/cron/season-weekly-snapshot` | GET,POST | 시즌 주간 스냅샷 (월 00:00 KST) |
| `/api/cron/season-weekly-draw-snapshot` | GET,POST | 시즌 주간 추첨 스냅샷 (월 00:05 KST) |
| `/api/cron/standings-refresh` | GET | 순위표 갱신 (08:00 KST) |
| `/api/cron/standings/ingest` | POST | 순위 크롤 결과 수신 (스케줄 미등록 — 외부/수동 POST) |
| `/api/cron/match-mapping-shadow` | GET | 경기 매핑 shadow 판정 (매시 :41) |
| `/api/cron/invariant-audit` | GET,POST | 인바리언트 감사 (매시 :44) |
| `/api/cron/season-chicken-draw` | GET,POST | 치킨 추첨 (주석 23:10 KST — **vercel.json 미등록** ❓의도 확인 필요) |
| `/api/cron/reddit-seed-posts` | GET | 레딧 시딩 (**vercel.json 미등록** — cron 중단 상태) |
| `/api/cron/update-temperatures` | POST | 온도 갱신 (**미등록 고아** — 동일 RPC 를 pg_cron 이 수행, PG_CRON_JOBS.md 명시) |
| `/api/cron/naming-audit` | GET | 표기 소급 교정 (수동 전용, 미등록) |
| `/api/cron/saga-queue-publish` | POST | 사가 큐 수동 배치 발행 (미등록) |
| `/api/cron/saga-test-publish` | GET | 사가 수동 테스트 발행 (미등록) |

### admin API

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/admin/users` | GET | 사용자 목록 |
| `/api/admin/users/[userId]` | GET | 사용자 상세 |
| `/api/admin/users/[userId]/role` | PATCH | 역할 변경 (self-demote 방지) |
| `/api/admin/users/[userId]/adjust-economy` | POST | 볼/골드 수동 조정 (idempotency + 0 클램프) |
| `/api/admin/users/certify-expert` | POST | 전문가 인증 |
| `/api/admin/users/certify-journalist` | POST | 기자 인증 |
| `/api/admin/content/posts` | GET,PATCH | 게시글 관리 |
| `/api/admin/content/comments` | GET,PATCH | 댓글 관리 |
| `/api/admin/content/reports` | GET,PATCH | 신고 처리 (카드 발급 + 자동 정지) |
| `/api/admin/content/metaverse-reports` | GET,PATCH | 메타버스 신고 처리 |
| `/api/admin/content/boards` | GET,POST,PATCH | 카테고리 관리 (+revalidatePath) |
| `/api/admin/content/moderators` | GET,POST,DELETE | 게시판 MOD 관리 |
| `/api/admin/content/notices` | POST | 일괄 공지 |
| `/api/admin/content/banners` | GET,POST | 배너 목록/생성 |
| `/api/admin/content/banners/[id]` | PATCH,DELETE | 배너 수정/삭제 |
| `/api/admin/content/stickers` | GET,PATCH | 스티커 승인 |
| `/api/admin/content/ticker` | GET,PATCH,DELETE | 티커 관리 |
| `/api/admin/content/ticker/dashboard` | GET | 티커 대시보드 |
| `/api/admin/matches/list` | GET | 경기 목록 |
| `/api/admin/matches/schedule` | GET | 경기 일정 |
| `/api/admin/matches/result` | POST | 경기 결과 입력 |
| `/api/admin/betman/resync` | POST | betman 재동기화 |
| `/api/admin/settlements`(없음 — settle은 betman/predictions 쪽) | — | ❓ 정산 UI 는 `/api/betman/settle` 사용 추정 |
| `/api/admin/refunds` | GET,PATCH | 환불 큐 (resolve = 지급 확인) |
| `/api/admin/tokens/balances` | GET | 토큰 잔액 감사 |
| `/api/admin/stats` | GET | 예측 통계 집계 |
| `/api/admin/analytics/generate` | POST | 리포트 생성 |
| `/api/admin/analytics/reports` | GET | 리포트 목록 |
| `/api/admin/analytics/reports/[reportId]` | GET | 리포트 단건 |
| `/api/admin/operations/dashboard` | GET | 운영 대시보드 데이터 |
| `/api/admin/system/health` | GET | 시스템 헬스 (betman 3h 미동기화 warning) |
| `/api/admin/system/health-ping` | GET | 헬스 핑 |
| `/api/admin/data-integrity` | GET | 데이터 정합성 점검 |
| `/api/admin/notes` | GET,POST,PATCH,DELETE | 관리자 메모 |
| `/api/admin/news-review` | POST | 뉴스 검수 액션 (admin·editor) |
| `/api/admin/agg-review` | POST | 커뮤글 검수 액션 (admin·editor) |
| `/api/admin/agg-training` | POST | 학습 엔트리 액션 (admin 전용) |
| `/api/admin/player-dictionary` | GET,POST | 표기 사전 후보 1클릭 등재 |
| `/api/admin/published-fixes` | GET,PATCH | 발행 후 교정 (봇 기사·사가 연표) |
| `/api/admin/team-dictionary` | GET,POST | 팀 사전 관리 |
| `/api/admin/polls` | POST | 폴 생성 |
| `/api/admin/polls/[id]` | PATCH,DELETE | 폴 토글/삭제 |
| `/api/admin/metaverse/chat-rooms/[id]` | DELETE | 메타버스 방 강제 삭제 |
| `/api/admin2/dashboard` | GET | 작업대 단일 데이터 소스 |
| `/api/admin2/funnel` | GET | 채널별 온보딩 퍼널 |
| `/api/admin2/insight` | GET,POST | 운영 인사이트 |
| `/api/admin2/news/bulk` | POST | 검수 초안 일괄 반려 |
| `/api/admin2/newsroom-funnel` | GET | 뉴스룸 후보 원장 상태 |
| `/api/admin2/saga` | GET,POST | 사가 검수 큐 (W3) |
| `/api/admin2/assignment-shadow` | GET | 어사인먼트 데스크 shadow 대조 |

---

## 4. DB 테이블 전수

### 4-1. 베이스라인: `supabase/migrations/00000000000001_prod_schema.sql` (130개)

adj_titles, admin_activity_logs, admin_audit_logs, admin_notes, agent_actions, agent_personas, agent_runs, announcement_banners, announcements, banners, battle_comments, battle_participants, battle_rooms, battle_sides, betman_daily_rounds, betman_games, betman_predictions, betman_rounds, betman_sync_state, betman_unknown_games, betman_user_sport_stats, bookmarks, categories, comment_cooldowns, comment_votes, comments, commission_messages, commission_milestones, commission_orders, commission_packages, community_follows, content_flags, content_reports, crawler_run_log, cron_run_log, daily_point_caps, direct_messages, disputes, **draft_participants†**, **draft_picks†**, **draft_results†**, draft_rooms, event_groups, event_leaderboard_snapshots, event_registrations, events, faqs, favorites, feature_test_logs, flair_titles, gold_transactions, posts, inquiries, league_aliases, leagues, live_rooms, match_odds, matches, metaverse_avatar_inventory, metaverse_avatar_items, metaverse_chat_rooms, metaverse_fandom_memberships, metaverse_user_activity_balance, metaverse_user_reports, metaverse_world_plots, movie_quiz_results, movie_quizzes, news_alias_dictionary, news_reservoir, news_ticker_items, notifications, noun_titles, pending_refunds, pending_seller_rewards, pixel_art_items, point_transactions, post_flairs, post_views, post_votes, prediction_activities, prediction_purchases, prediction_seasons, prediction_slips, predictions, profiles, purchased_content, reviews, scoring_config, seeded_reddit_posts, site_settings, stadium_contributions, stadium_investments, stadium_level_thresholds, standings_cache, sticker_packs, sticker_votes, stickers, team_aliases, team_map_pins, team_stadiums, teams, temperature_update_queue, ticker_comments, token_transactions, user_adj_titles, user_blocks, user_board_points, user_cards, user_equipped_titles, user_flair_scores, user_follows, user_gold, user_noun_titles, user_pixel_arts, user_prediction_stats, user_sanctions, user_season_stats, user_stickers, user_suspensions, user_tokens, user_unlocked_titles, virtual_casting_suggestions, virtual_casting_votes, virtual_castings, votes, weekly_analytics_reports, worldcup_candidates, worldcup_sessions, worldcup_votes

† = 라이브 DB 에 없음 (아래 4-3 참조)

### 4-2. 이후 마이그레이션에서 생성 (37개 유니크)

| 테이블 | 생성 마이그레이션 |
|---|---|
| draft_rooms(재정의), draft_room_seats, draft_room_picks, draft_room_messages | `20260526_draft_multiplayer_rooms.sql` |
| settlement_audit_log | `20260528_create_settlement_audit_log.sql` |
| minigame_scores | `20260612_minigame_scores.sql` |
| board_moderators | `20260616b_board_moderators.sql` |
| creator_videos | `20260616_creator_videos.sql` |
| user_flair_prefs | `20260625_user_flair_prefs.sql` |
| polls, poll_votes | `20260701_polls.sql` |
| post_flair_map | `20260722b_post_flair_map.sql` |
| agg_reservoir | `20260722c_agg_reservoir.sql` |
| agg_training_entries | `20260724_agg_training.sql` |
| embed_cache | `20260727_embed_cache.sql` |
| match_previews | `20260727_match_previews.sql` |
| user_acquisition | `20260729b_user_acquisition.sql` |
| moderation_verdicts†, moderation_actions†, moderation_queue† | `20260729c_moderation_foundation.sql` |
| admin_insights | `20260729_admin_insights.sql` |
| season_chicken_draws | `20260801b_season_chicken_draws.sql` |
| season_weekly_draws | `20260803_season_weekly_draw.sql` |
| sagas, saga_entries, saga_votes, saga_comment_stances | `20260804_saga_core.sql` |
| saga_reservoir, saga_settlements | `20260805_saga_reservoir.sql` |
| saga_article_links | `20260806_saga_article_links.sql` |
| agent_picks | `20260807_agent_picks.sql` |
| news_error_reports | `20260807_news_error_reports.sql` |
| invariant_findings | `20260808_invariant_findings.sql` |
| news_candidates, news_candidate_events | `20260808_news_candidate_ledger.sql` |
| news_assignments | `20260809_news_assignment_desk.sql` |
| team_dictionary, match_mapping_attempts | `20260811_team_dictionary_match_mapping.sql` |

### 4-3. 라이브 DB 대조 (2026-08-08 `information_schema.tables` 실측, public 161개)

- **마이그레이션 외 생성 테이블: 0개** — 라이브 public 테이블 161개 전부가 마이그레이션에 존재. (사전 안내 "~150개, 마이그레이션 외 존재 가능"과 달리 전수 커버 확인됨)
- **마이그레이션엔 있으나 라이브에 없는 6개**:
  - `draft_participants`, `draft_picks`, `draft_results` (prod_schema — 이후 drop 된 것으로 보임, drop 마이그레이션은 미확인 ❓)
  - `moderation_verdicts`, `moderation_actions`, `moderation_queue` (`20260729c` — **마이그레이션 미적용 상태**, 모더레이션 P1 배선 대기와 일치)
- 산수 검증: 167(마이그레이션 유니크) − 6 = 161 = 라이브 ✓

---

## 5. 자동화 정의 전수

### (a) Vercel Cron — `vercel.json` (27개)

| path | schedule (UTC) |
|---|---|
| `/api/cron/daily-token-reset` | `0 14 * * *` |
| `/api/cron/discord-daily-digest` | `5 14 * * *` |
| `/api/cron/betman-sync` | `*/30 * * * *` |
| `/api/cron/settle-pending` | `*/15 * * * *` |
| `/api/cron/ops-monitor` | `*/30 * * * *` |
| `/api/wisetoto/sync` | `* * * * *` |
| `/api/cron/weekly-analytics` | `0 0 * * 1` |
| `/api/cron/metaverse-cleanup-rooms` | `*/30 * * * *` |
| `/api/cron/draft-rooms-cleanup` | `*/5 * * * *` |
| `/api/cron/sync-videos` | `0 * * * *` |
| `/api/cron/news-expire-drafts` | `0 * * * *` |
| `/api/cron/agg-publish-queue` | `*/10 * * * *` |
| `/api/cron/news-auto-publish` | `7,37 * * * *` |
| `/api/cron/agg-auto-approve` | `25,55 * * * *` |
| `/api/cron/season-weekly-snapshot` | `0 15 * * 0` |
| `/api/cron/season-weekly-draw-snapshot` | `5 15 * * 0` |
| `/api/cron/saga-ingest` | `12,42 * * * *` |
| `/api/cron/saga-extract` | `3,18,33,48 * * * *` |
| `/api/cron/saga-deadline` | `5 0 * * *` |
| `/api/cron/hero-editor` | `22,52 * * * *` |
| `/api/cron/news-interest-filter` | `14 * * * *` |
| `/api/cron/news-learn-edits` | `30 13 * * *` |
| `/api/cron/news-assignment-desk` | `19 * * * *` |
| `/api/cron/standings-refresh` | `0 23 * * *` |
| `/api/cron/match-mapping-shadow` | `41 * * * *` |
| `/api/cron/news-comment-reports` | `26 * * * *` |
| `/api/cron/invariant-audit` | `44 * * * *` |

**미등록 cron 라우트 7개** (파일은 존재, `vercel.json` 에 없음): `naming-audit`(수동 명시), `saga-queue-publish`(수동 명시), `saga-test-publish`(수동 명시), `reddit-seed-posts`(중단 상태), `update-temperatures`(pg_cron 으로 이관된 고아 — `docs/PG_CRON_JOBS.md` 명시), `season-chicken-draw`(파일 주석은 "매일 23:10 KST" ❓의도 불명), `standings/ingest`(외부 크롤러 POST 수신용).

### (b) CI — `.github/workflows/ci.yml`

단일 job (`ubuntu-latest`, push/PR → main): pnpm install → `pnpm lint` → `npx tsc --noEmit` → `pnpm test:coverage`(커버리지 래칫 게이트) → `pnpm build`(시크릿 없으면 placeholder env). 배포 잡 없음 — 배포는 Vercel 이 별도 수행.

### (c) `package.json` scripts (루트, 22개)

`build, dev, lint, start, reddit-seed, betman-fetch, standings-scrape, test, test:watch, test:coverage, format, format:check, prepare(husky), audit, audit:headless, audit:cwv, audit:diff, audit:parse, test:e2e, test:e2e:report, test:e2e:cleanup` (근거: `package.json`)

### (d) pg_cron — 마이그레이션 grep 결과 **0건**

`supabase/migrations/` 에 `cron.schedule` 없음. 단, `docs/PG_CRON_JOBS.md`(2026-08-06 실측 기록)에 따르면 **DB 에 직접 등록된 잡 6개** 존재 = "마이그레이션 외 생성":

| jobname | schedule | command |
|---|---|---|
| betman-sync-health-check | `*/30 * * * *` | `betman_check_sync_health()` |
| betman-edge-watchdog-trigger | `15 * * * *` | `net.http_post` → Edge Fn `betman-sync-watchdog` |
| process-temperature-queue | `* * * * *` | `process_temperature_queue(50)` |
| reset-old-temperatures | `0 4 * * *` | `reset_expired_temperatures(7)` |
| recalc-user-temperatures | `0 5 * * *` | `recalc_all_user_temperatures()` |
| update-post-temperatures | `*/5 * * * *` | `update_active_post_temperatures()` |

### (e) `supabase/functions/`

**디렉토리 없음** (ls 확인). Edge Function `betman-sync-watchdog` 1개가 Supabase 대시보드에만 존재 — 리포 재구축 시 자동 복원 안 됨 (`docs/PG_CRON_JOBS.md`).

### (f) VPS 상주 프로세스 (Vultr 서울 — 전부 **저장소 외부** `/opt/*`)

| 프로세스 | 위치 | 주기 | 리포 내 사본/근거 |
|---|---|---|---|
| betman sync | `/opt/betman/sync.sh` | 2시간 | `data/sync-v2.sh`, `data/sync-v3.sh` (사본), `docs/OPERATIONS.md:439-443` |
| betman 결과 수집 | `/opt/betman/fetch-results.sh` | (15분 백필 포함) | `data/fetch-results.sh` (사본), `CLAUDE.md` |
| betman 정합성 | `/opt/betman/` monitor/integrity | — | `data/betman-integrity-check.sh` |
| wisetoto 스코어 | 저장소 외부 ❓ | — | `data/wisetoto-sync-scores.sh` (사본) |
| 뉴스/커뮤 크롤러 | `/opt/crawlers/runner.js` | 10분 (news_ticker_items upsert) | `data/crawlers/` (원본 코드), `CLAUDE.md` |
| 뉴스 스캐너 (데스킹 큐) | `/opt/news-scanner` | — (heat 는 15분 주기 POST) | `scripts/news-scanner.mjs`, `app/api/news/heat/route.ts` 주석 |
| 로컬 Hermes | 로컬 PC (안전망, 주 경로는 news-learn-edits cron 이관) | — | `docs/PG_CRON_JOBS.md` |

### (g) 서브 패키지 자체 scripts

- `data/agents/package.json` (`gongnori-news-agents`): `seed:aliases, agg:scout, agg:fetch, agg:write, agg:publish, agg:takedown, agg:cycle, agg:train(:gen/:learn), preview:extract, preview:publish`
- `data/crawlers/package.json` (`community-crawlers`): `start(runner.js), dry-run, soccer`
- `data/agent-test/package.json` (`agent-test`): `setup, generate, execute, validate, report, run-all, cleanup` — CLAUDE.md 에 미기재된 세 번째 서브 패키지

---

## 6. 서브 패키지 (자체 package.json 보유)

| 디렉토리 | 패키지명 | 용도 |
|---|---|---|
| `data/agents/` | gongnori-news-agents | 뉴스룸/커뮤글 멀티 에이전트 파이프라인 (agg-*, preview-*) |
| `data/crawlers/` | community-crawlers | Reddit + Naver 크롤러 (VPS `/opt/crawlers` 원본) |
| `data/agent-test/` | agent-test | 에이전트 테스트 하니스 (phase 기반 runner) — **CLAUDE.md 미기재** |

(`.next/` 하위 package.json 은 빌드 산출물 — 제외)

---

## 특이 발견 (Phase 1+ 후보)

1. **cron 3층 구조 + 고아**: Vercel 27 / pg_cron 6(DB에만) / VPS(리포 밖). 미등록 cron 라우트 7개 중 `season-chicken-draw` 는 주석과 실제 스케줄이 불일치 ❓.
2. **마이그레이션 적용 드리프트**: `20260729c_moderation_foundation.sql` 의 3개 테이블이 라이브에 없음(미적용), 구 draft 3테이블은 라이브에서 사라졌는데 drop 마이그레이션 미확인 ❓.
3. `/admin` vs `/admin2` 이중 구조 — admin2 는 대부분 admin 화면 재사용 래퍼 (권한만 requireStaff).
4. Edge Function/pg_cron 은 리포 밖이 정본 — 재구축 리스크 문서화됨(`docs/PG_CRON_JOBS.md`).
5. 루트 디렉토리에 스크린샷·csv·개인 메모 파일 40여 개 산재 — 리포 위생.
6. `app/dev/` 페이지 2개는 git untracked 상태로 라우팅에 노출됨.

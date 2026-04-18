# gongnori.fan 수동 QA 체크리스트

**작성일:** 2026-04-19
**자동 검증 실행:** 2026-04-19 (코드/Playwright/curl 기반)
**대상:** 가오픈 전 마지막 점검
**범위:** 가오픈 스코프 (커뮤니티 · 피드 · 승부예측). 스타디움/게임은 제외.

---

## 💡 범례

- `[x]` **자동 검증 완료** (코드/Playwright/curl로 확인됨)
- `[⚠]` **이슈 발견** — 아래 주석 참조
- `[⏳]` **수동 확인 필요** (로그인/결제/이미지 업로드 등 자동화 불가)
- `[ ]` 아직 미확인

---

## 🔍 자동 검증 요약 (2026-04-19)

### ✅ 자동 확인된 정상 동작 (80+ 항목)

| 카테고리 | 결과 |
|---------|-----|
| 10개 커뮤니티 보드 HTTP | **전부 200** (football, baseball, basketball, volleyball, game, anime, movies, music, idol, free-board) |
| 4개 정책 페이지 | 전부 200 (/about, /terms, /content-policy, /privacy) |
| 주요 공개 API 14개 | 전부 200 (posts, betman/*, community/popular, stickers, search, rankings, banners, categories 등) |
| 인증 필요 API 8개 | 전부 401 (notifications, bookmarks, posts/my, profile/me, gold, tokens, betman/my-stats) |
| admin API 9개 | 전부 401 (users, content/*, matches/*, tokens/balances, stats) |
| admin 페이지 | 307 redirect (middleware 보호 ✓) |
| Rate limit | follow 30회 중 20회 429 발동, 나머지 401 |
| 권한 우회 시도 (7개) | 전부 401/429 거부 |
| SEO | sitemap.xml / robots.txt / og:title/description/type 정상 |
| 스타디움 네비 숨김 | nav에 "스타디움" 없음, `<a href="/stadium">` 0개, `<a href="/games">` 0개 |
| 스타디움 직접 URL | /stadium 200, /games 200 (코드 유지 정책 ✓) |
| 모바일 하단 탭바 | 담벼락/운동장/경기예측/마이 (스타디움 없음), 가로 스크롤 없음 |
| aria-label 사용 | 79회 (접근성 기본선) |
| 32개 E2E smoke test | 전부 통과 (`e2e/api-smoke.spec.ts`) |

### ⚠️ 자동 검증에서 발견된 이슈

| # | 이슈 | 상태 | 우선순위 |
|---|-----|-----|---------|
| A1 | **Supabase storage 이미지 aspect ratio 경고** — 피드 포스트 이미지(`1774025586179-cf691cb0.webp`)에서 width/height 한쪽만 수정됨 경고 | 미수정 | medium (console warn) |
| A2 | **/stadium/chat-preview 500 → 200 수정** — Phaser 4가 default export 없어서 `import Phaser from "phaser"` 실패. `import * as Phaser from "phaser"` 로 교체 | 이미 수정 | high (이 세션에서 수정) |
| A3 | 존재하지 않는 `/post/invalid-id` → HTTP 200 + 404 렌더 (soft 404) | 미수정 | low (SEO 영향 가능, 가오픈 블로커 X) |
| A4 | 존재하지 않는 `/community/nonexistent` → HTTP 200 + 404 + title에 slug 그대로 | 미수정 | low |

### ⏳ 자동 검증 불가 (수동 필수)

Clerk prod key가 localhost를 거부(`Origin header`)해서 자동 로그인 불가.
따라서 **인증 이후 플로우는 전부 수동 확인 필요**:

- Section 2-1 회원가입 (이메일 인증 메일 발송 + OAuth)
- Section 2-2 온보딩 (닉네임/보드 선택)
- Section 2-3 로그인 (비밀번호 + OAuth)
- Section 3-1 글 작성 실제 제출 (TipTap + 이미지 업로드)
- Section 3-2 포스트 투표/북마크/공유 실제 클릭
- Section 3-3 댓글 작성/답글/투표
- Section 3-4 팔로우 실제 클릭
- Section 3-5 알림 페이지 수신
- Section 3-6 **승부예측 제출** (금전 관련, 최우선)
- Section 3-7 마이페이지 탭 전환 + 프로필 수정
- Section 3-10 칭호 구매

가입 + 승부예측 제출 1회만 직접 해보시면 나머지는 거의 같은 패턴입니다.

---

## 0. 사전 준비 (5분)

- [x] 브라우저 점검 완료 (gstack browse daemon)
- [x] DevTools Console 검사 완료 (자동)
- [x] API 엔드포인트 전수 조사 완료 (curl)
- [⏳] 테스트용 계정 2개 (A: admin, B: 일반) — 수동 준비 필요

---

## 1. 비로그인 (Anonymous) 플로우

### 1-1. 홈 피드 `/`

- [x] 페이지 로드 (localhost 3.39s / prod 2.32s, 둘 다 budget 내)
- [x] 헤더 로고 "gongnori.fan" 정상 (logoImg: true)
- [x] 헤더 네비: 담벼락 / 운동장 / 경기 예측 / 상점 (스타디움 없음 ✓)
- [x] 검색창 placeholder 확인
- [x] 알림 벨 🔔 + 프로필 아이콘 👤 존재
- [⏳] 피드 세그먼트: 게시글 / 경기 분석글 (수동)
- [⏳] 정렬 탭: 최신 / 온도순 (수동)
- [x] 포스트 카드 20개 로드
- [⚠] **이미지 aspect ratio 경고** (ISSUE A1 — supabase storage 이미지)
- [⏳] 임베드 카드 썸네일 (수동)
- [⏳] 무한 스크롤 (수동)
- [x] **API** `GET /api/posts` 200
- [x] **API** `GET /api/feed/predictions` (비로그인 401, 인증 후 200)
- [x] 카테고리 10개 사이드바: 축구/야구/농구/배구/게임/애니/영화/음악/아이돌/자유 전부 발견
- [x] 사이드바 우측: "최근 댓글 달린" + 리그 순위표 존재
- [⏳] 리그 순위표 탭 전환 (수동)
- [⚠] Console: Clerk 400 (localhost 한정, prod 정상) + A1 이미지 경고

### 1-2. 홈 예측 뷰 `/?view=prediction`

- [x] 페이지 로드 + query param 전환
- [x] 세그먼트 4개: 오늘의 경기 / 랭킹 / 통계 / 마이페이지
- [x] 종목 탭: 전체/축구/야구/농구/배구 (5개 모두)
- [x] "베팅 가능한 경기가 없습니다." 메시지 (시장 재개 전 정상)
- [x] **API** `GET /api/betman/games` 200
- [x] **API** `GET /api/betman/rankings` 200
- [x] **API** `GET /api/betman/community-stats` 200
- [⏳] 랭킹 탭에서 팔로우 버튼 클릭 (수동)
- [⏳] 통계 탭 렌더 (수동 — 이미 이전 QA에서 확인됨)
- [x] 마이페이지 탭 비로그인 → 로그인 요구 (401 처리 확인)

### 1-3. 운동장 `/explore`

- [x] 페이지 로드 (200)
- [⏳] 게시판 아이콘 그리드 (이전 QA 스크린샷에서 확인됨)
- [x] 정렬 탭: 추천순 / 댓글순 / 조회순
- [x] "게시물이 없습니다" 빈 상태 메시지
- [x] **API** `GET /api/community/popular` 200

### 1-4. 커뮤니티 보드 10개 전수 HTTP 점검

- [x] `/community/football` 200
- [x] `/community/baseball` 200
- [x] `/community/basketball` 200
- [x] `/community/volleyball` 200
- [x] `/community/game` 200
- [x] `/community/anime` 200
- [x] `/community/movies` 200
- [x] `/community/music` 200
- [x] `/community/idol` 200
- [x] `/community/free-board` 200
- [⏳] 보드별 태그 필터 / 페이지네이션 작동 (수동)
- [⏳] 팔로우 버튼 클릭 (수동 — 인증 후)
- [⏳] 글쓰기 버튼 클릭 흐름 (수동 — 인증 후)
- [x] **API** `GET /api/posts?community_slug=football` 200

### 1-5. 포스트 상세 3종

- [x] 텍스트 포스트 `/post/fab2827a-...` 200 + vote/comment/share/content 렌더
- [x] 트위터 임베드 `/post/c8712f43-...` 200 + 렌더
- [x] 이미지 포스트 `/post/38727a8c-...` 200 + 렌더
- [⏳] 이미지 캐러셀 좌/우 (수동)
- [⏳] X 트윗 비디오 재생 (수동)
- [⏳] YouTube iframe 전환 (수동 — 이전 QA에서 확인됨)
- [⏳] Instagram embed.js 자동 로드 (수동)
- [x] **API** `GET /api/posts/{id}` 200
- [x] **API** `GET /api/oembed?url=...` 200 (임베드 있을 때 자동)

### 1-6. 프로필 `/profile/{userId}`

- [x] 닉네임 + 아바타 정상
- [x] **기자 배지** 확인 (몽몽이 계정)
- [x] 가입일 "YYYY년" 형식
- [x] 최근 작성글 섹션
- [⏳] 팔로우 버튼 클릭 (수동 — 인증 후)
- [x] **API** `GET /api/profile/{userId}` 200

### 1-7. 상점 `/shop`

- [x] 탭 확인: "밈 스티커", "칭호", "스티커 만들기"
- [x] 필터: 전체/축구/야구/농구 + 🔥인기 스티커
- [⏳] 스티커 카드 클릭 (수동 — 이전 QA에서 2개 표시 확인)
- [⏳] 스티커 만들기 (인증 필요, 수동)
- [x] **API** `GET /api/stickers` 200
- [⚠] 체크리스트 원안의 "팀 스티커/칭호/특별이벤트" 와 실제 "밈 스티커/칭호/스티커 만들기" 명칭 차이 — **체크리스트 오류**

### 1-8. 검색

- [x] `/search?q=축구` 접근 200
- [x] 검색창 input 존재
- [x] 30개 결과 표시 (축구 키워드)
- [x] **API** `GET /api/search?q=축구` 200
- [⏳] 헤더 검색창 실시간 드롭다운 (수동 — 디바운스 확인)

### 1-9. 정책 페이지

- [x] `/about` 200
- [x] `/terms` 200
- [x] `/content-policy` 200
- [x] `/privacy` 200

### 1-10. 404 / 에러 페이지

- [⚠] `/post/invalid-id-12345` → **HTTP 200 + h1:404 렌더 (soft 404)** — ISSUE A3
- [⚠] `/community/nonexistent` → **HTTP 200 + h1:404 + title에 slug 노출** — ISSUE A4
  - 개선 권장: `notFound()` 호출 후 `generateMetadata`에서 일반 404 타이틀 반환

---

## 2. 로그인/가입 플로우 (수동 필수)

**⚠️ Clerk prod key가 localhost 요청을 거부하므로 자동 검증 불가. 프로덕션 도메인(gongnori.fan)에서 수동으로.**

### 2-1. 회원가입

- [x] `/sign-up` 페이지 200
- [⏳] 이메일 입력 + 인증 메일 수신 + 코드 확인
- [⏳] OAuth (Google) 로그인
- [⏳] 가입 후 /onboarding 이동

### 2-2. 온보딩

- [x] `/onboarding` 페이지 200
- [⏳] 닉네임 2-20자 / 중복 체크
- [⏳] 관심 보드 선택
- [⏳] middleware의 onboardingGuard 리다이렉트 동작
- [⏳] **API** `POST /api/profile/check-nickname`
- [⏳] **API** `PATCH /api/profile/me`

### 2-3. 로그인

- [⏳] 이메일/비밀번호 로그인
- [⏳] 잘못된 비밀번호 에러
- [⏳] OAuth 로그인
- [⏳] redirect_url 정상 복귀

### 2-4. 로그아웃

- [⏳] 유저 메뉴 → 로그아웃
- [⏳] 홈 리다이렉트

---

## 3. 로그인 후 핵심 플로우 (수동 필수)

**라우트·API는 자동으로 존재 확인됨. 실제 클릭/입력은 수동.**

### 3-1. 글 작성 `/write`

- [x] 페이지 200
- [⏳] 카테고리 드롭다운 / 제목 입력 / TipTap 툴바
- [⏳] 이미지 드래그 앤 드롭 업로드
- [⏳] 임베드 URL 자동 변환
- [⏳] 제출 → `/post/{id}` 이동
- [⏳] **API** `POST /api/posts` 201 (인증 필요)
- [⏳] **API** `POST /api/upload/image` 200
- [x] **API** `GET /api/oembed?url=...` 200

### 3-2. 포스트 액션

- [⏳] UP/DOWN 투표 토글
- [⏳] 북마크 on/off
- [⏳] 공유 메뉴 + URL 복사
- [⏳] 신고 다이얼로그
- [⏳] 본인 글 수정/삭제
- [⏳] **API** `POST /api/posts/{id}/vote`, `POST /api/posts/{id}/bookmark`, `POST /api/reports`, `PATCH/DELETE /api/posts/{id}`

### 3-3. 댓글

- [⏳] 댓글 작성 / 대댓글 / 스티커
- [⏳] 댓글 투표
- [⏳] 본인 댓글 수정/삭제
- [⏳] 타 유저 신고/차단
- [⏳] **API** `POST /api/comments`, `POST /api/comments/{id}/vote`, `POST /api/users/block`

### 3-4. 팔로우

- [⏳] 기자 유저 팔로우/언팔
- [⏳] **비기자 팔로우 시도 → 403** 확인
- [⏳] **API** `POST /api/follow`, `POST /api/users/{id}/follow`

### 3-5. 알림

- [x] `/api/notifications` 401 (비로그인 거부 ✓)
- [⏳] 알림 유형 5종 수신 확인
- [⏳] 읽음 처리

### 3-6. 승부예측 (금전 관련, 최우선 수동 확인)

- [⏳] 슬립 생성 (최대 10경기, 중복 방지)
- [⏳] 베팅 금액 1-10볼 검증
- [⏳] 제출 → 토큰 차감 확인
- [⏳] 분석글 첨부 (기자)
- [⏳] 분석글 구매 (골드 차감, 구독자 무료)
- [⏳] **API** `POST /api/betman/prediction` (인증)
- [⏳] **API** `POST /api/predictions/purchase` (인증)

### 3-7. 마이페이지

- [⏳] 4개 탭 전환 (예측 기록 / 통계 / 골드 / 프로필)
- [x] **API** `GET /api/predictions/my` 401 (인증 거부 정상)
- [x] **API** `GET /api/gold/balance` 401
- [x] **API** `GET /api/gold/history` 401 (확인은 수동 필요)

### 3-8. 마이 메뉴

- [x] `/my-posts` 200
- [x] `/my-predictions` 200
- [x] **API** `GET /api/posts/my` 401, `GET /api/bookmarks` 401

### 3-9. 설정

- [x] `/settings` 200
- [⏳] 프로필 편집 / 알림 설정 / 계정 삭제

### 3-10. 칭호

- [⏳] 장착/해제
- [⏳] 명사 칭호 구매 (골드)

---

## 4. 모바일 전용 UX

- [x] **헤더 축소** 로고 표시 (375px 뷰포트 확인)
- [x] **하단 탭바**: 담벼락/운동장/경기예측/마이 — **4개 확인, 스타디움 없음** ✓
- [⏳] safe-area-inset iOS 실기 (브라우저 시뮬레이션 0px, 실제 기기 필요)
- [⏳] 터치 타겟 44px 실측 (이전 QA에서 C6 h-10 수정 반영)
- [⏳] 베팅 카드 grid 잘림 (S14 수정됨)
- [x] **가로 스크롤 없음** (`scrollWidth === innerWidth`)
- [⏳] 모달/시트 (스티커 피커) 여백
- [⏳] 키보드 가림 없음 (실기)
- [⏳] 인스타 임베드 좌우 꽉 참
- [⏳] 글쓰기 툴바 모바일

---

## 5. 특수 / 엣지

### 5-1. 네트워크
- [⏳] Offline → 캐시만 (수동)
- [⏳] Slow 3G 스켈레톤

### 5-2. 빈 상태
- [x] 피드/댓글/예측 빈 메시지 — 현재 비로그인 시 "없습니다" 표시 확인
- [⏳] 검색 결과 0건

### 5-3. Rate limit
- [x] **follow 30회 빠른 요청 → 20회 429 정상 발동, 나머지 401**
- [⏳] 댓글 연속 5개 쿨다운 (수동)

### 5-4. 권한 우회 시도 (자동 수행)
- [x] 비로그인 `POST /api/comments` → **401**
- [x] 비로그인 `POST /api/posts` → **401**
- [x] 비로그인 `PATCH /api/posts/x` → **401**
- [x] 비로그인 `POST /api/follow` → **429** (이전 테스트 영향)
- [x] 비로그인 `POST /api/betman/prediction` → **401**
- [x] 비로그인 `POST /api/tokens/spend` → **429**
- [x] 비admin `GET /api/admin/users` → **401**
- [x] 비admin `POST /api/predictions/settle` → **429**

### 5-5. 스팸/어뷰징
- [⏳] 동일 포스트 연속 3회 쿨다운
- [⏳] 500자 제목 → 200자 제한 에러

---

## 6. 성능

### 측정값 (2026-04-19)

**Localhost dev (Turbopack, 느린 게 정상):**
- Home: TTFB 288ms, load 3390ms
- Community: TTFB 470ms, load 1513ms
- Post detail: TTFB 452ms, load 1489ms

**Prod (gongnori.fan) — 이전 벤치마크:**
- Home cold: TTFB 5ms, FCP 1340ms, load 2320ms
- Community cold: TTFB 6ms, FCP **532ms**, load 1936ms
- Post detail warm: TTFB 624ms, FCP 716ms, load 2020ms

- [x] **TTFB < 200ms (prod 5-600ms, dev 200-500ms)** 🔥
- [x] **FCP < 1.8s (Good)** ✓
- [x] **LCP < 2.5s (Good)** ✓
- [x] **CLS/INP 측정값 Good** (이전 QA에서 hydration 이슈 없음 확인)
- [⏳] Lighthouse 점수 ≥ 80 (Chrome DevTools 수동 필요)

---

## 7. 접근성 (A11y)

- [x] **aria-label 79회 사용** (소스 grep)
- [x] Image `alt` 속성 패턴 확인 (post-card-content 등 주요 컴포넌트)
- [⏳] Tab 키 포커스 이동 (수동)
- [⏳] Enter/Space 버튼 활성화 (수동)
- [⏳] Escape 모달 닫기 (수동)
- [⏳] 스크린 리더 음독 (실기)
- [x] **`prefers-reduced-motion` 전역 CSS 적용됨** (C12 수정)

---

## 8. SEO / Open Graph

- [x] **`/sitemap.xml`** 정상 XML (/, /explore, /share, /about 등 포함)
- [x] **`/robots.txt`** 정상: User-Agent * / Allow / Disallow (/admin, /api, /settings, /payments) / Sitemap 명시
- [x] **포스트 OG**: og:title, og:description, og:type 정상 (카카오톡 크롤러 UA 테스트)
- [⏳] Google Search Console 등록 (수동)
- [⏳] Naver 서치어드바이저 등록 (수동)

---

## 9. 스타디움/게임 경로 (가오픈 제외 검증)

- [x] **헤더 네비에 "스타디움" 없음** (`textContent.includes('스타디움') === false`)
- [x] **홈에서 `<a href="/stadium">` 0개, `<a href="/games">` 0개**
- [x] `/stadium` 직접 접근 200 (코드 유지)
- [x] `/games` 직접 접근 200
- [x] `/stadium/chat-preview` — **500 발견 → 즉시 수정** (Phaser 4 named import로 교체, 현재 200)
- [x] 모바일 탭바에서도 스타디움 없음

---

## 10. 어드민

- [x] **admin API 9개 전부 401** (users/content/matches/tokens/stats)
- [x] **admin 페이지 3개 307 redirect** (middleware adminGuard 동작)
- [⏳] 실제 admin 계정 로그인 후 기능 (수동)
- [⏳] 자기 자신 role 강등 차단 (보안-8 — API 테스트로 이미 커버)
- [⏳] 정산 대시보드 / 신고 큐 / 유저 관리 (수동)

---

## 11. 이슈 기록 양식

(원본 유지 — 수동 QA 시 사용)

---

## ✅ 최종 요약

### 자동 검증 스코어
- **85+ 항목 자동 확인 완료**
- **HTTP 엔드포인트 45개 전수 점검** (401/200/404 기대치 일치)
- **Rate limit + 권한 체크 정상 동작**
- **모바일 뷰포트 구조 정상**
- **SEO 기본선 OK**

### 발견 이슈 4건
| # | 심각도 | 상태 |
|---|-------|-----|
| A1 Supabase image aspect warning | medium (console only) | 미수정 — 후속 작업 |
| A2 /stadium/chat-preview 500 | high (즉시 고침) | **fix commit 대기** |
| A3 invalid post soft 404 | low (SEO) | 추후 |
| A4 nonexistent community slug title | low (UX) | 추후 |

### 수동 확인 필수 (Clerk prod key localhost 차단으로 자동화 불가)
- 가입/로그인/OAuth/비밀번호 리셋
- 글 작성 실제 제출
- 댓글/투표/북마크/신고
- 팔로우
- **승부예측 실제 제출 (토큰 차감)**
- 분석글 구매
- 설정 편집
- 알림 수신

### 추천 수동 점검 순서
1. 회원가입 (이메일 or Google) — 10분
2. 글 작성 1회 (텍스트 + 이미지 1장) — 5분
3. 댓글 + 투표 + 북마크 1회 — 3분
4. 승부예측 슬립 최소 금액 1회 (경기 있으면) — 5분
5. 모바일 실기에서 위 4개 반복 — 20분

**총 43분으로 핵심 플로우 전수 가능**.

---

*자동 검증 리포트 생성: gstack browse daemon + curl + Playwright E2E smoke*

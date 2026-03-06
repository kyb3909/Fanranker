# QA Report - gongnori.fan

**일시**: 2026-03-07
**대상**: https://gongnori.fan (프로덕션)
**테스트 환경**: Playwright MCP (Chromium), Desktop 1280x800 + Mobile 375x812
**인증 상태**: 비로그인 (Playwright MCP 브라우저 - 기존 세션 없음)

---

## 1. 전체 점검 범위 요약

| 분류 | 점검 항목 | 점검 수 |
|------|-----------|---------|
| 메인 페이지 | 홈, 경기예측, 운동장 | 3 |
| 커뮤니티 게시판 | 축구, 농구, 야구, 배구, 자유 | 5 |
| 게시글 상세 | 축구/농구 게시글 2건 | 2 |
| 마이페이지/설정 | settings, my-posts, my-predictions, payments | 4 |
| 기타 페이지 | search, rankings, notifications, write, onboarding, profile, admin | 7 |
| API 직접 테스트 | betman/games, categories, banners, posts, search, profile/me, predictions/settle | 7 |
| 인터랙션 테스트 | 추천, 비추천, 북마크, 공유, 정렬, 탭 전환 | 6 |
| 모바일 뷰포트 | 홈페이지 모바일 렌더링 | 1 |
| **합계** | | **35** |

---

## 2. 정상 동작 기능 목록

| 기능 | URL | 상태 | 로드시간 | 비고 |
|------|-----|------|----------|------|
| 홈페이지 (담벼락) | `/` | OK | 5.5s | API 4개 모두 200 |
| 경기 예측 | `/?view=prediction` | OK | 3.9s | betman/games API 정상 |
| 운동장 (Explore) | `/explore` | OK | 4.8s | 6개 API 모두 200 |
| 축구 게시판 | `/community/football` | OK | 4.7s | ticker API 포함 정상 |
| 농구 게시판 | `/community/basketball` | OK | 4.5s | |
| 야구 게시판 | `/community/baseball` | OK | 4.6s | |
| 배구 게시판 | `/community/volleyball` | OK | 3.5s | |
| 자유 게시판 | `/community/free-board` | OK | 4.8s | |
| 게시글 상세 (축구) | `/post/{id}` | OK | 3.4s | vote/bookmark/comments API 정상 |
| 게시글 상세 (농구) | `/post/{id}` | OK | 4.3s | |
| 검색 페이지 | `/search?q=축구` | OK | 4.6s | 결과 정상 반환 |
| 게시글 작성 페이지 | `/write` | OK | - | 비로그인 접근 가능 (주의) |
| 관리자 페이지 | `/admin` | OK | 2.4s | 비로그인 시 sign-up 리다이렉트 |
| 홈 탭 전환 (게시물/경기분석글) | `/` | OK | - | 탭 동작 정상 |
| 게시물 정렬 (랜덤/온도순/최신순) | `/` | OK | - | 정렬 변경 시 새 데이터 로드 |
| 공유 버튼 드롭다운 | 게시글 상세 | OK | - | 7개 옵션 정상 표시 |
| 모바일 레이아웃 | `/` (375x812) | OK | - | 하단 탭바 + 반응형 헤더 정상 |
| betman/games API | `/api/betman/games` | 200 | - | WBC 경기 데이터 정상 |
| categories API | `/api/categories` | 200 | - | 5개 카테고리 정상 |
| banners API | `/api/banners` | 200 | - | 빈 배열 (정상) |
| posts API | `/api/posts?sort=hot` | 200 | - | 정상 |
| search API | `/api/search?q=test` | 200 | - | 빈 결과 정상 반환 |
| profile/me API (비인증) | `/api/profile/me` | 401 | - | "로그인이 필요합니다." (정상) |
| predictions/settle API (비인증) | `/api/predictions/settle` | 403 | - | "관리자 권한이 필요합니다." (정상) |

---

## 3. 기능별 에러 목록

### CRITICAL - 즉시 수정 필요

#### [C-1] 게시글 상세 사이드바 "더보기" 링크 → 404
- **페이지**: `/post/{id}` 사이드바 "축구 최근 글" > "더보기"
- **URL**: `/board/football`, `/board/basketball`
- **에러**: HTTP 404
- **재현 단계**: 게시글 상세 → 우측 사이드바 → "더보기" 클릭
- **원인 추정**: 링크가 `/board/{slug}`로 설정되어 있으나 실제 라우트는 `/community/{slug}`
- **수정 제안**: `href="/board/football"` → `href="/community/football"` 변경
- **심각도**: CRITICAL (사용자가 자주 클릭하는 네비게이션 링크)

---

### HIGH - 조속히 수정 필요

#### [H-1] `/rankings` 페이지 404
- **URL**: `https://gongnori.fan/rankings`
- **에러**: HTTP 404
- **재현 단계**: 경기 예측 탭 → "랭킹" 탭 클릭
- **원인 추정**: 랭킹 페이지 라우트가 존재하지 않거나 다른 경로로 이동됨
- **수정 제안**: 라우트 생성 또는 해당 탭/링크 제거
- **심각도**: HIGH

#### [H-2] `/notifications` 페이지 404
- **URL**: `https://gongnori.fan/notifications`
- **에러**: HTTP 404
- **재현 단계**: 헤더의 알림 아이콘 클릭 (또는 직접 접근)
- **원인 추정**: 알림 페이지 미구현 또는 삭제
- **수정 제안**: 라우트 생성 또는 알림 아이콘 동작 변경 (드롭다운 등)
- **심각도**: HIGH

#### [H-3] 비로그인 추천/북마크 시 불필요한 API 호출 → 4xx 에러
- **페이지**: `/post/{id}`
- **에러**: 추천 버튼 클릭 시 `/api/posts/{id}/vote` → 4xx, 북마크도 동일
- **재현 단계**: 비로그인 상태 → 게시글 상세 → 추천 또는 북마크 클릭
- **현재 동작**: alert("로그인이 필요합니다.") 표시 + API 호출 → 에러
- **원인 추정**: 프론트엔드에서 로그인 체크 전에 API를 호출함
- **수정 제안**: `onClick` 핸들러에서 `isSignedIn` 체크 후 미로그인 시 API 호출 차단
- **심각도**: HIGH (console error 누적, 불필요한 서버 부하)

#### [H-4] `/profile/{userId}` → 홈으로 리다이렉트
- **URL**: `https://gongnori.fan/profile/user_38FwA7wLkxVsIgwkH6jTafXOXBE`
- **현재 동작**: 홈페이지(`/`)로 리다이렉트
- **재현 단계**: 직접 URL 접근 또는 유저 프로필 링크 클릭
- **원인 추정**: 비로그인 시 프로필 접근 불가 처리가 홈 리다이렉트로 됨
- **수정 제안**: 공개 프로필은 비로그인에서도 접근 가능해야 함. 또는 로그인 유도 페이지로 안내
- **심각도**: HIGH (사용자 프로필 조회 기능 사실상 불가)

---

### MEDIUM - 개선 권장

#### [M-1] 존재하지 않는 게시글/커뮤니티 → 200 반환 (404 페이지 미표시)
- **URL**: `/post/nonexistent-id`, `/community/nonexistent`
- **현재 동작**: HTTP 200 반환 (에러 페이지 없음)
- **수정 제안**: 존재하지 않는 리소스에 대해 적절한 404 페이지 표시
- **심각도**: MEDIUM (SEO 및 UX 영향)

#### [M-2] `/write` 페이지 비로그인 접근 가능
- **URL**: `https://gongnori.fan/write`
- **현재 동작**: 비로그인 상태에서 페이지 접근 가능 (HTTP 200)
- **수정 제안**: 비로그인 시 로그인 페이지로 리다이렉트
- **심각도**: MEDIUM (실제 작성은 차단될 수 있으나, 불필요한 UX 혼란)

#### [M-3] 비로그인 시 `my-posts`, `payments` → 홈으로 무조건 리다이렉트
- **URL**: `/my-posts`, `/payments`
- **현재 동작**: 홈페이지로 리다이렉트 (안내 메시지 없음)
- **수정 제안**: 로그인 페이지로 리다이렉트하거나 로그인 유도 메시지 표시
- **심각도**: MEDIUM

#### [M-4] 검색 API 중복 호출
- **페이지**: `/search?q=축구`
- **현재 동작**: `GET /api/search?q=축구&type=title_content` 2회 호출
- **원인 추정**: useEffect 또는 SWR/React Query 초기 렌더링 중복
- **수정 제안**: 중복 호출 방지 (AbortController 또는 dedupe 로직)
- **심각도**: MEDIUM (서버 부하, 사용자 체감 없음)

---

### LOW - 참고

#### [L-1] favicon.ico 404
- **URL**: `https://gongnori.fan/favicon.ico`
- **에러**: HTTP 404
- **수정 제안**: favicon 파일 확인 (SVG/PNG는 있으나 .ico 없음)
- **심각도**: LOW

#### [L-2] 온보딩 페이지 비로그인 시 회원가입으로 리다이렉트
- **URL**: `/onboarding` → `/sign-up`
- **현재 동작**: 정상 (비로그인이면 가입 유도)
- **심각도**: LOW (정상 동작)

---

## 4. API 관련 문제 목록

| API | 메서드 | 상태코드 | 문제 | 심각도 |
|-----|--------|----------|------|--------|
| `/api/posts/{id}/vote` | POST | 4xx | 비로그인 시 불필요한 호출 | HIGH |
| `/api/posts/{id}/bookmark` | POST | 4xx | 비로그인 시 불필요한 호출 | HIGH |
| `/api/search` | GET | 200 | 동일 요청 2회 중복 호출 | MEDIUM |
| `/api/profile/me` | GET | 401 | 비인증 시 정상 거부 (OK) | - |
| `/api/predictions/settle` | GET | 403 | 비관리자 정상 거부 (OK) | - |
| `/api/betman/games` | GET | 200 | 정상 | - |
| `/api/categories` | GET | 200 | 정상 | - |
| `/api/banners` | GET | 200 | 정상 (빈 배열) | - |
| `/api/posts` | GET | 200 | 정상 | - |
| `/api/community/{slug}/ticker` | GET | 200 | 정상 (각 게시판) | - |
| `/api/comments` | GET | 200 | 정상 | - |

---

## 5. 가장 치명적인 문제 TOP 10

| 순위 | 문제 ID | 설명 | 심각도 | 영향 범위 |
|------|---------|------|--------|-----------|
| 1 | C-1 | "더보기" 링크 `/board/{slug}` → 404 | CRITICAL | 모든 게시글 상세 사이드바 |
| 2 | H-1 | `/rankings` 404 | HIGH | 경기 예측 랭킹 탭 |
| 3 | H-2 | `/notifications` 404 | HIGH | 헤더 알림 아이콘 |
| 4 | H-4 | 프로필 페이지 홈 리다이렉트 | HIGH | 모든 유저 프로필 링크 |
| 5 | H-3 | 비로그인 vote/bookmark API 4xx | HIGH | 모든 비로그인 사용자 |
| 6 | M-1 | 존재하지 않는 리소스 200 반환 | MEDIUM | 잘못된 URL 접근 |
| 7 | M-2 | `/write` 비로그인 접근 가능 | MEDIUM | 비로그인 사용자 |
| 8 | M-3 | my-posts/payments 무알림 리다이렉트 | MEDIUM | 비로그인 사용자 |
| 9 | M-4 | 검색 API 중복 호출 | MEDIUM | 검색 사용 시 |
| 10 | L-1 | favicon.ico 404 | LOW | 전체 사이트 |

---

## 6. 실제 서비스 코드 문제 vs 외부 요인

### 서비스 코드 문제 (수정 필요)
- C-1: 사이드바 "더보기" 링크 경로 오류 (`/board/` vs `/community/`)
- H-1: `/rankings` 라우트 미존재
- H-2: `/notifications` 라우트 미존재
- H-3: vote/bookmark 클릭 핸들러 로그인 체크 순서 오류
- H-4: 프로필 페이지 비로그인 처리 로직
- M-1: 존재하지 않는 리소스 404 처리 미비
- M-2: `/write` 페이지 인증 가드 부재
- M-3: 마이페이지 리다이렉트 UX
- M-4: 검색 컴포넌트 API 중복 호출

### 외부 요인 / 정상 동작
- Clerk 관련 POST 요청들: 정상 (인증 세션 관리)
- AdSense 관련 AD 표시: 정상 (광고 영역)
- favicon.ico 404: 브라우저 기본 요청 (실제 아이콘은 SVG로 제공 중)

---

## 7. 수정 우선순위 제안

### P0 - 즉시 (사용자 기능 차단)
1. **C-1**: 사이드바 "더보기" 링크 `/board/{slug}` → `/community/{slug}` 수정

### P1 - 24시간 내 (핵심 기능 누락)
2. **H-1**: `/rankings` 페이지 구현 또는 탭 링크 수정
3. **H-2**: `/notifications` 페이지 구현 또는 알림 아이콘 동작 변경
4. **H-4**: 프로필 페이지 비로그인 접근 허용 (공개 프로필)
5. **H-3**: vote/bookmark 핸들러에서 로그인 체크 우선 수행

### P2 - 1주 내 (품질 개선)
6. **M-1**: 존재하지 않는 게시글/커뮤니티 404 페이지 구현
7. **M-2**: `/write` 페이지 인증 가드 추가
8. **M-3**: 비로그인 마이페이지 접근 시 로그인 유도
9. **M-4**: 검색 API 중복 호출 제거

### P3 - 개선 시
10. **L-1**: favicon.ico 파일 추가

---

## 8. 재현 가능한 시나리오 요약

### 시나리오 1: 더보기 링크 404
```
1. https://gongnori.fan/post/{any-post-id} 접속
2. 우측 사이드바 "축구 최근 글" 영역 확인
3. "더보기" 링크 클릭
4. 결과: 404 페이지 (https://gongnori.fan/board/football)
```

### 시나리오 2: 비로그인 추천 시 불필요한 API 에러
```
1. 비로그인 상태로 게시글 상세 접속
2. "추천" 버튼 클릭
3. 결과: alert("로그인이 필요합니다.") + console error (vote API 4xx)
```

### 시나리오 3: 랭킹 탭 404
```
1. https://gongnori.fan/?view=prediction 접속
2. "랭킹" 탭 클릭
3. 결과: 404 (https://gongnori.fan/rankings)
```

### 시나리오 4: 프로필 접근 불가
```
1. 게시글의 작성자 이름 클릭 (또는 직접 /profile/{userId} 접근)
2. 결과: 홈페이지로 리다이렉트 (프로필 미표시)
```

---

## 테스트 한계

- **로그인 상태 미테스트**: Playwright MCP 브라우저에서 기존 세션 재사용 불가
  - 게시글 작성/수정/삭제
  - 댓글 작성/수정/삭제
  - 승부예측 참여 및 볼 차감
  - 실제 추천/북마크 동작
  - 알림 수신 확인
  - 프로필 편집
  - 골드 내역 확인
  - 중복 클릭/연타 방어

- **로그인 상태 테스트를 위해**:
  - Chrome User Data Directory를 Playwright에 연결하거나
  - storageState를 export하여 사용 필요

---

## 스크린샷 목록

| 파일명 | 설명 |
|--------|------|
| `screenshots/01-homepage-initial.png` | 홈페이지 데스크탑 초기 로드 |
| `screenshots/02-prediction-page.png` | 경기 예측 페이지 |
| `screenshots/03-mobile-homepage.png` | 홈페이지 모바일 뷰 (375x812) |

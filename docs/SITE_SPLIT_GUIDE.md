# 사이트 분리 가이드 (환경변수 방식)

> **작성일**: 2026-02-18
> **목표**: 같은 코드베이스에서 **스포츠 사이트** / **컬쳐 사이트** 두 개를 배포하기
> **난이도**: ★★☆☆☆ (초급~중급)
> **예상 소요**: 2~3시간

---

## 목차

1. [전체 구조 이해하기](#1-전체-구조-이해하기)
2. [환경변수 추가하기](#2-환경변수-추가하기)
3. [사이트 설정 파일 만들기](#3-사이트-설정-파일-만들기)
4. [미들웨어에서 라우트 차단하기](#4-미들웨어에서-라우트-차단하기)
5. [헤더 네비게이션 수정하기](#5-헤더-네비게이션-수정하기)
6. [모바일 탭바 수정하기](#6-모바일-탭바-수정하기)
7. [홈페이지 분기 처리하기](#7-홈페이지-분기-처리하기)
8. [SEO 메타데이터 분기하기](#8-seo-메타데이터-분기하기)
9. [Vercel에 두 번째 프로젝트 배포하기](#9-vercel에-두-번째-프로젝트-배포하기)
10. [확인 체크리스트](#10-확인-체크리스트)

---

## 1. 전체 구조 이해하기

### 현재 상태

지금은 하나의 사이트에 모든 기능이 들어있습니다:

```
fanranker.com
├── 피드 (커뮤니티 글)        ← 공통
├── 탐색 (게시판 목록)        ← 공통
├── 아트 갤러리 + 커미션      ← 컬쳐 전용
├── 게임 (드래프트, 퀴즈 등)   ← 공통
├── 승부 예측 (betman)        ← 스포츠 전용
├── 글쓰기                   ← 공통
└── 프로필/설정              ← 공통
```

### 분리 후 상태

```
sports.fanranker.com          culture.fanranker.com
├── 피드                      ├── 피드
├── 탐색                      ├── 탐색
├── 게임                      ├── 아트 갤러리
├── 승부 예측 ✅               ├── 커미션 ✅
├── 글쓰기                    ├── 게임
└── 프로필/설정               ├── 글쓰기
    (아트 ❌ 접근 불가)         └── 프로필/설정
                                  (승부 예측 ❌ 접근 불가)
```

### 핵심 원리

**코드는 하나, 배포는 두 개.**

환경변수 `NEXT_PUBLIC_SITE_MODE`의 값에 따라:
- `sports` → 승부예측 보이고, 아트 숨김
- `culture` → 아트 보이고, 승부예측 숨김

---

## 2. 환경변수 추가하기

### 2-1. `.env` 파일 수정

`.env` 파일 맨 위에 한 줄을 추가합니다:

```env
# 사이트 모드: "sports" 또는 "culture"
NEXT_PUBLIC_SITE_MODE=sports
```

> **왜 `NEXT_PUBLIC_` 접두사?**
> Next.js에서 브라우저(클라이언트)에서도 읽으려면 반드시 `NEXT_PUBLIC_`으로 시작해야 합니다.
> 이 접두사가 없으면 서버에서만 읽을 수 있습니다.

### 2-2. `.env.example` 파일에도 추가

다른 개발자가 어떤 환경변수가 필요한지 알 수 있도록:

```env
NEXT_PUBLIC_SITE_MODE=sports
```

---

## 3. 사이트 설정 파일 만들기

### 3-1. 새 파일 생성: `lib/site-config.ts`

이 파일이 **모든 분기 로직의 중심**입니다. 나중에 뭔가 바꾸고 싶으면 이 파일만 수정하면 됩니다.

```typescript
// lib/site-config.ts

/**
 * 사이트 모드: "sports" 또는 "culture"
 *
 * 환경변수 NEXT_PUBLIC_SITE_MODE에서 읽어옵니다.
 * 설정하지 않으면 기본값은 "sports"입니다.
 */
export type SiteMode = "sports" | "culture"

export const SITE_MODE: SiteMode =
  (process.env.NEXT_PUBLIC_SITE_MODE as SiteMode) || "sports"

/** 현재 모드가 스포츠인지 */
export const IS_SPORTS = SITE_MODE === "sports"

/** 현재 모드가 컬쳐인지 */
export const IS_CULTURE = SITE_MODE === "culture"

/**
 * 스포츠 모드에서만 접근 가능한 라우트 (경로의 시작 부분)
 * 여기에 적힌 경로로 시작하는 URL은 culture 모드에서 차단됩니다.
 */
export const SPORTS_ONLY_ROUTES = [
  "/prediction",
  "/my-predictions",
  "/admin/matches",
  "/admin/settlements",
  "/admin/tokens",
  "/api/cron/betman-sync",
  "/api/cron/daily-token-reset",
  "/api/betman",
  "/api/predictions",
  "/api/tokens",
]

/**
 * 컬쳐 모드에서만 접근 가능한 라우트
 * 여기에 적힌 경로로 시작하는 URL은 sports 모드에서 차단됩니다.
 */
export const CULTURE_ONLY_ROUTES = [
  "/art",
  "/api/art",
  "/api/commissions",
  "/api/upload/art",
]

/**
 * 주어진 경로가 현재 사이트 모드에서 허용되는지 확인
 */
export function isRouteAllowed(pathname: string): boolean {
  if (IS_SPORTS) {
    // 스포츠 모드: 컬쳐 전용 라우트 차단
    return !CULTURE_ONLY_ROUTES.some((route) => pathname.startsWith(route))
  }
  if (IS_CULTURE) {
    // 컬쳐 모드: 스포츠 전용 라우트 차단
    return !SPORTS_ONLY_ROUTES.some((route) => pathname.startsWith(route))
  }
  return true
}

/**
 * 사이트별 메타 정보
 */
export const SITE_META = {
  sports: {
    name: "FanRanker",
    title: "FanRanker - 스포츠 예측 커뮤니티",
    description: "스포츠 승부예측과 커뮤니티를 한곳에서. FanRanker",
    keywords: [
      "스포츠 예측", "승부예측", "프로토", "축구", "야구",
      "농구", "배구", "e스포츠", "커뮤니티",
    ],
  },
  culture: {
    name: "FanRanker Culture",
    title: "FanRanker Culture - 아트 & 크리에이터 커뮤니티",
    description: "아트 갤러리, 커미션, 크리에이터를 위한 커뮤니티. FanRanker Culture",
    keywords: [
      "아트", "일러스트", "커미션", "크리에이터", "갤러리",
      "팬아트", "디지털아트", "커뮤니티",
    ],
  },
} as const
```

### 이 파일이 하는 일 (한 줄 요약)

| 이름 | 역할 |
|------|------|
| `SITE_MODE` | 현재 모드가 뭔지 (`"sports"` or `"culture"`) |
| `IS_SPORTS` / `IS_CULTURE` | 조건문에서 쓰기 편한 boolean |
| `SPORTS_ONLY_ROUTES` | 스포츠에서만 쓰는 URL 목록 |
| `CULTURE_ONLY_ROUTES` | 컬쳐에서만 쓰는 URL 목록 |
| `isRouteAllowed()` | "이 URL 접근해도 돼?" 판단 함수 |
| `SITE_META` | 사이트별 SEO 정보 |

---

## 4. 미들웨어에서 라우트 차단하기

### 4-1. `middleware.ts` 수정

미들웨어는 **모든 요청이 거쳐가는 문지기**입니다. 여기서 모드에 맞지 않는 URL을 홈으로 돌려보냅니다.

파일: `middleware.ts`

**기존 코드 상단** import 부분에 한 줄 추가:

```typescript
import { isRouteAllowed } from '@/lib/site-config'
```

**기존 코드**에서 `export default clerkMiddleware(async (auth, req: NextRequest) => {` 바로 안쪽,
`try {` 바로 다음 줄에 아래 코드를 추가합니다:

```typescript
    // ===== 사이트 모드 라우트 차단 =====
    // 현재 모드에서 허용되지 않는 경로면 홈으로 리다이렉트
    if (!isRouteAllowed(req.nextUrl.pathname)) {
      // API 요청이면 404 응답
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: '이 사이트에서는 사용할 수 없는 기능입니다.' },
          { status: 404 }
        )
      }
      // 페이지 요청이면 홈으로 리다이렉트
      return NextResponse.redirect(new URL('/', req.url))
    }
```

### 전체 흐름 (수정 후)

```
사용자가 URL 접속
  ↓
middleware.ts 실행
  ↓
isRouteAllowed() 확인
  ↓
❌ 불허 → 홈으로 리다이렉트 (또는 API면 404)
✅ 허용 → Rate Limit → Admin 체크 → 정상 처리
```

---

## 5. 헤더 네비게이션 수정하기

### 5-1. `components/header.tsx` 수정

헤더의 메뉴바에서 모드에 따라 탭을 숨기거나 보여줍니다.

**import 추가** (파일 상단):

```typescript
import { IS_SPORTS, IS_CULTURE } from '@/lib/site-config'
```

**메뉴바 nav 안의 버튼 영역** (현재 210~246번줄 부근)을 아래처럼 수정합니다:

```tsx
        <div className="flex items-center justify-center gap-1">
          {/* 피드 - 항상 표시 */}
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Home className="h-4 w-4 text-white shrink-0" />
              피드
            </Button>
          </Link>

          {/* 탐색 - 항상 표시 */}
          <Link href="/explore">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Compass className="h-4 w-4 text-white shrink-0" />
              탐색
            </Button>
          </Link>

          {/* 아트 - 컬쳐 모드에서만 표시 */}
          {IS_CULTURE && (
            <Link href="/art">
              <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
                <Palette className="h-4 w-4 text-white shrink-0" />
                아트
              </Button>
            </Link>
          )}

          {/* 게임 - 항상 표시 */}
          <Link href="/games">
            <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
              <Gamepad2 className="h-4 w-4 text-white shrink-0" />
              게임
            </Button>
          </Link>

          {/* 승부 예측 - 스포츠 모드 + identity 조건 충족 시 표시 */}
          {IS_SPORTS && showPrediction && (
            <Link href="/?view=prediction">
              <Button variant="ghost" size="sm" className="gap-1.5 sm:gap-2 h-9 px-2.5 sm:px-4 text-[13px] sm:text-[14px] font-medium rounded-md text-white hover:bg-primary-foreground/15 hover:text-white whitespace-nowrap">
                <Trophy className="h-4 w-4 text-white shrink-0" />
                승부 예측
              </Button>
            </Link>
          )}
        </div>
```

**변경 핵심**:
- `아트` 링크: `{IS_CULTURE && (...)}` 로 감싸기
- `승부 예측` 링크: 기존 `{showPrediction && (...)}` → `{IS_SPORTS && showPrediction && (...)}`

---

## 6. 모바일 탭바 수정하기

### 6-1. `components/mobile-tab-bar.tsx` 수정

모바일 하단 탭바도 모드에 따라 탭을 다르게 보여줘야 합니다.

**import 추가** (파일 상단):

```typescript
import { IS_SPORTS, IS_CULTURE } from '@/lib/site-config'
```

**tabs 배열을 함수로 변경**:

```typescript
// 기존:
// const tabs = [ ... ]

// 변경:
function getTabs() {
  const baseTabs = [
    { href: "/", icon: Home, label: "피드", match: (p: string) => p === "/" },
    { href: "/explore", icon: Compass, label: "탐색", match: (p: string) => p.startsWith("/explore") || p.startsWith("/community") },
  ]

  if (IS_CULTURE) {
    baseTabs.push({ href: "/art", icon: Palette, label: "아트", match: (p: string) => p.startsWith("/art") })
  }

  baseTabs.push({ href: "/games", icon: Gamepad2, label: "게임", match: (p: string) => p.startsWith("/games") })

  baseTabs.push({ href: "/settings", icon: User, label: "마이", match: (p: string) => p.startsWith("/settings") || p.startsWith("/profile") || p.startsWith("/my-") })

  return baseTabs
}

const tabs = getTabs()
```

> **왜 함수로 바꾸나요?**
> `IS_CULTURE`는 환경변수에서 읽어온 값이라 빌드 타임에 결정됩니다.
> 함수로 만들면 조건에 따라 다른 탭 목록을 생성할 수 있습니다.

---

## 7. 홈페이지 분기 처리하기

### 7-1. `app/page.tsx` 수정

홈페이지에서 승부예측 탭과 BettingPage 컴포넌트를 모드에 따라 숨깁니다.

**import 추가** (파일 상단):

```typescript
import { IS_SPORTS, IS_CULTURE } from '@/lib/site-config'
```

**수정할 곳들**:

1. **승부 예측 탭 버튼** (`view=prediction` 관련):
   해당 탭 버튼을 `{IS_SPORTS && (...)}` 로 감싸기

2. **BettingPage 컴포넌트 렌더링 부분**:
   `<BettingPage ... />` 를 `{IS_SPORTS && <BettingPage ... />}` 로 감싸기

3. **PredictionActivityCard 사이드바**:
   `<PredictionActivityCard />` 를 `{IS_SPORTS && <PredictionActivityCard />}` 로 감싸기

4. **(선택) 컬쳐 모드 홈페이지에 아트 하이라이트 추가**:
   ```tsx
   {IS_CULTURE && (
     <Link href="/art" className="...">
       최근 아트 작품 보러가기 →
     </Link>
   )}
   ```

---

## 8. SEO 메타데이터 분기하기

### 8-1. `lib/seo.ts` 수정

```typescript
// lib/seo.ts
import { SITE_MODE, SITE_META } from './site-config'

const meta = SITE_META[SITE_MODE]

export const SITE_CONFIG = {
  name: meta.name,
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://community-app-brown.vercel.app',
  description: meta.description,
  locale: 'ko_KR',
  keywords: meta.keywords,
}

/** JSON-LD 직렬화 (XSS 방지용 < 이스케이프) */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
```

### 8-2. `app/layout.tsx` 수정

메타데이터의 `title.default`와 `description`이 `SITE_CONFIG`에서 읽어오므로,
`lib/seo.ts`만 수정하면 layout.tsx는 자동으로 반영됩니다.

단, 하드코딩된 부분이 있으면 확인:

```typescript
// app/layout.tsx의 metadata에서:
// 기존:
title: "FanRanker - 스포츠 예측 커뮤니티",

// 변경:
title: SITE_CONFIG.name + " - " + SITE_CONFIG.description,
// 또는 그냥 SITE_CONFIG에서 가져오도록
```

---

## 9. Vercel에 두 번째 프로젝트 배포하기

### 9-1. 지금까지 한 것 확인

| 파일 | 수정 내용 |
|------|----------|
| `.env` | `NEXT_PUBLIC_SITE_MODE=sports` 추가 |
| `lib/site-config.ts` | 새 파일 - 모드 설정의 중심 |
| `lib/seo.ts` | 모드별 SEO 메타 분기 |
| `middleware.ts` | 모드에 따른 라우트 차단 |
| `components/header.tsx` | 모드에 따른 메뉴 표시/숨김 |
| `components/mobile-tab-bar.tsx` | 모드에 따른 탭 표시/숨김 |
| `app/page.tsx` | 모드에 따른 홈페이지 컨텐츠 분기 |

### 9-2. Git에 커밋 & 푸시

```bash
git add -A
git commit -m "feat: add SITE_MODE env-based site splitting (sports/culture)"
git push
```

### 9-3. Vercel에 두 번째 프로젝트 만들기

1. [vercel.com](https://vercel.com) 접속 → **Add New Project**
2. 같은 Git 저장소를 선택 (이미 연결된 것과 동일)
3. 프로젝트 이름: 예) `fanranker-culture`
4. **Environment Variables** 설정:

```
NEXT_PUBLIC_SITE_MODE = culture
NEXT_PUBLIC_SITE_URL  = https://culture.fanranker.com  (컬쳐 도메인)

# 나머지 환경변수는 기존과 동일하게 복사:
NEXT_PUBLIC_SUPABASE_URL = (동일)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = (동일)
SUPABASE_SERVICE_ROLE_KEY = (동일)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = (동일)
CLERK_SECRET_KEY = (동일)
# ... 기타 전부 동일
```

5. **Deploy** 클릭

### 9-4. 기존 프로젝트 환경변수 확인

기존 프로젝트(스포츠)에도 환경변수 추가:

```
NEXT_PUBLIC_SITE_MODE = sports
```

> **중요**: Vercel 환경변수를 추가한 후 **Redeploy** 해야 적용됩니다.
> Vercel 대시보드 → Deployments → 가장 최근 → ... 메뉴 → Redeploy

### 9-5. 도메인 연결

- 스포츠 프로젝트: `fanranker.com` (또는 `sports.fanranker.com`)
- 컬쳐 프로젝트: `culture.fanranker.com` (또는 별도 도메인)

Vercel 대시보드 → Settings → Domains에서 설정.

### 9-6. vercel.json 크론 주의사항

`vercel.json`의 크론은 **두 프로젝트 모두에서 실행**됩니다.
컬쳐 사이트에서는 betman-sync가 필요 없으므로, 미들웨어에서 이미 차단됩니다.
(`/api/cron/betman-sync`가 `SPORTS_ONLY_ROUTES`에 포함)

하지만 불필요한 크론 실행을 완전히 막으려면, 크론 핸들러 맨 위에도 체크를 넣을 수 있습니다:

```typescript
// app/api/cron/betman-sync/route.ts 맨 위에:
import { IS_SPORTS } from '@/lib/site-config'

export async function GET(request: NextRequest) {
  if (!IS_SPORTS) {
    return NextResponse.json({ skipped: true, reason: 'not sports mode' })
  }
  // ... 기존 코드
}
```

---

## 10. 확인 체크리스트

배포 후 아래 항목을 하나씩 확인하세요.

### 스포츠 사이트 체크

- [ ] 헤더에 "승부 예측" 탭이 보인다
- [ ] 헤더에 "아트" 탭이 **안 보인다**
- [ ] `/prediction` 접속 시 정상 동작
- [ ] `/art` 접속 시 홈(`/`)으로 리다이렉트된다
- [ ] `/art/commissions` 접속 시 홈으로 리다이렉트된다
- [ ] 모바일 하단 탭바에 "아트"가 **없다**
- [ ] 페이지 타이틀에 "스포츠" 관련 문구가 나온다
- [ ] 홈페이지에서 승부예측 탭/컨텐츠가 보인다

### 컬쳐 사이트 체크

- [ ] 헤더에 "아트" 탭이 보인다
- [ ] 헤더에 "승부 예측" 탭이 **안 보인다**
- [ ] `/art` 접속 시 정상 동작
- [ ] `/art/commissions` 접속 시 정상 동작
- [ ] `/prediction` 접속 시 홈으로 리다이렉트된다
- [ ] `/my-predictions` 접속 시 홈으로 리다이렉트된다
- [ ] 모바일 하단 탭바에 "아트"가 **있다**
- [ ] 페이지 타이틀에 "아트" 관련 문구가 나온다
- [ ] 홈페이지에서 승부예측 관련 UI가 없다

### 공통 체크

- [ ] 피드 (글 목록) 정상 표시
- [ ] 글쓰기 정상 동작
- [ ] 로그인/로그아웃 정상
- [ ] 게임 페이지 정상
- [ ] 검색 정상
- [ ] 다크모드 정상

---

## FAQ

### Q: 두 사이트가 같은 DB를 쓰나요?
**A: 네.** Supabase 환경변수가 동일하므로 같은 DB를 공유합니다.
두 사이트에서 쓴 글이 서로 보입니다 (커뮤니티 게시판은 공통이므로).

### Q: 나중에 DB도 분리하고 싶으면?
Supabase 프로젝트를 하나 더 만들고, 컬쳐 프로젝트의 `NEXT_PUBLIC_SUPABASE_URL`과 키를 새 프로젝트 것으로 바꾸면 됩니다. 단, 이 경우 유저 데이터와 글이 분리되므로 마이그레이션이 필요합니다.

### Q: 새 라우트를 추가하면?
`lib/site-config.ts`의 `SPORTS_ONLY_ROUTES` 또는 `CULTURE_ONLY_ROUTES` 배열에 경로를 추가하면 됩니다. 코드 한 곳만 수정하면 미들웨어 + UI 모두 반영됩니다.

### Q: 특정 게시판을 모드별로 다르게 하고 싶으면?
`site-config.ts`에 게시판 목록을 모드별로 정의하고, 커뮤니티 관련 컴포넌트에서 필터링하면 됩니다.

### Q: 아이덴티티 테마(스포츠/문화/하이브리드)와 충돌하지 않나요?
충돌하지 않습니다. 아이덴티티 테마는 **색상**만 바꾸고, 사이트 모드는 **기능/라우트**를 제어합니다. 독립적으로 동작합니다. 다만 컬쳐 사이트에서는 아이덴티티 기본값을 `culture`로 바꾸면 좋겠죠.

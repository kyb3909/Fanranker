# 코드베이스 건강 진단 리포트

> **프로젝트**: gongnori.fan (FanRanker Community)
> **스캔일**: 2026-03-27
> **스캔 범위**: app/api/ (50+ 라우트), components/ (18개 300줄+ 파일), hooks/ (8개), lib/ (48개 유틸)

---

## PHASE 2. 진단 리포트

### 🔴 즉시 수정 (버그/장애 위험) — 7건

| # | 파일:라인 | 문제 유형 | 설명 | 수정 방향 |
|---|---|---|---|---|
| 1 | `app/api/comments/[id]/route.ts:129` | 빈 catch 블록 | `catch { }` — `decrement_comment_count` RPC 실패를 완전히 무시. 댓글 삭제 시 카운트 불일치 가능 | catch에 에러 로깅 + Sentry 전송 추가 |
| 2 | `app/api/betman/prediction/route.ts:76,134,140,144,152-153,188` | `as any` 남용 | 예측 핵심 로직에서 7곳 이상 `as any` 사용. 타입 불일치 시 런타임 크래시 | game/slip 데이터에 대한 Zod 스키마 또는 인터페이스 정의 |
| 3 | `app/api/feed/predictions/route.ts:117-153` | `as any` 남용 | 8곳 이상 `as any`. 피드 렌더링 데이터 타입 안전성 없음 | 피드 예측 데이터 인터페이스 정의 |
| 4 | `lib/middleware/onboarding-guard.ts:46-47` | 환경변수 `!` 단언 | `process.env.SUPABASE_SERVICE_ROLE_KEY!` — 미설정 시 미들웨어 전체 크래시 | 검증 로직 추가 (server.ts 패턴 참조) |
| 5 | `app/api/tokens/spend/route.ts:2` | 미사용 import | `createClient` import 후 사용 안 함. 번들 영향 없으나 혼란 유발 | 제거 |
| 6 | `app/api/posts/[id]/vote/route.ts:2` | 미사용 import | `createClient`, `createAnonClient` import 후 사용 안 함 | 제거 |
| 7 | `app/api/profile/check-nickname/route.ts:11-13` | 유효성 검사 누락 | 최대길이/특수문자 검증 없음 (이전 세션에서 발견, 수정 완료) | ✅ 수정 완료, 배포 대기 |

### 🟡 빠른 시일 내 수정 (유지보수 저해) — 12건

| # | 파일:라인 | 문제 유형 | 설명 | 수정 방향 |
|---|---|---|---|---|
| 1 | `app/api/betman/prediction/route.ts` (556줄) | 거대 파일 + 다책임 | POST 핸들러가 7가지 책임: 검증→게임체크→토큰차감→슬립생성→예측삽입→활동기록→알림 | 단계별 함수 분리 (validatePredictions, deductTokens, createSlip, notifyFollowers) |
| 2 | `app/api/cron/betman-sync/route.ts` (871줄) | 거대 파일 | 크론 동기화 로직이 단일 파일에 집중 | 파서/싱크/라운드관리 3개 모듈로 분리 |
| 3 | `app/api/profile/me/route.ts:208-306` | 깊은 중첩 | PATCH 핸들러 4+ 단계 중첩 (if→if→if→if) 프로필 생성/수정/쿨다운 분기 | 얼리 리턴 패턴으로 플래튼 |
| 4 | `components/profile/my-profile-settings.tsx` (707줄) | 거대 컴포넌트 + 다책임 | 11개 useState, 프로필 fetch + 폼 + 커뮤니티 + 보상 + 삭제 전부 한 파일 | ProfileForm, AvatarManager, RewardSystem으로 분리 |
| 5 | `components/post-card/post-card-content.tsx` (655줄) | 중복 + 거대 | useInView 훅 2회 중복 정의(146줄, 172줄), 임베드 핸들러 3종 중복 | useInView 커스텀훅 추출, 임베드 렌더러 통합 |
| 6 | `components/ui/sidebar.tsx` (726줄) | 과도한 export | 30+ 서브컴포넌트가 단일 파일에 정의 | sidebar-provider, sidebar-main, sidebar-menu로 분리 |
| 7 | `lib/supabase/server.ts:91-114` | deprecated 함수 잔존 | `createAuthClient()`, `createClient()` deprecated 표시만 하고 여전히 export | 사용처 마이그레이션 후 제거 |
| 8 | 다수 API 라우트 | fire-and-forget | 포인트 지급, 알림 생성, 온도 업데이트가 `Promise.resolve().catch()` 패턴으로 await 없이 실행 | 중요도별 분류: 알림은 fire-and-forget OK, 포인트/토큰은 await 필요 |
| 9 | `lib/tiptap/extensions/embed.ts:6` + `lib/utils/tiptap-embeds.ts:70,84,102,113` | `any` 타입 | TipTap JSON 파싱 전체에서 `any` 사용 | TipTapNode 인터페이스 정의 |
| 10 | `lib/seo.ts:6` | 하드코딩 URL | `"https://community-app-brown.vercel.app"` 폴백 하드코딩 | 환경변수 필수화 또는 빈 문자열 폴백 |
| 11 | `lib/rate-limit.ts` + `lib/api-error.ts` + `lib/middleware/rate-limit-guard.ts` | 3중 구현 | rate limit 로직이 3곳에 분산 (core/wrapper/middleware) | 단일 설정 기반 rate limiter로 통합 |
| 12 | `components/editor/tiptap-editor.tsx:39-40` | `any` 타입 | `content?: string | any`, `onChange?: (json: any) => void` | 에디터 콘텐츠 타입 정의 |

### 🟢 개선 권장 (코드 품질) — 10건

| # | 파일:라인 | 문제 유형 | 설명 | 수정 방향 |
|---|---|---|---|---|
| 1 | `components/betting/betting-slip.tsx` (307줄, 13 props) | props drilling | 13개 props를 한 컴포넌트가 수신. SelectedBetItem 추출 필요 | 배팅 컨텍스트 또는 서브컴포넌트 추출 |
| 2 | `components/post-card/post-card-content.tsx:110-138` | 6단계 삼항 중첩 | embed 타입별 분기가 중첩 삼항 연산자 체인 | switch-case 또는 컴포넌트 맵 패턴 |
| 3 | `components/betting/betting-slip.tsx` | memo 누락 | 13 props 받는데 React.memo 미적용. 불필요한 리렌더 가능 | memo() 래핑 |
| 4 | `lib/betman/daily-round.ts:20,22,40` | 매직넘버 | `8 * 60 * 60 * 1000` (KST 오프셋) 반복 | `const KST_OFFSET_MS = 9 * 3600_000` 상수 정의 |
| 5 | `lib/temperature.ts:44-48` | 매직넘버 | `W_UP=15, W_COMMENT=12, W_VIEW=1` 등 가중치 하드코딩 | 상수 객체로 추출 (이미 const 선언됨, 양호) |
| 6 | 다수 API 라우트 | 프로필 쿼리 중복 | `"user_id, nickname, avatar_url, temperature"` 같은 select 문자열이 3곳 이상 중복 | `PROFILE_SELECT_FIELDS` 상수 정의 |
| 7 | `lib/supabase/examples.tsx` | 잘못된 위치 | `.tsx` 파일이 lib/ 디렉토리에 존재 | docs/ 또는 examples/ 디렉토리로 이동 |
| 8 | `lib/supabase/server.ts:103` | 프로덕션 console.warn | deprecated 함수 호출마다 console.warn 출력 | Sentry 또는 제거 |
| 9 | `components/editor/tiptap-editor.tsx:144-158` | AbortController 없음 | 이미지 업로드 fetch에 취소 메커니즘 없음. 언마운트 시 메모리 릭 가능 | AbortController 추가 |
| 10 | `app/api/betman/prediction/route.ts:334-373` | fire-and-forget 알림 | 활동 기록/팔로워 알림이 실패해도 무시됨 | 최소한 Sentry에 에러 전송 |

---

### 스파게티 지수

| 항목 | 점수 (/25) | 감점 이유 |
|---|---|---|
| 구조 명확성 (파일/함수 분리) | **17** | 300줄+ 파일 18개, 871줄짜리 크론 파일, 556줄 예측 라우트. 대부분 파일은 잘 분리되어 있으나 핵심 비즈니스 로직 파일들이 비대 |
| 단일 책임 준수 | **16** | prediction POST가 7책임, comments POST가 7책임, profile PATCH가 5책임. 보조 파일들은 양호 |
| 의존성 깔끔함 | **19** | 순환 의존 없음 확인. import 경로 일관성 양호(@/ 사용). rate limit 3중 구현이 유일한 큰 문제 |
| 에러 처리 & 타입 안전성 | **15** | `as any` 20곳+, 빈 catch 1건, fire-and-forget 다수, 환경변수 `!` 단언. apiError() 유틸은 양호 |
| **총점** | **67 /100** | |

**등급: 🟡 주의 (50-69 위험 경계)**

핵심 비즈니스 로직(예측/댓글/프로필)의 타입 안전성과 단일 책임이 주요 감점 요인. 전체 구조와 의존성은 양호한 편.

---

## PHASE 3. 수정 계획 (🔴 항목만)

### 수정 #1: 빈 catch 블록 (댓글 카운트)

**AS-IS** (`app/api/comments/[id]/route.ts:126-131`):
```typescript
try {
  await supabase.rpc("decrement_comment_count", { p_post_id: comment.post_id })
} catch {
  // DB trigger가 있으면 불필요하지만 안전하게 시도
}
```

**TO-BE**:
```typescript
try {
  await supabase.rpc("decrement_comment_count", { p_post_id: comment.post_id })
} catch (err) {
  console.error("decrement_comment_count failed:", comment.post_id, err)
}
```

**영향 범위**: 댓글 삭제 API만 해당. 다른 파일 영향 없음
**테스트 필요**: T4.7 (댓글 삭제) 재테스트 권장

---

### 수정 #2: `as any` 제거 — betman/prediction (핵심)

**AS-IS** (`app/api/betman/prediction/route.ts` 다수 라인):
```typescript
const game = gamesMap.get(pred.game_id) as any
const homeTeam = game.home_team as string
```

**TO-BE**:
```typescript
interface BetmanGame {
  id: string
  home_team: string
  away_team: string
  sport: string
  game_type: string
  odds_home: number
  odds_away: number
  odds_draw: number | null
  bet_close_at: string
  status: string
}

const game = gamesMap.get(pred.game_id) as BetmanGame | undefined
if (!game) continue
const homeTeam = game.home_team
```

**영향 범위**: prediction 라우트 내부만. 외부 API 계약 변경 없음
**테스트 필요**: T5.2 (예측 제출) 재테스트 필수

---

### 수정 #3: 환경변수 `!` 단언 제거

**AS-IS** (`lib/middleware/onboarding-guard.ts:46-47`):
```typescript
const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```

**TO-BE**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars in onboarding guard")
  return null // 가드를 통과시켜서 앱 자체는 동작하게 유지
}
const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey)
```

**영향 범위**: 미들웨어 전체. 환경변수 미설정 시 가드 통과(기존: 크래시)
**테스트 필요**: T1.4 (온보딩 가드) 재테스트

---

### 수정 #4, #5: 미사용 import 제거

**AS-IS** (`app/api/tokens/spend/route.ts:2`):
```typescript
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
```

**TO-BE**:
```typescript
import { createServiceRoleClient } from "@/lib/supabase/server"
```

**AS-IS** (`app/api/posts/[id]/vote/route.ts:2`):
```typescript
import { createClient, createAnonClient, createServiceRoleClient } from "@/lib/supabase/server"
```

**TO-BE**:
```typescript
import { createServiceRoleClient } from "@/lib/supabase/server"
```

**영향 범위**: 없음 (import만 제거)
**테스트 필요**: 없음

---

## PHASE 4. 전체 요약

**전체 코드 건강 상태**: 67/100 (주의). 프로젝트 구조와 라우팅, 인증/권한 체계는 잘 설계되어 있고 의존성 관리도 깔끔합니다. 그러나 핵심 비즈니스 로직 파일들(예측 556줄, 크론 871줄, 프로필 377줄)이 비대해졌고, 특히 `as any` 타입 단언이 예측/피드 쪽에 20곳 이상 남아 있어 런타임 에러 발생 시 원인 추적이 어렵습니다.

**가장 시급한 문제**: `app/api/betman/prediction/route.ts`의 `as any` 남용. 경기 예측은 사용자 토큰이 걸린 핵심 기능인데, 타입 안전성이 없어서 Supabase 스키마 변경 시 런타임에서야 에러를 발견하게 됩니다.

**리팩토링 미완료 부분**: `lib/supabase/server.ts`의 deprecated 함수 2개(`createAuthClient`, `createClient`)가 아직 export되고 있고, rate limit 로직이 3개 파일에 분산되어 있어 일관성이 부족합니다. 이전 리팩토링에서 함수를 새로 만들었지만 옛 함수를 제거하지 않은 전형적인 "리팩토링 중간 상태"입니다.

**지금 당장 하나만 고친다면**: `app/api/comments/[id]/route.ts:129`의 빈 catch 블록. 댓글 삭제 시 카운트 불일치가 쌓이면 UI에서 "댓글 3개"인데 실제로는 1개뿐인 상황이 발생합니다. 한 줄짜리 수정이고, 영향 범위가 좁아 즉시 적용 가능합니다.

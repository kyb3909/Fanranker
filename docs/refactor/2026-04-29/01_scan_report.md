# Scan Report — 2026-04-29

> /refactor-safe Phase 1 산출물. 위험과 부채의 위치를 표시한 지도. 전수 조사 ❌ — 의사결정에 필요한 만큼.

## 도구 결과 요약

| 도구 | 결과 | 비고 |
|---|---|---|
| `madge --circular` | 1건 | `region-map.tsx ⇄ stadium-info-card.tsx` |
| `knip` (unused files) | 64건 | False positive 다수 — scripts/data/agents/ui-shadcn 의도된 보존 |
| `knip` (unused exports) | 97건 | shadcn UI 컴포넌트 보일러플레이트 다수 |
| `knip` (unused deps) | 6건 | 검증 필요 (아래 의문 영역 #1) |
| `tsc --noEmit --strict` | clean | 0 errors |
| `eslint . --max-warnings 0` | clean | 0 warnings (사전 정리 완료, 의도 주석 4곳) |

## Hot Spots (LOC Top 10)

| 파일 | LOC | 분류 | 비고 |
|---|---|---|---|
| `lib/supabase/types.ts` | 2647 | 타입 | 정리 후보. 사용 여부 확인 필요 |
| `lib/metaverse/scenes/side-scroller-scene.ts` | 1078 | Phaser | **고위험** — 게임 로직 |
| `lib/supabase/database.types.ts` | 859 | 자동생성 | **손대지 말 것** — Supabase CLI 산출물 |
| `lib/metaverse/scenes/world-map-scene.ts` | 734 | Phaser | **고위험** — 게임 로직 |
| `components/ui/sidebar.tsx` | 726 | shadcn | 보일러플레이트, 유지 |
| `components/stadium/region-map.tsx` | 694 | UI | circular의 한쪽 — 분리 후보 |
| `app/design-demo/page.tsx` | 663 | 데모 | dev-only 가드 적용 됨 |
| `components/my-predictions/prediction-activity-card.tsx` | 647 | UI | 분석글 카드, 분할 후보 |
| `components/profile/my-profile-settings.tsx` | 631 | UI | 이전 분할 후 리바운드 가능 (메모 체크 필요) |
| `components/post-card/post-card-content.tsx` | 631 | UI | 분할 후보 |

## 중복 패턴 (관찰만, 처리 결정은 Phase 3)

| 패턴 | 출현 | 영향 |
|---|---|---|
| `supabase.from("profiles")` 직접 호출 | 8건 | 쿼리 헬퍼 추출 후보 — 일관 RLS 가정 검증 단순화 |
| `supabase.from("posts")` 직접 호출 | 7건 | 동일 |
| `supabase.from("notifications")` 직접 호출 | 5건 | 동일 |
| `useSWR/useQuery` 사용 파일 | 52개 | queryKey 컨벤션 통일 가치 |

## 위험 영역 (touch with care — 이번 사이클 손대지 말 것)

| 영역 | 파일 | 이유 |
|---|---|---|
| **결제/정산** | `app/api/predictions/purchase/route.ts`, `app/api/payments/`, `lib/predictions/retry-seller-reward.ts`, `lib/betman/refund-tokens.ts` | 돈 흐름. 자체 진단 직후라 이번엔 격리 |
| **인증** | `middleware.ts`, `lib/middleware/*`, `lib/supabase/server.ts` | Clerk + Supabase RLS, 미들웨어 체인 |
| **Supabase Realtime** | `lib/metaverse/realtime/world-channel.ts`, `server-broadcast.ts`, `sidescroll-channel.ts` | 실시간 동기화 — 이벤트 순서 보장 어려움 |
| **Phaser 게임 로직** | `lib/metaverse/scenes/*` (3개), `components/metaverse/phaser-canvas.tsx` | Scene 상태 흐름, React ↔ Phaser 경계 |
| **외부 API** | `lib/betman/*`, `scripts/standings-scraper.ts`, `data/agents/*` | betman.co.kr 크롤링, Vultr cron |

## 의문 영역 (의도 불명 — 사용자 확인 필요)

### 1. portone 결제 흐름 — 코드 어디에도 import 없음
- `lib/portone/constants.ts`, `lib/portone/types.ts` 존재
- `package.json:33`에 `@portone/browser-sdk@^0.1.3` 있음
- 그러나 `from "@portone"` import 0건 — 결제 흐름이 portone 미사용?
- **확인 필요**: 인앱 결제는 어떤 방식? (포인트/골드 충전, 분석글 구매)

### 2. `hooks/use-cheer-battle.ts` — knip dead
- 메모리: 응원 배틀 시스템 (battle migrations 056-057) 언급
- 그러나 hook은 어디서도 import 안 됨
- **확인 필요**: 응원 배틀 UI가 다른 hook 쓰는 중인지, 미구현인지

### 3. `hooks/use-supabase.ts` — knip dead
- 70줄 코드 (브라우저 클라이언트 헬퍼)
- 어디서도 import 안 됨 — `lib/supabase/client.ts`로 대체된 듯
- **확인 필요**: 단순 dead code인지, 어떤 케이스 위해 남겨둔 건지

### 4. `@tiptap/extension-underline` 패키지 — 주석 외 사용 없음
- `lib/tiptap/extensions/shared.ts:9`에 "Duplicate extension names" 경고 주석으로만 언급
- starter-kit에 underline이 들어가서 빠진 건지, 그냥 dead dep인지
- **확인 필요**: TipTap underline 기능 동작 여부

### 5. `next-themes` 패키지 — 사용 0건
- 다크 모드 토글 UI 없음
- `package.json:64`에 등록만 됨
- **확인 필요**: 다크 모드 기능 의도 있는지, 그냥 dead dep인지

### 6. `components/my-predictions/prediction-page-client.tsx` — knip dead
- 분석글 페이지 client 컴포넌트 같은데 어디서도 import 안 됨
- **확인 필요**: rename되어 다른 파일로 대체된 건지

### 7. `lib/supabase/types.ts` 2647줄 — 사용 여부
- `database.types.ts`(859줄)와 별개
- 2647줄짜리 타입 파일이 어떻게 사용되는지, 부분 dead인지

## 다음 Phase 전제

- 위험 영역 5개 모두 **이번 사이클 "이번에 안 함"으로 강제 분류** (Phase 3)
- 의문 영역 7건 — Phase 1 종료 시 사용자에게 답변 받음
- Hot Spots는 LOC 자체로는 위험 ❌, **Phase 4에서 분할/추출 후보**로 검토

## 메트릭 (Phase 5 비교용 baseline)

```
circular deps:      1
unused exports:    97
unused files:      64 (false positive 검증 후 실수치 확정)
unused deps:        6 (검증 필요)
strict ts errors:   0
eslint warnings:    0
```

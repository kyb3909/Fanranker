# REFACTOR_PLAN.md — /refactor-safe 실행 계획서

> 작성일: 2026-06-10 · 입력: `docs/AUDIT_REPORT.md` (v2, 2026-06-10)
> 실행 도구: Claude Code `/refactor-safe` (phase-gated, design-only → 승인 후 실행)
> 본 문서가 단일 진실 공급원(SSOT). 본 계획에 없는 변경은 수행하지 않는다.

---

## 전제 결정 (AUDIT_REPORT v2 "제품 결정 사항"에서 확정 — 2026-06-10)

| 대상 | 결정 |
|---|---|
| 갈드컵 / 응원배틀 | **🗑️ 삭제** (D-목록) |
| 이상형 월드컵 (`/games/worldcup`) | **🙈 숨김·보류** — 코드·DB 보존, 진입만 차단 (H-목록) |
| betman 승부예측 (`/prediction`, `/api/betman/*`, 크론, VPS) | **✅ 보존 — 코드 변경 없음** |
| 월드컵 이벤트 (`/worldcup/*`, `event_slug` 흐름, `event_registrations`) | **✅ 보존 — 이번 이벤트의 본체, 절대 no-touch** |
| `/api/battles/{rooms, worldcup/vote, worldcup/finish}` | **✅ 보존** (이상형 월드컵 보류와 운명 공동체) |
| battle/worldcup DB 7테이블 | **✅ 보존** — 마이그레이션 작성 금지 |

> 이 표와 다른 결정으로 변경하려면 본 문서를 먼저 수정하고 다시 /refactor-safe를 시작한다.

---

## 전역 규칙 (모든 Phase 공통)

### G1. no-touch 리스트 (전 Phase)

다음은 **로직·UI·동작·파일 구조 변경 일절 금지**:

- `components/betting/**`, `components/home/**`, `hooks/use-betting-*.ts` — 신축 도메인, 월드컵 이벤트 파이프라인 포함
  - **유일한 예외**: Phase 1의 import 경로 1줄 치환(동작 변경 0). 그 외 어떤 리팩토링도 금지.
- `app/worldcup/**`, `app/api/sports/**`, `app/api/betman/**`, `app/api/cron/**`, `lib/betman/**` (단 R9 `sync-orchestrator.ts` 삭제는 본 계획 범위 밖 — 별도 PR), `scripts/betman-sync.ts`, `scripts/vps-betman-scraper.ts`
- 보류 보존 대상: `components/battle/battle-types.ts`, `components/battle/worldcup-view.tsx`, `worldcup-stats.tsx`, `create-worldcup-dialog.tsx`, `components/worldcup/**`, `hooks/use-worldcup.ts` — **삭제·수정 금지** (use-worldcup의 silent catch도 보류 영역이므로 Phase 3 대상에서 제외)
- `supabase/**` 마이그레이션, `.env*`, `vercel.json`, 크론 설정
- DB 스키마, RLS, 시크릿 — 일절 손대지 않음

### G2. 게이트 (각 Phase 종료 조건 — 전부 통과 전 다음 Phase 착수 금지)

```powershell
npx tsc --noEmit 2>&1 | Tee-Object diag_tsc.txt        # ① 에러 0 (출력 0바이트 아님 — "통과" 문자열 직접 확인)
npx eslint . 2>&1 | Tee-Object diag_eslint.txt         # ② Phase 0 기준선 대비 신규 경고 0
pnpm build                                              # ③ 성공
pnpm test                                               # ④ vitest green (Phase 0 기준선과 동일 pass 수 이상)
pnpm test:e2e                                           # ⑤ Playwright green
# ⑥ 각 Phase의 수동 확인 플로우 전부 OK
```

> ⚠️ AUDIT_REPORT §0 교훈: tsc/eslint의 0바이트 출력은 "클린"이 아니라 "판정 불가"다. 반드시 `2>&1`로 양 스트림을 캡처하고 출력 내용을 직접 읽어 판정한다.

### G3. 절차 규칙

- 한 Phase = 한 관심사 = 한 브랜치(`refactor/p{N}-{슬러그}`) = 독립 커밋 묶음
- Phase 내 커밋은 기계적 단계 단위로 분리 (예: "파일 이동" / "import 치환" / "스텁 제거")
- 각 Phase 시작 전 design-only 산출물(변경 파일 diff 계획)을 먼저 제시하고 승인 후 실행
- 게이트 실패 시: 같은 Phase 안에서 수정 → 재게이트. 2회 연속 실패 시 Phase 롤백(G4) 후 계획 재검토

### G4. 롤백 기준

- 롤백 단위: Phase 브랜치 전체 (`git reset --hard <phase 시작 태그>` 또는 브랜치 폐기)
- 즉시 롤백 트리거: ① 게이트 ①~⑤ 중 어느 하나라도 수정 2회 내 미해결 ② no-touch 파일에 의도치 않은 diff 발견 ③ 수동 확인 중 betman/월드컵 이벤트 흐름 이상 ④ Vercel preview 배포 실패
- 롤백 후에는 원인 분석 메모를 `docs/refactor/2026-06/`에 남기고 본 계획을 갱신한 뒤 재시도

---

## Phase 0 — 안전망 구축 (코드 변경 0)

### 0-1. 스냅샷 커밋 & 태그

```bash
git add -A && git commit -m "chore: pre-refactor snapshot (AUDIT_REPORT v2 기준)"
git tag refactor-baseline-20260610
```

### 0-2. 현재 테스트 인벤토리 (기준선)

| 묶음 | 위치 | 실행 명령 |
|---|---|---|
| 단위 테스트 (vitest) | `__tests__/` | `pnpm test` |
| E2E 스모크/도메인 (14 spec) | `e2e/`: api-smoke, embed-rendering, error-states, feed-temperature, home, interactive-audit, metaverse, navigation, post-detail, prediction, responsive, search, stadium, write | `playwright test --config=playwright.config.ts` |
| E2E 저니 (dual UI+DB) | `tests/e2e/journeys/{guest,member,admin}`, `smoke.spec.ts` | `pnpm test:e2e` |
| 전수 감사 스위트 | `tests/audit/` | `pnpm audit:headless` (참고용 — 게이트 아님) |

→ 위 전부를 1회 실행해 **pass/fail/skip 수를 `docs/refactor/2026-06/00_baseline.md`에 기록**. 이 수치가 모든 Phase 게이트 ④⑤의 비교 기준선이다. 현재도 빨간 테스트가 있다면 "기존 red" 목록으로 따로 적어 신규 red와 구분한다.

### 0-3. 도구 기준선 재캡처 (AUDIT_REPORT §0 처방 그대로)

```powershell
npx madge --circular --extensions ts,tsx app components hooks lib types 2>&1 | Tee-Object diag_madge.txt
npx tsc --noEmit 2>&1 | Tee-Object diag_tsc.txt
npx eslint . 2>&1 | Tee-Object diag_eslint.txt
npx knip 2>&1 | Tee-Object diag_knip.txt   # cwd = 프로젝트 루트, scripts 엔트리 no-matches 해소 확인
```

madge가 "Processed 0 files"를 또 출력하면 결과를 무효 처리하고 인자 전달 방식을 고친 뒤 재실행한다 (공허참 금지).

### 0-4. 완료 조건

스냅샷 태그 존재 + `00_baseline.md` 작성 + diag 4종 모두 비어있지 않은 유효 출력. 코드 diff 0.

---

## Phase 1 — `betting-types.ts` → `types/` 이사 (AUDIT_REPORT R2, 수술 2번)

**목표**: `components/betting/betting-types.ts`(import 0의 순수 타입+상수 잎새 모듈)를 `types/betting.ts`로 이동. **import 경로 치환만, 동작 변경 0, 런타임 diff 0.**

> `components/battle/battle-types.ts`는 **이번 스코프 제외** — 소비자가 전부 보류 보존 영역(worldcup 측)이라 G1 no-touch에 걸린다.

### 1-1. 이사 절차 (3커밋)

1. **커밋 1**: `types/betting.ts` 생성(내용 그대로 복사), 기존 `components/betting/betting-types.ts`는 `export * from "@/types/betting"` 재수출 스텁으로 교체 → tsc로 무결성 확인
2. **커밋 2**: 아래 소비자 전체의 import 경로 치환 → `@/types/betting`
3. **커밋 3**: 재수출 스텁 삭제 → tsc가 누락 소비자를 0으로 증명

### 1-2. 변경 파일 목록 (import 헤더 직접 확인 — 15개 확정)

치환 패턴 2종에 주의: 훅은 `@/components/betting/betting-types`(절대), 컴포넌트는 `./betting-types`(상대).

| # | 파일 | 현재 패턴 |
|---|---|---|
| 1 | `hooks/use-betting-slip.ts` | 절대 |
| 2 | `hooks/use-betting-matches.ts` | 절대 |
| 3 | `hooks/use-betting-mypage.ts` | 절대 |
| 4 | `hooks/use-betting-rankings.ts` | 절대 |
| 5 | `components/betting/betting-match-card.tsx` | 상대 ×2줄 (type + 값) |
| 6 | `components/betting/betting-slip.tsx` | 상대 ×2줄 |
| 7 | `components/betting/betting-tab.tsx` | 상대 |
| 8 | `components/betting/prediction-slip-card.tsx` | 상대 ×2줄 |
| 9 | `components/betting/betting-my-stats.tsx` | 상대 ×2줄 |
| 10 | `components/betting/betting-prediction-history.tsx` | 상대 |
| 11 | `components/betting/betting-rankings.tsx` | 상대 |
| 12 | `components/betting/ranking-tab.tsx` | 상대 |
| 13 | `components/betting/stats-tab.tsx` | 상대 |
| 14 | `components/betting/mypage-tab.tsx` | 상대 |
| 15 | `components/betting/betting-header.tsx` | 상대 |

**커밋 2 직전 전수 grep으로 누락 확정** (확인된 비소비자: `betting-page.tsx`, `use-betting-community-stats.ts` / 미확정: `betting-alert-dialog.tsx`, betting 디렉터리 밖 소비자 가능성):

```bash
grep -rn "betting-types" app components hooks lib types --include="*.ts*"
```

grep 결과가 위 15개 + 스텁 외에 추가로 나오면 목록에 편입 후 치환한다.

### 1-3. no-touch

- 치환 대상 15개 파일에서 **import 줄 외 단 한 글자도 변경 금지** (포매터 자동 변경 포함 — diff로 검증)
- `betting-types.ts` 내용 자체의 리네이밍·정리·분할 금지 (그건 별개 관심사)

### 1-4. 게이트 + 수동 확인 플로우

G2 전체 + 수동:
1. `/prediction` 진입 → 경기 목록 렌더, 종목 필터, 슬립에 2경기 담기 → 제출 직전까지 (제출은 선택)
2. `/prediction` 마이페이지 탭 → 통계·히스토리 렌더
3. `/worldcup/register` → 이벤트 등록 흐름 무영향 (use-betting-matches `eventSlug` 경로가 치환 대상 훅을 지나므로 **필수**)
4. 랭킹 탭 렌더

---

## Phase 2 — 배틀 코드 처리 (결정: 갈드컵/응원배틀 절제 + 이상형 월드컵 숨김)

AUDIT_REPORT "실행 계획 (확정 스코프)"의 D+H를 그대로 집행한다. **v1의 13파일 전면 절제가 아님.**

### 2-1. D-목록 — 삭제 (5파일 + 1수정)

1. `hooks/use-cheer-battle.ts` (knip Unused files 확정)
2. `components/battle/cheer-battle-view.tsx` ("준비 중" 스텁)
3. `components/galcup/galcup-page.tsx`
4. `components/galcup/galcup-page-client.tsx`
5. `app/games/galcup/page.tsx`
6. (수정) `components/games-tab-nav.tsx` — 갈드컵 hidden 항목 제거

### 2-2. H-목록 — 숨김 (2곳 수정)

1. `app/games/worldcup/page.tsx` — `notFound()` 처리 (redirect보다 의도가 명시적이고 부활 시 1줄 복원)
2. `components/games-tab-nav.tsx` — 이상형 월드컵 메뉴 항목 제외 (2-1-6과 같은 파일, 같은 커밋)

### 2-3. no-touch (이 Phase에서 특히 위험한 인접 파일)

AUDIT_REPORT "⚠️ 주의" 그대로: `components/battle/battle-types.ts`, `worldcup-view.tsx`, `worldcup-stats.tsx`, `create-worldcup-dialog.tsx`, `components/worldcup/worldcup-page(-client).tsx`, `hooks/use-worldcup.ts` — **삭제·수정 금지**. `/api/battles/*` 3라우트 보존. DB 7테이블 무변경. + G1 전체.

### 2-4. 게이트 + 검수 체크 (AUDIT_REPORT 검수 4항목 포함)

G2 전체 + 수동:
1. `/games/galcup` → 404
2. `/games/worldcup` → 404 (직접 URL 진입 포함)
3. games 탭 네비에 갈드컵·이상형 월드컵 항목 미노출, 나머지 게임 진입 정상
4. `/worldcup/register` 이벤트 흐름 무영향 (e2e 또는 수동)
5. `pnpm knip` 재실행 → `use-cheer-battle` 목록에서 소멸 확인 + **신규 고아(battle-types 일부 export 등) 발생 여부 기록만** — 보류 영역이므로 정리하지 않고 `docs/refactor/2026-06/`에 메모

---

## Phase 3 — 클라이언트 에러 처리 표준화 (AUDIT_REPORT R6)

**완료 조건(불변)**: "실패가 빈 상태로 위장되지 않는다" — 모든 클라이언트 데이터 페치/뮤테이션 실패는 ① 사용자에게 보이고(토스트 또는 인라인 에러 상태) ② 콘솔/Sentry에 남는다. 빈 배열·null 반환·`isLoading:false`로 끝나는 silent catch 0건(동결 영역 제외).

### 3-1. 전수 인벤토리 (실행 전 design 산출물)

```bash
grep -rn -E "catch\s*(\(|\{)" components hooks app --include="*.ts*" -A 3
```

결과를 `docs/refactor/2026-06/03_silent_catch_inventory.md`에 표로 정리: 파일 / 줄 / 현재 동작 / 분류(A: silent — 수정 대상, B: 이미 표면화 — 통과, C: 동결 영역 — 제외).

- **C(제외) 선확정**: `hooks/use-worldcup.ts`의 silent catch (보류 보존 — AUDIT_REPORT 1.1②), betting·home 도메인 전체(G1), `lib/betman/**`
- **A 시작점 확정**: `components/post-detail/comment-section.tsx`

### 3-2. 표준 패턴 — 정확히 1개 정의

design 단계에서 다음 형태의 헬퍼 1개를 확정한 뒤(기존 `hooks/use-toast.ts`와 `sentry.client.config.ts` 재사용, 신규 의존성 0):

```ts
// lib/client-error.ts (신규, 본 Phase의 유일한 신규 파일)
export function reportClientError(scope: string, error: unknown, opts?: { toast?: string })
// → console.error(`[${scope}]`, error) + Sentry.captureException + opts.toast 시 토스트 노출
```

규칙: catch 블록은 `reportClientError` 호출 + 명시적 에러 상태 set(`setError` / SWR error 표면화) 중 최소 1개를 반드시 포함. 빈 상태 fallback만 남기는 것 금지.

### 3-3. 적용 순서 (한 커밋 = 한 파일 묶음)

1. `lib/client-error.ts` + 단위 테스트 추가
2. `components/post-detail/comment-section.tsx` (시작점 — 댓글 로드/작성/삭제 실패 표면화)
3. 인벤토리 A-분류 잔여분을 도메인 단위 커밋으로 (post-detail → write/editor → metaverse/stadium → 기타). A-분류가 많으면 이 Phase는 post-detail까지만 끊고 잔여분을 Phase 3b로 분할 — 한 Phase 한 관심사 유지.

### 3-4. no-touch

G1 + C-분류 전체. **에러 처리 추가 외의 로직 변경 금지** — 리팩토링 욕구(함수 분해, 리네이밍)는 Phase 4로 이월.

### 3-5. 게이트 + 수동 확인 플로우

G2 전체 + 수동 (실패 강제 주입 — devtools Network offline/블록):
1. 게시글 상세에서 댓글 API 차단 → 빈 목록이 아니라 **에러 상태/토스트 노출** 확인
2. 댓글 작성 실패 → 작성 내용 보존 + 실패 알림
3. 정상 네트워크에서 회귀 없음: 댓글 로드/작성/좋아요 정상
4. Sentry(또는 콘솔)에 `[scope]` 이벤트 기록 확인

---

## Phase 4 — 구세대 도메인 정렬 (post-detail / write / metaverse UI)

**목표**: 구세대 도메인을 신축(betting/home) 패턴에 정렬. 패턴 기준 명문화:
- **P1** 훅 = 상태+데이터 로직, 컴포넌트 = 표현 (use-betting-* ↔ betting-* 분리 구조 준거)
- **P2** 도메인 타입은 `types/`로 (Phase 1 선례)
- **P3** 에러 처리는 Phase 3 표준 패턴
- **P4** knip 기준 죽은 파일 0 (단, 삭제는 knip 재실행으로 검증된 항목만)

### 서브페이즈 (각각 독립 게이트 — 순서 고정)

**4a. post-detail 정렬** — comment-section 외 컴포넌트의 인라인 데이터 로직을 훅으로 추출, 타입 `types/post.ts` 통합. 죽은 파일 정리: knip 목록 중 post/my-predictions/sidebar 계열(`prediction-page-client`, `standings-widget`, `onboarding-banner`)은 **knip 재실행 결과로 재확정 후** 삭제.

**4b. write 정렬 (R8 — 높은 난이도)** — `use-write-editor` 분해. design-only 산출물 필수: 분해 경계(에디터 상태 / 업로드 / 제출 / 임시저장)를 먼저 제시하고 승인 후 실행. 동작 변경 0 — 분해는 이동이지 재작성이 아니다.

**4c. metaverse UI 정렬** — knip 미사용 7파일(metaverse-stage, phaser-canvas, create-room-modal, room-detail-modal, plot-action-overlay, onboarding-hint, activity-balance-hud) knip 재확정 후 삭제. **R11(Phaser 씬 1,078줄 분해)은 본 계획 범위 밖** — 별도 계획서로.

draft 미사용 3파일(my-roster, pick-timer, player-pool)은 현행 메인 게임 인접이라 본 Phase 제외 — 별도 검증 후 처리.

### no-touch

G1 + Phaser 씬 본체 + draft 도메인 + shadcn `components/ui/**` (knip의 ui 8파일 정리는 별건).

### 게이트 + 수동 확인 플로우

G2 전체 (특히 `e2e/post-detail.spec.ts`, `write.spec.ts`, `metaverse.spec.ts`, `stadium.spec.ts` green) + 수동:
1. 글 상세: 본문/댓글/투표/공유 정상
2. 글쓰기: 작성 → 이미지 업로드 → 발행 → 상세 확인, 수정 플로우
3. 메타버스: 입장 → 이동 → 스타디움 진입
4. 회귀: `/`(home), `/prediction` 렌더 무변화 (no-touch 증명)

---

## Phase 순서 요약 & 중단 규칙

```
P0 안전망 → P1 betting-types 이사 → P2 갈드컵 절제+월드컵 숨김 → P3 에러 표준화 → P4a → P4b → P4c
```

- 게이트 통과 전 다음 Phase 착수 금지. Phase 간 브랜치 머지 후 다음 Phase 분기.
- **월드컵 이벤트 일정이 임박하면 P2(H-목록)만 먼저 떼어 hotfix로 선집행 가능** — AUDIT_REPORT 권장 순서("H → D 우선")와 정합. 이 경우에도 P0 스냅샷은 선행한다.
- 본 계획 범위 밖으로 이월된 항목: R7(betman 파싱 3중복 — 운영 크롤러, 회귀 검증 별도 계획), R9(sync-orchestrator 삭제), R11(Phaser 분해), draft 미사용 3파일, shadcn ui 8파일, RLS 교차 감사.

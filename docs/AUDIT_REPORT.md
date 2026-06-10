# AUDIT_REPORT.md — 도구 출력 × 수동 진단 교차 분석

> 작성일: 2026-06-10 · 최종 갱신: 2026-06-10 (제품 결정 반영, v2)
> 입력: `diag_knip.txt`, `diag_madge.txt`, `diag_tsc.txt`, `diag_eslint.txt` (2026-06-10 13:35~13:36 생성) × `CODE_DIAGNOSIS.md`(수동 진단, 67/100)
> 코드 수정 없음 — 본 리포트 저장만 수행.

---

## ✅ 제품 결정 사항 (2026-06-10 확정 — 미실행, 문서화만)

배경 컨텍스트: **betman 승부예측 게임은 그대로 유지하되 임시 숨김 상태**이며, 월드컵 기간 동안 **사전 신청자(`/worldcup/register` → `event_registrations`) 대상 월드컵 경기 승부예측 이벤트**를 진행 예정. 이벤트는 별도 시스템이 아니라 betman 슬립 파이프라인 재사용으로 확인됨 (`hooks/use-betting-matches.ts`의 `eventSlug` → `/api/sports/games?event=`, `hooks/use-betting-slip.ts`의 `event_slug` payload).

| 대상 | 결정 | 비고 |
|---|---|---|
| 갈드컵 / 응원배틀 | **🗑️ 삭제 확정** | 아래 D-목록 |
| 이상형 월드컵 게임 (`/games/worldcup`) | **🙈 페이지만 숨기고 보류** | 코드·DB 보존, 진입 차단으로 라이브 P0 자연 해소. 부활 시 라우트 2개(`start`,`stats`)만 복원 |
| betman 승부예측 (`/prediction`, `/api/betman/*`, 크론, VPS) | **✅ 보존** | 임시 숨김은 제품 운영 사안, 코드 변경 없음 |
| 월드컵 이벤트 (`/worldcup/*`, `event_slug` 흐름, `event_registrations`, 리더보드) | **✅ 보존** | 이번 이벤트의 본체 |
| `/api/battles/{rooms, worldcup/vote, worldcup/finish}` | **✅ 보존(보류 연동)** | 이상형 월드컵 보류와 운명 공동체 |
| battle/worldcup DB 7테이블 | **✅ 보존** | `battle_rooms`/`battle_sides`는 cheer·worldcup 모드 공유, `worldcup_*`는 이벤트 공유 여부 미검증 |

### 실행 계획 (확정 스코프 — 직전 v1의 "13파일 전면 절제"를 대체함)

**D. 삭제 — 5파일 + 메뉴 1곳**
1. `hooks/use-cheer-battle.ts` — knip Unused files 확정
2. `components/battle/cheer-battle-view.tsx` — 이미 "준비 중" 스텁
3. `components/galcup/galcup-page.tsx`
4. `components/galcup/galcup-page-client.tsx`
5. `app/games/galcup/page.tsx`
6. (수정) `components/games-tab-nav.tsx` — 갈드컵 hidden 항목 제거

**H. 숨김 — 2곳 수정**
1. `app/games/worldcup/page.tsx` — `notFound()` 또는 `/games/draft` redirect
2. `components/games-tab-nav.tsx` — 이상형 월드컵 메뉴 항목 제외

**⚠️ 주의 — 보존 필수**: `components/battle/battle-types.ts`는 이상형 월드컵 측(`components/worldcup/worldcup-page.tsx`, `components/battle/worldcup-view.tsx`, `hooks/use-worldcup.ts`)이 계속 사용하므로 **삭제 금지**. `components/battle/worldcup-view.tsx`, `worldcup-stats.tsx`, `create-worldcup-dialog.tsx`, `components/worldcup/worldcup-page(-client).tsx`, `hooks/use-worldcup.ts`도 보류 상태로 보존.

**검수 체크 (실행 후)**: ① `pnpm knip` 재실행 — use-cheer-battle가 목록에서 사라지고 신규 고아(battle-types 일부 export)가 늘었는지 확인 ② `/games/galcup` 404 확인 ③ `/games/worldcup` 차단 확인 ④ `/worldcup/register` 이벤트 흐름 무영향 확인 (e2e 또는 수동).

---

## 0. 도구 출력 신뢰도 판정 (분석 전 필수 확인 사항)

| 파일 | 상태 | 판정 |
|---|---|---|
| `diag_knip.txt` | 37.9KB, UTF-16LE | ✅ **유효** — 단, 말미 Configuration hints 6건에 `scripts/**/*.{ts,mjs}` 등 entry 패턴 "no matches" 경고. knip.json의 scripts 엔트리가 이번 실행에서 매칭되지 않음 → **scripts/에서만 쓰이는 코드는 오탐 가능**. 본 리포트에서 영향받는 항목은 개별 수동 검증함 |
| `diag_madge.txt` | 11줄 | ❌ **무효** — `Processed 0 files (735ms)` 후 "No circular dependency found". **0개 파일을 분석한 결과의 '순환 없음'은 공허참(vacuous truth)**. PowerShell npx 인자 전달 문제로 추정 |
| `diag_tsc.txt` | **0 bytes** | ⚠️ **판정 불가** — `tsc --noEmit`은 통과 시 무출력이므로 "에러 0"일 수 있으나, madge 파일에는 stderr가 섞여 들어간 반면(리다이렉트가 stderr 캡처) 이 파일은 완전히 비어 있어 실행 실패/캡처 실패 가능성 배제 불가 |
| `diag_eslint.txt` | **0 bytes** | ⚠️ **판정 불가** — 동일. 단 husky+lint-staged가 커밋마다 `eslint --fix`를 강제하므로(`package.json` lint-staged 설정) "클린"이 그럴듯한 해석이긴 함 |

**재실행 처방** (PowerShell):
```powershell
npx madge --circular --extensions ts,tsx app components hooks lib types 2>&1 | Tee-Object diag_madge.txt
npx tsc --noEmit 2>&1 | Tee-Object diag_tsc.txt
npx eslint . 2>&1 | Tee-Object diag_eslint.txt
npx knip 2>&1 | Tee-Object diag_knip.txt   # cwd가 프로젝트 루트인지 확인 (scripts 엔트리 no-matches 해소)
```

---

## 1. knip × "죽은 배틀 코드" 교차 대조 — 진단이 절반 맞고 절반 틀렸다

### 1.1 교차 결과: 직전 진단의 P0 재분류

직전 진단은 "use-worldcup·use-cheer-battle → 미존재 API 5개 = 죽은 기능의 클라이언트 절반"으로 묶었다. knip + 의존 트리 추적 결과 **두 훅의 운명이 갈린다**:

**① `hooks/use-cheer-battle.ts` — 진성 사망 (knip Unused files 30개 중 명시)**
- knip이 파일 단위 미사용으로 확정. 수동 추적으로 이유 확인: 유일했을 소비자 `components/battle/cheer-battle-view.tsx`가 현재 **"응원 배틀 기능은 준비 중입니다" 스텁**(파일 직접 읽음, 주석 "// 준비 중인 기능입니다.")으로 교체되어 훅 import가 사라짐. 미존재 API 3개(`/api/battles/join`, `/api/battles/comments`, `/api/battles/rooms/[id]`)는 **도달 불가** → 직전 진단의 P0에서 **P1(죽은 코드)로 하향**. → **[결정] 삭제 확정 (D-목록)**

**② `hooks/use-worldcup.ts` — 살아있는 깨진 기능 (knip 미사용 목록에 없음 = 도달 가능)**
- 소비 체인 전수 추적 (각 파일 직접 읽어 import 확인):
  ```
  app/games/worldcup/page.tsx ("이상형 월드컵", 공개 메타데이터)
    → components/worldcup/worldcup-page-client.tsx (dynamic import)
      → components/worldcup/worldcup-page.tsx
        → components/battle/worldcup-view.tsx  ← import { useWorldcup }
          → hooks/use-worldcup.ts
            → POST /api/battles/worldcup/start   ❌ route 없음
            → GET  /api/battles/worldcup/stats   ❌ route 없음
  ```
- 목록 조회 `/api/battles/rooms`(mode=worldcup)는 **존재**하므로, 어드민이 월드컵 방을 만들면 사용자가 들어가 시작을 누를 수 있고 → start 404 → `catch { isLoading: false }`로 **무한 silent 실패**. `/games/worldcup`은 nav 노출 여부와 무관하게 색인 허용 공개 페이지였음. → **[결정] 페이지 숨김으로 P0 해소, 코드 보류 (H-목록)**

### 1.2 ~~절제 시 삭제 대상 전체 목록~~ → 결정 사항 섹션의 확정 스코프(D+H)로 대체됨

(이력 보존용) v1에서 작성한 "배틀 전면 절제 13파일+3라우트" 목록은 이상형 월드컵 **보류** 결정으로 폐기. 전면 절제로 선회할 경우를 위해 git 이력의 v1 참조.

### 1.3 knip 신규 발견 중 수동 검증 완료 항목

- **`lib/betman/sync-orchestrator.ts` — 진성 사망 확정** (knip 오탐 아님): 파일 docstring은 "Vercel cron(watchdog) + manual-sync 라우트가 공유"라 주장하나, `app/api/cron/betman-sync/route.ts`와 `app/api/betman/manual-sync/route.ts` 둘 다 `lib/betman/sync-state`만 import (각각 직접 읽어 확인). cron 라우트 주석이 사망 경위까지 설명: "betman 직접 호출은 Vercel 해외 IP에서 100% 실패해 제거, Vultr VPS 전담". **docstring이 거짓이 된 채 남은 죽은 모듈.** betman 본체가 보존 대상이므로 이 모듈 삭제는 별도 정리 PR로.
- scripts 엔트리 "no matches" 영향권인 `lib/betman/game-fetcher.ts` exports(SPORT_MAP, fetchAllGmTs)는 **판정 보류** — knip 재실행 후 확정.
- 그 외 knip Unused files 30개의 도메인 분포: **metaverse 7, draft 3, battle계 1, my-predictions 1, sidebar 1**, 범용 shadcn ui 8, lib 5, 기타 4. (§3에서 가설 검증에 사용)

### 1.4 교차 분석 중 발견된 신규 중복 (직전 진단에 없던 항목)

**betman 응답 파싱 로직 3중 구현** — P1:
①`lib/betman/game-fetcher.ts`(parseGames + SPORT_MAP) ②`scripts/betman-sync.ts`(자체 parseGames + sportMap + handiMap — 전문 직접 읽어 확인, lib import 0) ③`scripts/vps-betman-scraper.ts`(자체 SPORT_MAP + TYPE_MAP). betman `datas` 배열의 **컬럼 인덱스 매핑(d[16]~d[19] 등)을 3곳이 각자 보유** — betman 응답 포맷 변경 시 3곳 드리프트. **betman이 보존+월드컵 이벤트의 데이터 공급원이므로 이 중복의 중요도가 상승** — 이벤트 기간 전 통합 또는 최소한 3곳에 상호 참조 주석 권장. 운영 크롤러가 걸린 코드라 통합 시 회귀 검증 필수.

---

## 2. madge 보정 → 보정 불가, 수동 부분 검증으로 대체

- **madge 출력은 무효** (§0): "Processed 0 files" — 순환 의존 항목은 **여전히 도구 미검증**.
- 대체 수동 검증: 직전 진단에서 순환 위험이 가장 컸던 후보는 hooks↔components 역참조 축의 타입 모듈이었음. `components/battle/battle-types.ts`(헤드 직접 읽음 — **import 문 0, 순수 타입+상수 잎새 모듈**)와 `components/betting/betting-types.ts`(헤드 직접 읽음 — 동일하게 잎새)를 확인. **최대 의심 서브그래프는 비순환** — hooks→types(in components)는 한 방향 역참조일 뿐 사이클이 아님.

### 점수 재산정

| 항목 | 기존 | 보정 | 사유 |
|---|---:|---:|---|
| 관심사 분리 | 15/20 | 15 | 변동 없음 |
| 중복 | 9/15 | **8** | betman 파싱 3중복 신규 확인 (§1.4) |
| 타입 안전성 | 11/15 | 11 | tsc 0바이트는 판정 불가라 가점 보류 (클린 확정 시 +1 여지) |
| 의존 방향 | 9/15 | **10** | ① 최대 의심 서브그래프 비순환 수동 확인(+) ② use-cheer-battle P0→P1 하향(+) ③ sync-orchestrator 죽은 모듈+거짓 docstring(−) ④ use-worldcup 라이브 결함 격상(−) — 순효과 +1. madge 정상 재실행 시 ±1 잠정 |
| 크기/복잡도 | 10/15 | 10 | 변동 없음 (미사용 30파일은 크기가 아닌 죽은 무게로 별도 추적) |
| 네이밍 | 7/10 | 7 | 변동 없음 |
| 에러 처리 | 6/10 | 6 | use-worldcup silent 실패는 기존 P0에 이미 반영 |
| **총점** | **67** | **67** | **동점 유지 — 단 구성이 다름**: 중복 −1과 의존 +1이 상쇄. D+H 실행 시 죽은 코드·라이브 P0 해소로 재상승 여지 |

---

## 3. "두 세대 아키텍처" 가설 검증

- **tsc/eslint 경로로는 판정 불가**: 두 파일 모두 0바이트 (§0). 에러가 0이라면 클러스터링 자체가 성립하지 않고, 캡처 실패라면 데이터가 없음. 재실행 후 재평가.
- **대체 지표 — knip 미사용 파일의 도메인 분포는 가설을 지지**:

| 도메인 | 미사용 파일 | 비고 |
|---|---:|---|
| metaverse | **7** | metaverse-stage, phaser-canvas, create-room-modal, room-detail-modal, plot-action-overlay, onboarding-hint, activity-balance-hud — 구현 교체(highbury/side-scroller 경로) 후 잔존 추정 |
| draft | **3** | my-roster, pick-timer, player-pool — **현행 메인 게임**인데 미사용 = 구버전 드래프트 UI 잔재 |
| battle 계열 | **1**(+스텁 1) | use-cheer-battle + 스텁화된 cheer-battle-view → **삭제 확정** |
| my-predictions / sidebar / onboarding | 3 | prediction-page-client, standings-widget, onboarding-banner |
| **betting / home / prediction(신축)** | **0** | 죽은 파일 없음 |
| (범용 shadcn ui) | 8 | 도메인 무관 — 분포 계산에서 제외 |

도메인 특정 미사용 파일 14개 중 **11개(79%)가 구세대 도메인(metaverse·draft·battle)에 집중**, 신축 도메인은 0개. 직전 진단의 정성 관찰("감점이 post-detail/write/metaverse에 몰림")과 독립된 정량 지표가 같은 방향을 가리킴. **가설: 죽은 코드 분포 기준으로 지지됨** (타입/린트 에러 기준은 데이터 부재로 미결).

---

## 4. 리스크 매트릭스 (영향도 × 수정 난이도) — 결정 반영판

```
영향도 ↑
 高 │ R1 월드컵 라이브 404        │ R3 갈드컵 삭제 D-목록 5파일  │ R7 betman 파싱 3중복 통합
    │  → [결정] H-목록 숨김으로 해소│  → [결정] 삭제 확정          │  ※ 이벤트 데이터 공급원이라 격상
 ───┼────────────────────────────┼─────────────────────────────┼──────────────────────────
 中 │ R2 *-types → types/ 이사    │ R5 사이드바 쿼리 공용화       │ R8 use-write-editor 분해
    │ R4 차단 스텁 → 실구현 연결  │ R6 silent catch 가시화        │
 ───┼────────────────────────────┼─────────────────────────────┼──────────────────────────
 低 │ R9 sync-orchestrator 삭제   │ R10 미사용 30파일 일괄 정리   │ R11 Phaser 씬 1,078줄 분해
    │ R12 shadcn ui 8파일·루트위생 │    (knip 재실행 검증 후)      │
    └────────────────────────────┴─────────────────────────────┴──────────────────────────
      낮은 난이도                   중간 난이도                    높은 난이도          난이도 →
```

**권장 순서 (월드컵 이벤트 일정 기준)**: H-목록(숨김 2곳 — P0 해소, 이벤트 전 필수) → D-목록(갈드컵 삭제) → 도구 4종 재실행(§0) → R7(이벤트 전 betman 파싱 안정화) → R2·R4 → R9·R10 → R5·R6 → R8·R11.

---

## 5. 다음 감사를 위한 미결 항목

1. madge 정상 재실행 → 의존 방향 점수 ±1 확정
2. tsc/eslint 재실행(양 스트림 캡처) → "두 세대" 가설의 에러 분포 검증 + 타입 안전성 +1 여부
3. knip scripts 엔트리 매칭 해소 후 재실행 → `lib/betman/game-fetcher` exports 및 lib 5파일 오탐 여부 확정
4. ~~`worldcup_*` 테이블 ↔ 이벤트 공유 여부~~ → 테이블 전체 보존 결정으로 긴급도 하락 (이상형 월드컵 부활 검토 시 재개)
5. RLS ↔ `createServiceRoleClient` 사용처 교차 보안 감사 (직전 리포트부터 이월)
6. **[신규] 월드컵 이벤트 경로 사전 점검**: `event_slug` 파이프라인(`use-betting-matches` → `/api/sports/games?event=` → `use-betting-slip` event_slug 제출 → `event_leaderboard_snapshots` 집계) E2E 검증 — 이벤트 오픈 전 필수

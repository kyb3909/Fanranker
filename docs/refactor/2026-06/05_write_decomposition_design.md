# 4b — use-write-editor 분해 설계 (design-only, 2026-06-11)

> 플랜 규정: 본 문서 승인 후 실행. **동작 변경 0 — 분해는 이동이지 재작성이 아니다.**

## 현황

`hooks/use-write-editor.ts` 435줄 단일 훅. reducer(17필드) + 6개 관심사가 한 파일:
URL 파라미터/수정모드 로드/카테고리 SWR/flair·teamFlair 로드(에디터 상태), 하단 이미지 업로드,
OG 프리뷰, 제출(검증→커버 업로드→POST/PATCH→리다이렉트→analytics), setter 7종, canSubmit.

**플랜 대비 이탈**: 플랜이 예상한 경계 "임시저장"은 실제 코드에 존재하지 않음 → 경계 미생성 (가공의 경계를 만들지 않는다).

## 분해 경계 (4 + 합성 루트)

핵심 제약: **reducer 는 쪼개지 않는다.** 17필드가 교차 참조됨(예: 제출이 imageFile/ogData 읽음) —
상태를 나누면 동작 변경 위험. 대신 reducer 는 합성 루트에 남기고, 각 경계는 `(state, dispatch)` 를
받는 서브 훅으로 이동한다 (use-betting-* 패턴과 동일하게 `hooks/` 플랫 배치).

| # | 파일 (신규) | 이동 대상 (현재 줄) | 책임 |
|---|---|---|---|
| 1 | `hooks/use-write-form.ts` | reducer+초기 state(42–141), URL effect(143–146), flair/teamFlair effect(149–165), 수정모드 로드 effect(167–189), setter 7종(387–398), canSubmit(373–385), communities SWR(117–121) | 에디터 폼 상태 |
| 2 | `hooks/use-write-uploads.ts` | handleBottomImages(191–243), handleRemoveImage(245–247), `MAX_IMAGES_PER_UPLOAD` | 업로드 |
| 3 | `hooks/use-write-og.ts` | handleFetchOg(249–285) | OG/소스 URL 프리뷰 |
| 4 | `hooks/use-write-submit.ts` | handleSubmit(287–371) — 검증·커버 업로드·POST/PATCH·trackEvent·리다이렉트 | 제출 |
| 루트 | `hooks/use-write-editor.ts` (유지) | 1–4 합성, **반환 API 불변** | 합성 루트 |

타입(Category/Flair/TeamFlair/OgData/EditorState/EditorAction)은 `hooks/use-write-form.ts` 에
함께 이동, 루트가 재노출. (P2 의 types/ 이사는 write 도메인 외부 소비자가 없어 보류 — 생기면 그때.)

## 불변 조건 (게이트에서 검증)

1. `useWriteEditor()` 반환 객체의 키/시그니처 **완전 동일** → 소비 컴포넌트(write 페이지) 수정 0줄.
2. effect 실행 순서/의존성 배열 동일 (이동만, 재배선 없음).
3. fetch URL·페이로드·토스트 문구·analytics 이벤트 바이트 단위 동일.
4. Phase 3 인벤토리의 write 도메인 catch 6건은 **이 단계에서 손대지 않음** (3b 백로그 별건 유지 — 이동 시 원문 그대로).

## 게이트

tsc 0 · eslint 0 · vitest 전체 green · build 0 · knip clean(신규 훅 4개가 루트에서 소비됨) ·
e2e `write.spec.ts` chromium — 4a 와 동일하게 베이스라인 대비 diff 중립 판정 (스테일 스펙 존재 시).
수동: 글 작성→이미지→발행→상세, 수정 플로우 (prod 로그인 체크리스트).

## 대안 검토 (기각)

- **reducer 를 경계별 분할**: 교차 참조 재배선 필요 → 재작성에 해당, 동작 변경 위험. 기각.
- **한 파일 내 함수 추출만**: 파일 길이 문제 미해결, 경계가 import 로 강제되지 않음. 기각.

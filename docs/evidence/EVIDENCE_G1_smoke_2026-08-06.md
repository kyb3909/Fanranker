# EVIDENCE — G1 스모크 (2026-08-06)

> G1 = EVIDENCE 체계 가동 첫 실전. 신규 검증 코드 0 — 기존 스위트를 술어로 묶어
> 기준선을 박제하는 게이트다. (GAUNTLET_KICKOFF §4-G1, SPEC 승인 2026-08-06)

## 판정 한 줄

**PASS** — 술어 3/3 전부 1회차 통과. 이 문서가 이후 모든 게이트의 기준선(baseline)이다.

## 술어 결과

| # | 술어 | 기준 | 결과 | 수치/근거 |
|---|---|---|---|---|
| A | 타입 무결 | `tsc --noEmit` 에러 0 | ✅ | 에러 0, 8.4s |
| B | 단위·계약 테스트 | vitest 전 파일 green | ✅ | **1,208/1,208** (101 files), 18s. 사가 순수함수 계약(오피셜 게이트·D7 전이·URL 접기·identity·cluster·tier) 포함 |
| C | 프로덕션 스모크 | Playwright chromium, 실패 0 | ✅ | **164 passed / 12 skipped / 0 failed**, 3.3m — `BASE_URL=https://gongnori.fan` (webServer 스킵, 실서비스 대상) |

## 실행 로그 요약

- 명령: `pnpm exec tsc --noEmit` / `pnpm test` / `BASE_URL=https://gongnori.fan pnpm exec playwright test --project=chromium`
- 소요: 합계 ~4분 / 반복: **1회** 사용 (경계: 2회)
- 특이: C의 12 skipped 는 테스트 설계상 조건부 스킵(로그인 의존 등) — 실패 아님. 목록 확인은 선택 과제.

## 미통과 항목과 원인 추정

없음.

## 다음 액션

1. **G2 SPEC 제시** (빌더) — 골든셋 시트 초안: saga_reservoir 실데이터 혼합 100건 (published/discarded/queued 섞기, 오너 승인 완료된 방식) + `scripts/gauntlet/batch-test.ts` 설계 + batch-critic 에이전트 정의.
2. 골든셋 라벨 확정 (오너) — 시트 초안이 나오면.
3. (선택) C의 12 skipped 목록 점검 — 죽은 스킵인지 정당한 조건부인지.

## 세션 연속성 메모

- 이번 세션: H0 오딧(`docs/harness/H0_AUDIT.md`) → 오너 결정 3건(G4 백로그 / 골든셋 실데이터 혼합 / 자동발행 유지·소급 검증) → G1 구축·통과.
- 다음 세션 이어받을 지점: G2 SPEC부터. 골든셋 원천은 saga_reservoir(158건+, extracted 보유). 배치 인터페이스는 `lib/saga/extract.ts extractTransferBatch` — LLM 재실행 비결정성 때문에 (a) 저장된 추출 결과 대조(회귀 모드) vs (b) 재추출 대조(현행 정확도 모드)를 SPEC에서 구분할 것.
- 이 기준선 시점의 코드: main `568ab5cf` (오피셜 게이트·URL 4관문 배선 포함).

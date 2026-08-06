# H0 — 건틀릿 하네스 사전 오딧

- 수행: 2026-08-06 (킥오프 §3)
- 결론 요약: **인프라 기반은 킥오프 가정보다 좋고, 전제 하나는 무너졌다.** 테스트·크리틱·EVIDENCE 관례가 이미 실전 가동 중이라 G1~G3는 얇게 얹으면 되고, **G4(정산 건틀릿)는 오늘 확정된 D15(9/1 정산 취소)로 전제가 사라져 오너 결정이 필요하다.**

---

## 1. 필독 문서 정독 — 완료 + 킥오프 문서의 낡은 지점

`SAGA_ENGINE_PRD.md`(§3 D1~**D15**)·`P0_AUDIT.md` 정독 완료 (금일 세션에서 심층 사용).
킥오프 문서 v1.0(2026-08-06)은 **같은 날 확정된 사실 3개보다 낡다** — §0.6(모순 발견 시 보고) 이행:

| 킥오프 서술 | 현재 사실 (2026-08-06 확정) |
|---|---|
| "8/31 = **대량 정산일** = 하드 데드라인", G4 = 8/31 전 필수 | **D15: 9/1 대량 정산 취소** (오너 확정, PRD 결정 로그 등재). 8/31은 데드라인 데이(로그 종결)로만 유효. 정산 코드 0줄 = 문서와 정합 상태 |
| "현재 국면: W1, 크롤러+추출+UI 구축 중" | **W1~W3 완료, MVP 라이브** (8/3), 자동발행 가동(8/4), 7단계 점검 + P1 3건 수리 완료(8/6). `workspace/saga-inspect-2026-08-06-final.md` |
| "사가 폴(saga_polls)" | 실체는 **saga_votes** (P0_AUDIT §2-3 정정). 현재 0행 |
| "100건 배치 테스트 **통과 전 자동 발행 금지**" | 자동발행이 이미 8/4부터 가동 중 (운영자 지시). G2는 사전 게이트가 아니라 **소급 검증 + 상시 회귀 게이트**로 성격이 바뀐다 |

## 2. 테스트 인프라 현황

| 항목 | 실측 |
|---|---|
| 러너 | vitest 4.x (`vitest.config.ts`, jsdom, `__tests__/**`) |
| 규모 | **101 files / 1,208 tests** 전부 통과 (2026-08-06) |
| 커버리지 | v8 + **래칫 임계** stmts 12.5 / branch 12.5 / func 14.5 / lines 12 (내리기 금지 관례) |
| Playwright | 3 config 분리 — `playwright.config.ts`(스모크), `playwright.e2e.config.ts`(여정, 포트 3100 격리), `playwright.audit.config.ts`(BFS 감사) |
| CI | `.github/workflows/ci.yml` (lint/test) |
| 사가 순수함수 계약 | identity·cluster·tier·stages(오피셜 게이트·D7 전이)·url-fold 등 이미 테이블 테스트로 고정 — **즉시 술어로 사용 가능** |

## 3. 정산 로직 위치 (G4 대상 확인)

- **사가 정산: 코드 0줄 — 이것이 정합 상태다** (D15). `saga_settlements`(0행)·`saga_settled` 알림 CHECK는 재개 대비 스키마만 존재.
- 포인트 원장: `award_points(user_id, board_slug, amount, type, description, related_id)` RPC — ⚠️보드당 일 100점 상한, 초과분 조용히 절삭 (P0_AUDIT §1).
- 살아있는 정산: **betman 매치 예측 정산** `lib/betman/settle.ts` — CAS(`.eq status pending`)+3회 재시도+`settlement_audit_log`+15분 settle-pending 안전망 cron. 2026-05-30 betting-integrity 리뷰(PR#2)로 정산 정확도 100% 검증 이력 있음. **매일 운영 중이며 8/31과 무관.**
- `[H0확인]` 답: 사가 투표 정산은 존재하지 않으므로 "두 경로 동일 원장 술어" 질문 자체가 소멸.

## 4. 크롤러/추출 파이프라인 — 배치 인터페이스

- 파이프라인 라이브: saga-ingest(:12/:42) → saga-extract(15분, gpt-4o-mini 20건 배치) → 자동발행 4조건 / admin2 검수.
- **배치 대조 인터페이스 존재**: `lib/saga/extract.ts` `extractTransferBatch(titles[])` — 제목 in → `{player, direction, stage_signal, confidence, headline_ko}` out. 정규화(`canonicalizePlayer`)·클러스터(`cluster.ts`)·티어(`tier.ts`)는 순수 함수라 라벨 대조가 결정론적으로 가능.
- **골든셋 원천**: `saga_reservoir` 실데이터 **158건+** (전건 extracted 보유, published 55/discarded 32/rejected 9 = 사람 판정 흔적 포함). 100건 추출은 여기서 하면 되고, 라벨 확정은 킥오프 원칙대로 오너 몫.
- 드라이런 관례 기존재: `scripts/saga-drain-queue.ts`, `saga-backfill-dryrun.ts`, 금일 `saga-restage-done.ts`(드라이런→`--apply`) — batch-test.ts는 이 관례를 따르면 된다.
- ⚠️ 유의: extract는 LLM 호출이라 **재실행 비결정성**이 있다. 배치 테스트는 (a) 고정 입력·저장된 출력 대조(회귀), (b) 재추출 대조(현행 정확도) 두 모드를 구분해야 한다 — G2 SPEC에서 정의.

## 5. `.claude/` 현황

- `agents/` 6종: visionary·realist·contrarian·synthesizer(브레인스토밍 4인조), researcher, style-only-auditor — **건틀릿용 크리틱 없음** (신규 필요: batch-critic).
- `commands/` 3종: design-reskin, gongnori-brainstorm, redesign-safe.
- 프로젝트 `skills/` 디렉토리 **없음** (신규 생성 대상).
- 참고: 금일 사가 7단계 점검이 "격리 크리틱 3인(증거 재현/불변조건/반증) → 편집장 종합"을 수동으로 실증 — 크리틱 정의서에 그대로 옮길 검증된 원형이 있다.

## 6. 선행·참고 자료 검증 (§0.4)

- `docs/AUDIT_REPORT.md` ✅ 존재 / `ARCHITECTURE_MAP.md` ❌ 없음 / `CODE_DIAGNOSIS.md` ❌ 없음 → 없는 두 문서는 참조하지 않고 진행 (내용 필요 시 오너에게 위치 확인).
- 참고 리포 4종(§8): 클론·의존 계획 없음 → 실존 검증 생략, 개념은 §2 기준. (의존이 생기는 순간 검증 선행.)

## 7. 판정 요약

**지금 바로 술어로 쓸 수 있는 것**
- vitest 1,208 (사가 순수함수 계약 다수 포함) + 커버리지 래칫
- Playwright 스모크 3계열
- 프로덕션 실측 SQL 관례 (funnel·정합성 쿼리 — 금일 점검 §7 목록)

**새로 만들어야 하는 것**
- `docs/evidence/` + 템플릿 (G1)
- `scripts/gauntlet/batch-test.ts` + 골든셋 라벨 시트 초안 (G2)
- `overlap-check.ts` · `banned-phrases.ts` + 금지어 사전 (G3)
- `.claude/agents/batch-critic.md`, `.claude/skills/gauntlet/SKILL.md` (G2)

**조정이 필요한 것**
- **G4**: D15로 전제 소멸 → 폐기(백로그) 또는 대상 변경(betman 정산 — 단 이미 검증 이력 있고 8/31과 무관이라 스코프 크리프 성격). **오너 결정 필요.**
- **G2**: "통과 전 자동발행 금지"는 시효 경과 → "소급 검증 + 프롬프트/사전 변경 시 상시 회귀 게이트"로 재정의.
- settlement-critic (G4 부속): G4 결정에 종속.

## 8. Open Questions (모아서 — §6 관례)

| # | 질문 | 추천 |
|---|---|---|
| Q1 | **G4 처리**: (a) 백로그로 이동 (b) betman 정산으로 대상 변경 (c) 원안 유지(사가 정산 — D15와 모순) | **(a)** — 원샷 이벤트가 사라졌고, betman 정산은 검증 이력+안전망 cron 보유 |
| Q2 | 골든셋 100건 소스: saga_reservoir 실데이터에서 내가 시트 초안 추출(구성비: published/discarded/queued 섞어 난이도 확보) → 오너 라벨 확정. 이 방식으로 진행? | 예 — 실기사·실판정 흔적이 최고의 골든셋 |
| Q3 | G2 통과 전까지 자동발행: PRD 원문대로면 꺼야 하나, 8/4 운영자 "무제한" 지시로 가동 중 | **켠 채 소급 검증** — 오늘 배치된 게이트들(오피셜 게이트·URL 접기·검사관)이 방어 중 |
| Q4 | 타임박스: G1(반나절)+G2·G3(1~1.5일) 내 완료 목표, G4는 Q1 결정 반영 | 확인만 |

**승인 시 다음 단계: G1 SPEC 제시** (킥오프 §6 프로토콜).

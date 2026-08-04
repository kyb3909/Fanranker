# 사가 엔진 점검·보완 브리핑 (for Codex)

> 이 문서는 gongnori.fan의 **사가(Saga) 시스템**을 점검·보완하기 위한 온보딩 프롬프트다.
> 작성: 2026-08-04. 아래 "불변 조건"은 오너가 확정한 설계라 **재논의·변경 금지**이며,
> 모순이나 기술적 불가를 발견하면 고치지 말고 보고서에 open question으로 남겨라.

## 0. 미션

사가 파이프라인(수집→추출→자동발행→검수→위키 성장)의 **프롬프트·매칭·클러스터링 품질을
점검하고 보완**한다. 목표는 "무결": 오연결·오분류·중복이 프로덕션 위키에 닿지 않는 것.

## 1. 필독 순서 (코드보다 먼저)

1. `docs/saga/SAGA_ENGINE_PRD.md` — 전체 설계. **§3 결정 로그(D1~D14)는 재논의 금지.**
2. `docs/saga/P0_AUDIT.md` — 확정 스키마. §5 초안과 다르면 **오딧 문서가 우선**.
3. `CLAUDE.md`의 "Saga Engine" 섹션 — 작업 원칙 요약.

## 2. 시스템 지도 (2026-08-04 현재, 전부 라이브)

### 개념
- **사가 = 자동 생성되고 이벤트마다 자라는 살아있는 위키 문서.** `/saga/[slug]`.
- 타입 3종: `transfer`(이적, Phase A 라이브) / `season`(팀 시즌 연대기) / `match`(Phase B 예정).
- TransferSaga identity = **선수 + 이적 윈도우** (D2: 목적지 클럽 없음. 그리고 2026-08-04
  운영자 확정으로 **방향(in/out)이 달라도 같은 선수면 같은 문서** — 선수당 스레드 1개,
  커밋 3a4ea3d3의 동일인 가드).

### 파이프라인 (Vercel cron)
```
saga-ingest (매시 12,42분)   티커 2차소비 + 해외 RSS → saga_reservoir 적재 (멱등: source_url unique)
saga-extract (15분 간격)     'ingested' → LLM 추출(gpt-4o-mini, 제목만) → 정규화 → 'queued'
                             → 자동발행 4조건 충족 시 즉시 사가 엔트리 발행:
                               ① 사전 등재 선수 ② confidence ≥ 0.7 ③ 한국어 헤드라인 ④ 여자축구 아님
                             → 미달분은 큐 잔류 → /admin/news-review 하단 SagaReviewQueue에서 사람 검수
saga-deadline (매일 00:05)   윈도우 마감 처리
```

### 뉴스 기사 ↔ 사가 연동 (발행 경로 단일화: `lib/news/publish.ts`)
- 기사 발행 시 `after()`에서 `linkArticleToSaga`: 이적 기사면 추출→사가 엔트리 append
  (+`saga_article_links`), 비이적 기사면 `linkArticleToSeasonWiki`(팀 별칭 텍스트 매칭).
  **fail-open: 연동 실패가 발행을 절대 막지 않는다.**
- 검수자가 검수 화면에서 사가를 직접 지정 가능(`linkArticleToSagaChosen`) — 자동/안 함/
  기존 사가 선택/새 사가 생성. 수동 지정은 LLM 추출을 건너뛰고 **동기 처리 + throw**
  (실패를 조용히 삼키지 않고 응답으로 보고, 발행은 유지).
- 뉴스 자동발행 cron(`news-auto-publish`, NEWS_AUTO_PUBLISH=on)은 발행 전 검사관
  (`lib/news/quality-gate.ts`, **gpt-5.6-terra**)을 fail-closed로 통과해야 한다.

### 핵심 파일
| 파일 | 역할 |
|---|---|
| `lib/saga/extract.ts` | 제목→{선수,방향,클럽,단계,confidence,한국어 헤드라인} LLM 추출. 20건 배치 |
| `lib/saga/identity.ts` | player_key 정규화, identity_key, 동일인 판정(isSamePlayerKey), slug |
| `lib/saga/create.ts` | getOrCreateSaga(동일인 가드 포함), appendEntry(cluster_key 멱등, 범프, stage 전이) |
| `lib/saga/publish.ts` | upsertSagaEntry(D9 에코 접힘), linkArticleToSaga/Chosen/SeasonWiki, 검수 발행 |
| `lib/saga/cluster.ts` | 원출처 클러스터링, titleSimilarity |
| `lib/saga/tier.ts` | 매체 티어 규칙 판정 (오피셜=공식발표만 / 기자발 확정=유력 / 나머지=루머) — LLM 아님 |
| `lib/saga/canonical.ts` | 표기 사전(news_alias_dictionary) 기반 선수명 정규화 |
| `lib/saga/stages.ts` | interest→contact→bid→negotiation→medical→done 플로우 |
| `lib/news/quality-gate.ts` | 발행 전 검사관 (본문+이미지, gpt-5.6-terra, fail-closed) |
| `lib/news/learn-corrections.ts` | 수정 diff → 표기 교정 학습 (환각 가드: 실재 문자열만) |
| `app/api/cron/saga-{ingest,extract,deadline}` | 위 cron 본체 |
| `app/api/cron/news-learn-edits` | 발행 후 수정 줍는 학습 cron (매일 22:30 KST) |
| `app/api/admin/published-fixes` | 발행된 기사·사가 엔트리·사가 이름 사후 교정 API (+학습) |
| `app/admin/news-review/*` | 통합 검수 화면 (기사 검수 + 사가 큐 + 사후 교정) |

### 테이블 (Supabase)
`saga_reservoir`(수집 큐: ingested→queued→published|discarded) / `sagas`(identity_key unique,
subject jsonb, stage, last_event_at, anchor_post_id) / `saga_entries`(saga_id+cluster_key unique,
headline, tier, origin, echoes[]) / `saga_article_links`(post_id PK → saga_id, entry_id) /
`news_alias_dictionary`(표기 사전 — 학습 결과 축적).

## 3. 불변 조건 — 위반하는 수정 금지

1. **D2**: transfer identity에 목적지 클럽을 넣지 않는다 (문서 쪼개짐 방지).
2. **D5**: 기사 본문 저장·표시 금지. 제목+매체+링크+완전 재작성 요약만.
3. **D9**: 같은 (사가, cluster_key) 중복은 **에코로 접는다** — 기존 엔트리 덮어쓰기 금지,
   origin은 먼저 보도한 매체 유지.
4. **D7**: 미확정 사가 noindex + 루머 배너. `stage=done`에서만 `is_confirmed=true`.
5. **동일인 가드**: 같은 윈도우에서 성이 같고 이름이 부분집합이면 같은 선수 → 기존 문서 합류.
   빈 player_key 사가 생성 금지 (유령 사가 실사고).
6. **발행 경로 fail-open**: `linkArticleToSaga` 실패가 기사 발행을 막으면 안 된다.
   반대로 검사관(quality-gate)은 **fail-closed** — 판단 불가면 발행 보류가 맞다.
7. **GPT-5 계열(terra 등)에 `temperature` 파라미터 전달 금지** — 400 에러 → fail-closed라
   전건 반려로 조용히 죽는다. (기존 4o-mini/4.1-mini 호출의 temperature는 유지 가능.)
8. **티어 판정은 LLM에 맡기지 않는다** — `lib/saga/tier.ts` 규칙이 단일 소스.
9. **VPS 무수정** — 티커(news_ticker_items)는 읽기만 한다.
10. **런타임 멀티에이전트 금지** — cron + 구조화 프롬프트 단순 체인만.
11. 콘텐츠는 **전부 한국어**, 드라이 톤(감상·질문·평가 금지). 한국 매체 기사는 피드 금지(사가 연표는 예외).
12. 표기 사전 학습은 **환각 가드 필수** — 원문/수정본에 실재하는 문자열만 등재.

## 4. 점검·보완 요청 (우선순위순)

### A. 추출 프롬프트 품질 (`lib/saga/extract.ts`)
- direction(in/out) 판별 로직: "클럽이 선수를 쫓음=in / 결별=out" 정의가 모호한 케이스
  (임대 복귀, 재계약, 스왑딜)에서 흔들리는지. 실데이터 `saga_reservoir`의
  extracted 결과로 검증 가능 (discarded 사유 `not_transfer`/`no_player` 분포 포함).
- confidence calibration: 자동발행 임계 0.7이 실제 정확도와 정합하는지.
- headline_ko 드라이 톤 준수 여부.

### B. 클러스터링 경계 (`cluster.ts` + `publish.ts`의 cluster_key)
- cluster_key = `선수:단계:KST일자` — **KST 자정을 넘긴 같은 소식이 엔트리 2개가 되는
  경계 문제**가 실재하는지 데이터로 확인, 필요 시 보완안 제시 (D9 방향: 병합이 보수적).
- `titleSimilarity` 0.5 임계의 오탐/미탐.

### C. 동일인 가드 edge cases (`identity.ts` `isSamePlayerKey`)
- 동성이인(Jordan/Dean Henderson), 하이픈 성(Ward-Prowse), 접미사(Jr) 케이스 테스트 보강.
- 가드가 병합을 포기하는 경로(동성이인 혼재)의 실동작.

### D. 검사관 프롬프트 (`lib/news/quality-gate.ts`)
- 판정 기준의 누락: 과거 실사고 = Substack 구독배너 이미지, 여자축구 혼입(URL에만 표기),
  영어 미번역 문장, 무내용 필러 글, 환각 음차. 이 사고들이 프롬프트에 반례로 충분히
  반영됐는지. (모델은 gpt-5.6-terra — 불변 조건 7 준수.)

### E. 미등재 선수 큐 적체 — **1차 구현 완료 (2026-08-04). 검증만 하라.**
- 구현: `lib/news/alias-suggest.ts`(자모 유사도·후보 파싱) + `/api/admin/player-dictionary`
  + `components/admin/player-dictionary.tsx`. 게이트가 막은 이름을 모아 1클릭 등재
  (alias 흡수 / 대표 승격 / 신규 등재 3갈래). 자동 등재는 여전히 금지.
- 실측: 미등재의 상당수가 신규 선수가 아니라 **기존 항목의 음차 흔들림**
  ("비니시우스 주니오르"(정) ↔ "비니시우스 주니어"(오)). 자모 분해 유사도로 잡는다.
- **코덱스 몫**: `koSimilarity` 임계값(현재 0.5)의 오탐/미탐 검증, 실제 사전으로
  후보-제안 매칭 정확도 측정, 동성이인 오흡수 위험 점검. 테스트는
  `__tests__/lib/news/alias-suggest.test.ts` 에 13건 있으니 확장할 것.

### F. 테스트 공백
- `__tests__/`에 saga 유닛 테스트 현황 파악 후, identity/cluster/tier의 순수 함수부터
  테이블 기반 테스트 보강 (vitest, `pnpm test`).

## 5. 작업 규칙

- 패키지: **pnpm 10**. 타입: `pnpm exec tsc --noEmit` (strict). 린트: `pnpm exec eslint .`
- pre-commit hook(lint-staged)이 있다 — **`--no-verify` 우회 금지**, 에러는 고쳐라.
- **git push 금지** — 커밋까지만. 사용자가 직접 push한다.
- Supabase 마이그레이션이 필요하면 `supabase/migrations/`에 파일만 추가하고 적용은
  사용자에게 맡겨라 (직접 DB 변경 금지).
- 주석·커밋 메시지는 한국어, "왜"를 남기는 스타일 (기존 코드 참조).
- 프롬프트 수정 시: 변경 전후를 실데이터 30~50건으로 드라이런 비교해 오탐/미탐 수치를
  보고서에 남겨라. 수치 없는 프롬프트 변경은 받지 않는다.
- 결과물: 코드 수정 + `workspace/codex-saga-review-{날짜}.md` 보고서
  (발견 사항 / 수정 내역 / 드라이런 수치 / open questions).

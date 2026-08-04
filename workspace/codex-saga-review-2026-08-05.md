# 사가 파이프라인 조사 보고서

- 조사일: 2026-08-05 (KST)
- 기준: `workspace/codex-saga-briefing.md`, `docs/saga/SAGA_ENGINE_PRD.md`, `docs/saga/P0_AUDIT.md`
- 범위: ingest → extract → queue/auto publish → saga/entry/echo → 기사 연결
- 제외: 프롬프트 변경, runtime 구조 개편, 운영 DB dry-run, VPS 변경

## 1. 요약

사가 파이프라인은 작동 가능한 구성요소를 갖췄지만, 문서에 설명된 identity·cluster 규칙과 실제 발행 경로가 일치하지 않는다. 가장 큰 위험은 다음 네 가지다.

1. `identityKey`는 direction을 포함하고 테스트도 in/out을 별도 identity로 보지만, runtime `getOrCreateSaga`는 같은 window의 활성 선수 문서에 direction이 달라도 합칠 수 있다.
2. `clusterBatch`의 제목 유사도·origin/echo 선출은 실제 `publishReservoirItem`에서 호출되지 않는다. runtime은 같은 선수·stage·KST 날짜면 하나로 접는다.
3. saga, anchor post, entry, echoes, reservoir 상태 변경이 단일 트랜잭션이 아니어서 부분 성공이 가능하다.
4. extract·publish·운영자 API의 여러 DB 오류가 이전에는 정상 응답이나 반복 상태로 숨었다. 허용 범위 안에서 이 부분만 보완했다.

최신 owner 기준인 “이적 방향이 바뀌어도 같은 선수 문서”를 실제 invariant로 채택한다면 identity key, `saga_hint`, admin 조회, runtime lookup, tests를 한 번에 맞춰야 한다. 이번 라운드에는 구조 변경을 하지 않았다.

## 2. 실제 실행 경로

```text
news_ticker_items(transfer/rumor) + RSS
  → /api/cron/saga-ingest (:12/:42)
  → saga_reservoir[raw]
  → /api/cron/saga-extract (3/18/33/48분)
     ├─ 비이적/낮은 신뢰도 → discarded 또는 queued/auto_hold
     ├─ 사전 일치 + confidence >= 0.7 + 한국어 headline + 비여자축구
     │    → publishReservoirItem 자동 발행
     └─ 나머지 → queued → /admin2/saga 운영자 발행/반려
  → getOrCreateSaga
  → anchor post / sagas / saga_entries / echoes
  → saga_reservoir[published]

별도 경로:
published news article → linkArticleToSaga → 기존 saga entry 연결(fail-open)
```

등록 주기는 `vercel.json`에서 확인했다. `/admin2/saga`는 유일한 발행 경로가 아니며 자동발행과 병렬이다.

## 3. identity 모순

### 현재 코드

- `identityKey("transfer", { player_key, direction, window_key })`는 direction을 포함한다.
- `clusterBatch()`도 그 키로 먼저 saga group을 나눈다.
- admin queue는 reservoir의 `saga_hint`와 `sagas.identity_key`를 직접 매칭해 기존 문서를 보여준다.
- 반면 `getOrCreateSaga()`는 같은 선수·window의 활성 saga를 스캔해 exact identity가 아니어도 기존 문서를 선택할 수 있다.

### 결과

- admin 화면은 “기존 saga 없음”으로 표시했는데 발행 시 반대 direction 문서에 합쳐질 수 있다.
- 같은 데이터가 dry-run에서는 둘로 나뉘고 runtime에서는 하나로 합쳐질 수 있다.
- direction이 문서 identity인지 entry 속성인지가 코드베이스에서 동시에 두 의미로 쓰인다.

### 권고

최신 owner 기준대로 direction을 entry 속성으로 내리고 선수+window를 saga identity로 삼는 안을 우선 제안한다. 단, 이는 구조 변경이므로 owner 승인 뒤 migration, lookup, hint, tests, 기존 중복 saga merge 계획을 함께 작성해야 한다.

## 4. cluster·echo 모순

`lib/saga/cluster.ts`는 같은 stage·KST 날짜 안에서도 낮은 신호(`interest/contact/null`)는 제목 Jaccard 유사도가 임계값 이상일 때만 echo로 접는다. 반면 실제 `lib/saga/publish.ts`는 다음 형태의 키를 쓴다.

```text
normalizePlayerKey(player):stage_signal_or_news:KST_date
```

따라서 runtime에서는 같은 날의 서로 다른 interest 사건도 한 entry의 echo로 접힐 수 있다. 반대로 KST 23:59와 다음 날 00:01의 동일 사건은 둘로 갈라진다. title similarity 코드는 테스트·dry-run 도구에만 있고 production 발행과 공유되지 않는다.

이번 라운드에 추가한 순수함수 테스트는 다음 현재 계약을 고정한다.

- 출처 대괄호·구두점 차이는 같은 제목으로 본다.
- 공통 사건 토큰이 없으면 유사도 0이다.
- 같은 날 낮은 신호는 제목이 닮을 때만 echo다.
- KST 날짜가 다르면 다른 cluster다.

이 테스트는 runtime 동작을 보증하지 않는다. 오히려 dry-run/설계와 runtime 간 차이를 재현 가능한 상태로 만든 것이다.

## 5. 침묵 실패 조사

| 등급 | 경로 | 이전 동작 | 이번 보완 | 남은 위험 |
|---|---|---|---|---|
| P1 | `saga-ingest` ticker 조회/count | DB 오류에도 빈 결과·성공 가능 | 오류 500 | RSS 개별 실패 지표 필요 |
| P1 | `saga-extract` LLM null | raw/queued 반복, 원인 불명 | `extract_failed` 저장 | retry 횟수/dead-letter 없음 |
| P1 | `saga-extract` auto hold | gate 이유가 DB에 안 남음 | `auto_hold:<reasons>` 저장 | 구조화된 reason column이 아님 |
| P1 | `saga-extract` auto publish catch | console도 없이 queued 잔류 가능 | 오류 저장·로그 | 재처리 정책 없음 |
| P1 | `publishReservoirItem` echo update | DB 오류 무시, retry 시 echo 중복 | 오류 throw + URL/제목 dedupe | 동시성 race는 남음 |
| P1 | reservoir published update | 오류 무시, 이미 발행했는데 queued 유지 | 오류 throw | retry하면 entry 중복 가능, transaction 필요 |
| P1 | saga status update | 오류 무시 | 오류 throw | 앞선 entry write는 이미 성공 가능 |
| P1 | `/admin2/saga` GET/reject | 조회 실패를 빈 큐, 반려 실패를 성공으로 응답 | 오류 500·로그 | UI 재시도/알림 정책 필요 |
| P1 | anchor post → saga insert | saga insert 실패 시 orphan anchor | 변경 안 함 | RPC/transaction 필요 |
| P1 | article-to-saga hook | 자동 연결 실패는 뉴스 발행 유지, console만 남음 | 변경 안 함 | reconciliation 큐 필요 |

fail-open 자체는 뉴스 발행을 지키는 요구에 맞지만, “나중에 반드시 복구”할 경로가 없으면 사실상 silent loss다. 자동 연결 실패를 별도 queue로 남기고 재조정하는 방식을 제안한다.

## 6. 정책 gate

사가 자동발행 조건에 별칭 사전 일치가 포함되어 있어 사전이 품질·안전 gate 역할을 한다. 그러나 `naming-librarian`과 다른 학습 writer가 사전을 자동 변경할 수 있으므로 “사람이 승인한 표기만 통과”라는 전제가 깨질 수 있다. 사가 prompt를 다듬기 전에 dictionary writer를 후보 생성과 승인된 실등록으로 분리하는 것이 우선이다.

또한 시즌 위키 연결은 이적이 아닌 entry에서 첫 팀 alias 일치 등을 사용하며, 불일치·복수일치가 운영 audit으로 남지 않는 경로가 있다. 잘못된 링크보다 링크 없음이 안전하므로 fail-closed를 유지하되 reason count를 남기는 편이 좋다.

## 7. 이번 변경과 검증

변경:

- ingest/extract의 DB 오류·LLM null·auto hold/publish 오류 노출
- reservoir/saga 상태 write 실패를 throw
- 동일 URL+제목 echo 중복 추가 방지
- admin2 saga 조회·반려 실패 500
- “HITL 유일 경로”라는 잘못된 API 주석 수정
- identity 경계 테스트 2건, cluster 테스트 5건 추가

변경하지 않음:

- identity schema·migration
- runtime cluster 알고리즘
- prompt/model
- 자동발행 조건
- 트랜잭션/RPC
- 운영 데이터 또는 VPS

검증:

- 관련 테스트 37개 통과
- 전체 `pnpm test`: 89 files, 1,074 tests 통과
- `pnpm exec tsc --noEmit`: 통과
- `pnpm exec eslint .`: 오류 0, 기존 `<img>` 경고 1건

## 8. 다음 의사결정

1. saga identity를 `player+window`로 확정할지, direction 분리를 유지할지 owner가 결정한다. 최신 브리핑 기준 추천은 전자다.
2. runtime에 `clusterBatch`를 실제 적용할지, 하루 단위 fold를 공식화할지 결정한다. 현재는 문서와 runtime 중 하나가 틀리다.
3. saga publish를 DB RPC/transaction으로 묶고 idempotency key를 둔다.
4. article link failure용 reconciliation queue와 운영 화면을 둔다.
5. DB에서 source URL 중복, orphan anchor post, published인데 reservoir queued인 부분상태를 실측한다. SQL은 메인 보고서 7절에 포함했다.

운영 DB dry-run은 연결 도구 부재로 수행하지 않았다. 따라서 실제 cluster 수, 중복률, orphan 수치는 미확인이다.

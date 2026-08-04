# 뉴스룸 에이전트 구조 및 침묵 실패 조사 보고서

- 조사일: 2026-08-05 (KST)
- 우선순위: A. 에이전트 구조 재구성, B. 침묵 실패 전수 조사
- 기준 문서: `workspace/codex-newsroom-briefing.md`, `workspace/codex-saga-briefing.md`
- 조사 범위: 저장소 코드, Vercel cron 선언, VPS 배포본의 저장소 내 계보, 관련 테스트·운영 화면
- 제외: 운영 DB 실측, `/opt`의 실제 파일·crontab·환경변수 확인, VPS 변경, 프롬프트 변경, 구조 개편

## 1. 결론

현재 뉴스룸은 하나의 에이전트 체인이 아니라 **서로 다른 세 계보와 Vercel 후처리기가 같은 테이블을 공유하는 결합 시스템**이다.

1. `data/crawlers/runner.js` 계보: 소스 수집뿐 아니라 GPT 선별·요약까지 수행하고 `news_ticker_items`에 기록한다.
2. `scripts/vps-news-scanner/news-scanner.mjs` 계보: Reddit RSS를 별도로 훑고 기사 본문·트윗을 보강한 뒤 `/api/news/agent-draft`로 한국어 초안을 직접 쓴다. 현재 품질 초안의 주 생산 경로다.
3. `data/agents/*` 계보: collector → filter → writer → editor → format → publish의 수동/휴면 체인이다. README의 중단 지점과 실제 `run-cycle.sh`가 불일치한다.
4. Vercel cron: 자동 발행, 관심도, 만료, 사가, 히어로, 교정 학습, 명칭 사서가 위 산출물을 다시 판정·변경한다.

가장 중요한 P0는 두 가지다.

- **소실 P0:** VPS 스캐너가 후보를 처리하기 전에 `seen`에 넣는다. OpenAI·원문·draft API가 일시 실패해도 실행 끝에 저장되어 해당 후보를 다시 시도하지 않는다. 로그는 VPS 로컬 1회뿐이며 DB 단계 흔적이 없다 (`scripts/vps-news-scanner/news-scanner.mjs:710`, `:827`).
- **정책 P0:** “자동 사전 등록 금지, 후보만 만들고 사람이 클릭”이라는 최신 운영 불변식과 달리, 실등록 writer가 여러 개다. 특히 Vercel에 실제 등록된 `naming-librarian`이 자동으로 `news_alias_dictionary`를 변경한다 (`app/api/cron/naming-librarian/route.ts:126`). 이번 라운드에는 정책·구조 변경을 하지 않았다.

브리핑의 24시간 표본 `초안 128 → 발행 25`, gate 거절 27건만으로는 나머지 76건의 정확한 종착점을 설명할 수 없다. 코드상 만료 기준은 24시간이며, DB 실측 없이 이를 “전부 만료”로 단정할 수 없다. 아래 SQL로 상태·결정·연령별 funnel을 먼저 확정해야 한다.

## 2. A — 실제 에이전트 구조 재구성

```mermaid
flowchart LR
  S1[46 Reddit + 9 Naver 설정] --> R1[VPS crawler runner]
  R1 --> G1[GPT-5.1 선별·요약]
  G1 --> T[news_ticker_items]
  T --> SI[saga-ingest]
  T --> TF[기존 ticker 소비 화면]

  S2[Reddit RSS 별도 스캔] --> R2[VPS news scanner]
  R2 --> G2[원문 보강 + mini 작성·판정]
  G2 --> AD[/api/news/agent-draft]
  AD --> NR[news_reservoir]

  A1[data/agents 수동 체인] -. 수동 실행 가능 .-> NR
  NR --> IF[interest-filter]
  NR --> AP[news-auto-publish]
  NR --> HR[admin/news-review]
  AP --> P[posts]
  HR --> P
  P --> SL[article-to-saga link]

  SI --> SR[saga_reservoir]
  SR --> SE[saga-extract]
  SE --> SP[자동 또는 운영자 발행]
  SP --> SG[sagas + saga_entries]
  SL --> SG

  HR --> LC[교정 학습]
  P --> LC
  LC --> D[news_alias_dictionary]
  NL[naming-librarian] --> D
  D --> AP
  D -. 직접 소비 확인 안 됨 .-> R2
```

### 2.1 책임 지도

| 단계 | 실제 실행 주체 | 입력 → 출력 | 실행 상태 | 판정·중복 포인트 |
|---|---|---|---|---|
| 원천 수집·1차 선별 | VPS `data/crawlers/runner.js` 계보 | Reddit/Naver → `news_ticker_items` | 운영 추정, 10분 cron에서 각 소스 주기 적용 | GPT가 `is_news`를 판정한 뒤 탈락품을 버림 |
| 직접 초안 생산 | VPS `scripts/vps-news-scanner/news-scanner.mjs` 계보 | Reddit RSS/원문 → `/api/news/agent-draft` → `news_reservoir` | 운영 확인 기준 15분 | 별도 수집, 별도 가치 판정, 별도 seen 상태 |
| 다단계 뉴스룸 | `data/agents/run-cycle.sh` | raw → filtered → written → edited → formatted → published | Vercel 등록 없음, 수동/휴면 | README는 draft 중단이라 쓰지만 스크립트는 발행까지 수행 |
| 관심도 후판정 | `news-interest-filter` | pending draft → decision | Vercel 매시 :14 | 스캐너 판단 뒤 LLM 재판정 |
| 품질·자동발행 | `news-auto-publish` | drafted → posts | Vercel 매시 :07/:37 | 결정론 필터 + Terra 텍스트·이미지 gate |
| 수동 검수 | `/admin/news-review`, `/admin2` | drafted/queued → posts | 운영자 | 화면과 자동발행이 병렬 소비자 |
| 만료 | `news-expire-drafts` | 오래된 drafted → expired | Vercel 매시 | 실제 기준 24시간 |
| 사가 ingest | `saga-ingest` | ticker/RSS → `saga_reservoir` | Vercel :12/:42 | 뉴스 스캐너와 다른 원천 계보 |
| 사가 extract/publish | `saga-extract` + `lib/saga/publish.ts` | raw → queued/published → saga | Vercel 3/18/33/48분 | 사전 일치·신뢰도 조건이면 자동 발행도 존재 |
| 기사→사가 연결 | `publishNewsDraft` 후크 | 발행 기사 → 기존 saga entry | 발행 시 비동기 | 직접 사가 경로와 중복 유입 가능 |
| 교정 학습 | 즉시 학습 + nightly Vercel + VPS batch | 초안/발행 차이 → alias dictionary | 다중 writer | 실패와 “교정 없음”이 같은 `[]`로 합쳐짐 |
| 명칭 사서 | `naming-librarian` | saga 표기 → alias dictionary 및 기존 문서 재작성 | Vercel 매일 15:40 UTC | 최신 수동등록 정책과 직접 충돌 |

### 2.2 문서·구현 불일치

- 브리핑의 소스 수 `44 Reddit + 11 Naver`와 현재 설정 코드는 `46 Reddit + 9 Naver`로 총수만 같다. 운영 VPS 파일이 저장소와 같은지는 별도 확인이 필요하다.
- crawler는 “수집기”만이 아니다. `data/crawlers/core/summarizer.js`가 GPT 선별·요약을 수행한 후 `is_news` 항목만 남긴다 (`:231`, `:335`).
- `data/agents/README.md`는 drafted에서 멈춘다고 설명하지만 `run-cycle.sh`는 format/publish도 호출한다.
- `lib/saga/cluster.ts`는 “드라이런과 실파이프라인이 같은 코드”라고 설명하지만 실제 `publishReservoirItem`은 이 함수를 호출하지 않는다. 런타임은 `player:stage:KST-day` 키만 쓴다 (`lib/saga/publish.ts:54`).
- `/admin2/saga`의 기존 주석은 HITL을 “유일한 발행 경로”라고 했으나 `saga-extract` 자동발행이 실재한다. 이번 라운드에 주석만 사실에 맞게 수정했다.
- 운영 화면은 48시간 만료라고 표기했지만 cron은 24시간이었다. 화면·대시보드 문구를 24시간으로 바로잡았다.

### 2.3 중복 책임과 공백

**중복 판정**

- ticker crawler GPT 선별 → VPS scanner 가치 판정 → interest filter → auto-publish quality gate로 관심도·뉴스성·품질 판정이 여러 계보에 흩어져 있다.
- `publishNewsDraft`를 Vercel 자동발행, 운영자, 휴면 agent 체인이 공유하지만 입력 JSON 계약과 보이는 검수 큐는 동일하지 않다.
- 사가는 ticker 기반 reservoir 발행과 발행 기사 후크라는 두 경로에서 같은 뉴스를 받을 수 있다.
- 별칭 사전은 운영자 endpoint, naming librarian, naming audit, 즉시 교정 학습, nightly 학습, published fix가 모두 쓸 수 있다.

**책임 공백**

- 모든 단계에 통용되는 `candidate_id`, 단계별 outcome, drop reason, retry 상태가 없다.
- VPS scanner 실패 후보의 재시도 큐가 없다.
- `posts` 작성 후 부가 테이블·reservoir 상태 변경의 원자성을 보장하는 트랜잭션 또는 idempotency key가 없다.
- LLM 호출별 model/token/cost ledger가 없어 5만원 예산 준수를 증명할 수 없다.
- 사가 연결 실패를 재조정하는 reconciliation 큐가 없다.
- 운영 DB·VPS 실제 파일과 저장소 계보의 버전 일치를 확인하는 배포 식별자가 없다.

## 3. B — 침묵 실패 전수 조사

등급은 데이터 소실·정책 위반 가능성을 기준으로 P0/P1/P2로 분류했다. “보완”은 이번 라운드 코드 변경, “미해결”은 제안만 한 항목이다.

| 등급 | 위치 | 침묵 동작 / 영향 | 현재 추적 가능성 | 이번 상태 |
|---|---|---|---|---|
| P0 | VPS scanner `:710`, `:827` | 처리 전에 seen 등록. 일시 실패 후보가 영구 소실 | 로컬 로그 1회, DB 흔적 없음 | 미해결 — ack 후 seen 또는 retry/dead-letter 제안 |
| P0 | `naming-librarian`, `naming-audit`, `learn-corrections` | 사람 승인 없이 사전 실등록·기존 문서 재작성 가능 | 일부 cron 로그, 변경 주체 통합 감사 없음 | 미해결 — writer 동결/후보화는 승인 필요 |
| P0 | crawler summarizer `:231`, `:335` | `is_news=false` 항목을 이유·원문 audit 없이 제거 | 실행 총량 정도만 보임 | 미해결 — 판정 결과 전량 저장 제안 |
| P0 | `news-learn-edits` | `learnFromDeskEdit()`가 API/parse/DB 실패로 `[]`여도 hash를 기록해 영구 처리 완료로 간주 | hash는 남지만 실패 원인은 없음 | 미해결 — 결과 타입 분리·성공 때만 hash 제안 |
| P1 | VPS scanner `fetchCorrectionExamples()` | secret/HTTP/parse 실패를 빈 교정 예시로 축약, 학습 루프가 조용히 꺼짐 | 예시가 있을 때만 로드 로그 | 미해결 — 상태·마지막 성공 시각 기록 제안 |
| P1 | `news-auto-publish` | invalid/blog/women/no-image/content-free/prior-gate를 `continue`만 하던 경로 | 이전에는 후보별 이유 없음 | **보완:** skip count·ID·cron log 추가 |
| P1 | `news-interest-filter` | LLM 실패를 `null`로 축약하고 `judged`가 pending 수로 과대보고 | HTTP 200만 보면 정상처럼 보임 | **보완:** attempted/judged/failed 분리, 오류·DB 실패 500 |
| P1 | `saga-extract` | extraction null·auto publish 예외가 상태 이유 없이 남음 | 반복 queued/raw만 보일 수 있음 | **보완:** `extract_failed`, `auto_hold:*`, 예외 저장·로그 |
| P1 | `saga-ingest` | ticker 조회/count 오류에도 성공 응답 가능 | cron 성공으로 오인 | **보완:** 조회 오류 500 |
| P1 | `publishNewsDraft` | post 생성 뒤 flair/reservoir 갱신 실패 무시. 재시도 시 중복 post 가능 | post만 존재, reservoir drafted | **부분 보완:** CRITICAL 로그. 트랜잭션은 제안만 |
| P1 | `publishReservoirItem` | reservoir 완료 갱신 실패 무시 → queued 재처리·echo 중복 | 운영자는 중복 현상으로만 인지 | **보완:** 오류 throw, 동일 URL+제목 echo 중복 방지 |
| P1 | saga create/publish | saga/entry/anchor post의 다단계 write가 비원자적 | orphan/부분상태를 별도 탐지 안 함 | **부분 보완:** 상태 write 오류 노출, 트랜잭션은 제안만 |
| P1 | `/admin2/saga` | queue/saga 조회·reject update 오류를 정상/빈 목록/성공으로 응답 | 운영자 오판 | **보완:** DB 오류 500·로그 |
| P1 | `withCronLog` | HTTP 200의 `{ok:false}`도 성공. response metric·drop reason은 저장하지 않음 | status/duration/error만 있음 | 미해결 — semantic success·metrics 저장 제안 |
| P1 | `ops-monitor` | Supabase query error 객체를 검사하지 않는 경로가 있어 null count를 정상처럼 표시 가능 | 집계 화면이 false-green 가능 | 미해결 — 모든 query error 검사 제안 |
| P2 | crawler runner | recent ticker 조회 실패 시 `[]`, run log write와 cleanup RPC 오류 무시 | dedupe 약화·운영 로그 누락 | 미해결 — 단계별 DB 오류·run outcome 제안 |
| P2 | crawler cron | 코드 내부 lock 없음. 46개 Reddit 요청이 65초 간격이면 한 pass가 10분을 초과할 수 있음 | 외부 `flock` 유무 미확인 | 미확인 — 실제 crontab 확인 필요 |
| P2 | hero editor | 후보 조회/upsert DB 오류 확인 누락 | cron 200 가능 | **보완:** DB 오류 500 |
| P2 | auto publish / expire | 등록 cron인데 공용 cron log 미사용 | Vercel 요청 로그에만 의존 | **보완:** `withCronLog` 적용 |

### 3.1 운영자가 아직 볼 수 없는 gate 이유

- `/admin/news-review`는 `source->>type = hermes`로 제한하고 `decision`을 조회·표시하지 않는다. 자동 gate 이유가 검수 화면에 보인다는 설명과 실제 UI가 다르다.
- `data/agents`가 넣은 drafted 행은 자동발행 대상에는 들어갈 수 있지만 Hermes 전용 검수 큐에서는 보이지 않을 수 있다.
- skip count는 이번 변경으로 cron 응답·서버 로그에 나타나지만 DB 영속 funnel은 아니다. 다음 단계는 판정 행을 별도 audit 테이블에 append-only로 남기는 것이다.

## 4. 사가 경로의 구조적 위험

상세는 `workspace/codex-saga-review-2026-08-05.md`에 별도 정리했다.

- 최신 운영 기준은 같은 선수 문서 안에서 in/out을 함께 다루지만 `identityKey()`와 테스트는 direction을 키에 포함한다. 반면 `getOrCreateSaga()`는 runtime window에서 direction이 달라도 기존 활성 saga를 합칠 수 있다. `saga_hint` 기반 admin 조회와 실제 발행 배정이 서로 다른 답을 낼 수 있다.
- 실제 runtime cluster key는 동일 선수·동일 stage·동일 KST 날짜면 제목 유사도 없이 하나로 접는다. `clusterBatch()`의 제목 유사도는 dry-run/테스트에만 있고 발행 경로에서 사용되지 않는다.
- KST 자정 양쪽의 동일 사건은 다른 cluster로 갈라진다.
- anchor post → saga → entry → echoes → reservoir 상태 갱신이 단일 트랜잭션이 아니다.
- 자동 기사 연결은 fail-open이라 뉴스 발행은 유지되지만, 연결 실패를 다시 처리하는 큐가 없다.

## 5. 교정·사전 학습 루프

### 확인된 실제 흐름

1. 운영자가 초안을 편집해 발행하거나 발행글을 고친다.
2. 즉시 `learnFromDeskEdit`가 alias dictionary를 직접 변경할 수 있다.
3. Vercel nightly와 VPS batch가 같은 변경을 다시 학습할 수 있다.
4. VPS scanner는 `/api/news/correction-examples`의 few-shot 예시는 소비한다.

### 끊긴 고리와 중복

- scanner 코드에는 `news_alias_dictionary`를 읽는 경로가 없다. 즉 공유 사전이 자동발행 gate에는 쓰여도 scanner 작성 단계에 직접 환류된다는 근거는 없다.
- 즉시 학습은 audit hash를 남기지 않는다. Vercel cron은 최종 draft와 final post가 같아 건너뛸 수 있지만 VPS batch는 `publish.pre_edit`와 final을 비교해 같은 변경을 한 번 더 배울 수 있다.
- published-fixes 즉시 학습도 nightly와 중복될 수 있다.
- Vercel과 VPS batch는 SHA-1 기반 12자 hash 규약을 공유하지만, Vercel은 학습 실패에도 hash를 남기는 경로가 있다.
- `learnFromDeskEdit`의 `[]`가 “변경 없음”, 키 없음, HTTP 실패, parse 실패, DB 실패를 구분하지 않는다.

권고: 프롬프트를 바꾸기 전에 `no_change | learned | retryable_error | permanent_error` 결과 타입과 append-only audit을 만들고, 사전 실등록 writer는 후보 큐 한 곳으로 수렴시키는 설계를 승인받아야 한다.

## 6. 모델·비용 조사

모델 호출마다 token usage·비용을 저장하지 않으므로 현재 코드만으로 월 5만원 준수를 증명할 수 없다. 아래는 호출 상한과 비용 민감도다.

| 호출자 | 등록 빈도/상한 | 모델 계열 | 비용 위험 |
|---|---|---|---|
| hero editor | 30분, 최대 48회/일 | `gpt-4o` | 후보 25개를 매회 보내면 고정비가 큼 |
| auto-publish gate | 30분, 한 번에 30 후보 조회·2건 발행까지 | Terra 텍스트+이미지 | 탈락이 많으면 발행 2건보다 훨씬 많은 후보를 2회 판정 가능 |
| saga extract | 시간당 4회, 요청당 20개 | mini | 최대 96 요청/일 |
| interest filter | 시간당 1회 | mini | 최대 24 요청/일 |
| naming librarian | 일 1회, 10개 | mini | 비용보다 정책 위반이 우선 |
| edit learning | 일 1회, 최대 20개 | 4.1-mini | 중복·실패 완료처리가 문제 |
| VPS scanner | 15분, 후보별 판정·작성 및 재시도 | mini 계열 | 실제 후보 수에 비례, 이론 상한이 가장 큼 |
| crawler summarizer | due source별 batch | GPT-5.1 | 저장소 계보에 `temperature: 0.3`이 있어 GPT-5 불변식 위반 가능 (`summarizer.js:214`, `:318`) |

우선 권고는 모델 교체가 아니라 호출 ledger다. `run_id, candidate_id, stage, model, prompt_version, input_tokens, output_tokens, cached_tokens, estimated_cost, outcome, latency_ms`를 남기면 hero 주기 축소, content hash cache, image URL verdict cache의 효과를 실측할 수 있다. GPT-5 계열의 `temperature` 제거는 실제 VPS 버전을 확인한 뒤 승인된 변경으로 처리해야 한다.

## 7. 24시간 funnel 실측 SQL

Supabase 연결 도구가 없어 아래 SQL은 실행하지 않았다. 대상 프로젝트는 문서상 `gongnori.fan (ekysrlhdrapmsnrkytif)`이며, 운영자가 SQL Editor에서 실행해 결과를 보고서에 붙이면 된다. `decision`이 JSONB라는 현재 코드 전제다.

```sql
-- 1) 생성 소스 × 현재 상태
select
  coalesce(source->>'type', 'unknown') as source_type,
  status,
  count(*) as rows
from news_reservoir
where created_at >= now() - interval '24 hours'
group by 1, 2
order by 1, 2;

-- 2) gate/interest 결정 이유 분포
select
  coalesce(decision->>'reason', decision->>'code', 'no_decision') as decision_reason,
  status,
  count(*) as rows
from news_reservoir
where created_at >= now() - interval '24 hours'
group by 1, 2
order by rows desc;

-- 3) 24시간 이상 drafted 잔류와 만료 분리
select
  status,
  count(*) as rows,
  min(created_at) as oldest,
  max(created_at) as newest
from news_reservoir
where created_at >= now() - interval '72 hours'
group by status
order by status;

-- 4) 자동 발행 뒤 reservoir 상태 갱신 실패 의심 행
-- source_url 컬럼/metadata 키는 실제 스키마에 맞춰 조정한다.
select nr.id, nr.status, nr.source_url, nr.created_at
from news_reservoir nr
where nr.status = 'drafted'
  and nr.created_at < now() - interval '30 minutes'
  and exists (
    select 1
    from posts p
    where p.metadata->>'source_url' = nr.source_url
  )
order by nr.created_at desc;

-- 5) saga 단계 funnel
select
  status,
  coalesce(error, 'no_error') as outcome,
  count(*) as rows
from saga_reservoir
where created_at >= now() - interval '24 hours'
group by 1, 2
order by rows desc;

-- 6) 동일 source URL의 중복 saga entry
select source_url, count(*) as rows, array_agg(saga_id) as saga_ids
from saga_entries
where created_at >= now() - interval '30 days'
  and source_url is not null
group by source_url
having count(*) > 1
order by rows desc;
```

## 8. 이번 라운드의 제한적 코드 변경

구조·프롬프트는 건드리지 않았고 로깅, 명백한 DB 오류, 테스트만 보완했다.

- 뉴스 자동발행: skip 이유 집계, gate DB write 오류, cron run log.
- 뉴스 만료: cron run log.
- 관심도: LLM/DB 오류 노출, attempted/judged/failed 정확화.
- saga ingest/extract: 조회·상태 write 오류를 성공으로 숨기지 않고 hold/failure 이유 저장.
- saga publish/create: reservoir 상태 오류 throw, echo 중복 방지, saga 상태 write 오류 노출.
- 뉴스 publish/learning: 부분 write 및 사전 update 실패 로그.
- admin2 saga: 조회·반려 DB 오류 500.
- hero editor: 후보 조회/upsert 오류 500.
- UI의 48시간 만료 표기를 실제 24시간으로 수정.
- 테스트: auto-publish skip 회귀, identity 경계, cluster 유사도·KST 경계.

검증 결과:

- `pnpm exec tsc --noEmit`: 통과
- `pnpm exec eslint .`: 오류 0, 기존 `components/post-card/post-card-content.tsx`의 `<img>` 경고 1건
- `pnpm test`: 89 files, 1,074 tests 통과

## 9. 권고 우선순위

### P0 — 승인 후 즉시

1. VPS scanner의 seen 기록을 **성공 ack 이후**로 옮기고 retry/dead-letter 상태를 DB에 남긴다.
2. `naming-librarian` 운영 cron과 기타 자동 dictionary writer를 일시 동결하거나 후보 전용 write로 바꾼다. 이는 최신 owner 불변식과 직접 관련되어 명시 승인 후 변경한다.
3. crawler의 GPT 탈락 항목을 최소 7~14일 append-only audit에 보존한다.
4. learning 결과를 성공/무변경/재시도 오류로 분리하고 성공 때만 processed hash를 기록한다.

### P1 — 다음 조사·설계

1. candidate 단위 funnel audit과 LLM cost ledger를 만든다.
2. `publishNewsDraft`와 saga 생성·발행의 transaction/idempotency 경계를 설계한다.
3. 실제 사가 identity 정책을 최신 owner 기준으로 한 가지로 고정하고 admin hint·runtime lookup·tests를 일치시킨다.
4. runtime에 제목 유사도 cluster를 적용할지, 현재 하루 단위 fold를 공식 규칙으로 둘지 결정한다.
5. `/admin/news-review`에 모든 source와 decision/drop reason을 노출한다.
6. ops monitor를 “최근 row 존재”가 아니라 단계별 입력/통과/탈락/오류율과 마지막 성공 기준으로 바꾼다.

## 10. 운영 환경에서 답해야 할 질문

1. `/opt/crawlers`와 `/opt/news-scanner`의 실제 git SHA/파일 hash는 저장소 계보와 같은가?
2. crawler crontab에 `flock` 또는 다른 단일 실행 lock이 있는가?
3. crawler 실제 모델이 GPT-5.1이며 `temperature`를 받고 있는가?
4. scanner의 seen 파일에 실패 후보가 이미 누적 소실됐는가? 최근 7일 로컬 error와 seen timestamp를 교차 확인할 수 있는가?
5. 운영 DB에서 128 → 25 사이의 상태별 종착점은 정확히 무엇인가?
6. `NEWS_AUTO_PUBLISH`와 관련 feature flag의 운영값은 무엇인가?
7. naming librarian의 실제 최근 실행과 dictionary 변경 건수는 얼마인가?
8. VPS scanner가 저장소 밖 설정으로 alias dictionary를 별도 소비하는가? 저장소 코드에는 근거가 없다.
9. cron run log의 200 `{ok:false}`가 성공으로 누적된 사례가 몇 건인가?

이번 결론은 저장소에서 입증된 구조와 실패 경로에 한정한다. 운영 수치와 VPS 실파일은 위 질문·SQL 결과가 들어오기 전까지 미확인으로 유지한다.

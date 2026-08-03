# 사가 엔진 (Saga Engine) — PRD & 구현 스펙

- 프로젝트: gongnori
- 버전: v1.0 (2026-08-03)
- 상태: **설계 확정 — Phase A 착수 가능** (P0 오딧 완료 → `docs/saga/P0_AUDIT.md`)
- 원본: 오너 설계 세션 확정본 (2026-08-03 전달분 그대로. 이후 수정은 P0_AUDIT.md 의 "PRD 정정" 절 참조)

---

## 0. 이 문서를 읽는 Claude Code에게

이 문서는 오너와의 설계 세션에서 **확정된** 스펙이다. 작업 시 다음 원칙을 따른다.

1. **Audit-first.** 어떤 코드도 수정·생성하기 전에 §9의 P0 접합면 오딧을 먼저 수행하고, 결과를 `docs/saga/P0_AUDIT.md`로 남긴다. 본문의 `[P0확인]` 표기는 오딧으로 채워야 할 빈칸이다.
2. **§3 결정 로그는 재논의 대상이 아니다.** 대안 제안 금지. 구현 중 모순이나 기술적 불가를 발견하면 작업을 멈추고 open question으로 보고한다.
3. **페이즈 게이트.** 각 EPIC은 Playwright 스모크 + 마이그레이션 리허설(스테이징 apply→rollback) 통과 후에만 다음으로 진행한다.
4. **제네릭 테이블 가드레일.** Phase A는 transfer만 구현하지만 스키마는 day one부터 `saga_type` 제네릭이다. "match/season이 마이그레이션 없이 꽂히는가"가 스키마 리뷰의 통과 기준.
5. **런타임 파이프라인은 단순 체인.** cron/edge function + 구조화 프롬프트로 구성한다. 런타임에 멀티에이전트 하네스 사용 금지(비용·불안정성). 멀티에이전트는 개발 단계(PRD 분해 등)에서만 쓴다.
6. **기존 시스템 재사용 우선.** 예측·포인트·댓글·호칭·Hermes 발행 큐는 새로 만들지 않고 FK로 연결하는 것이 기본값이다. 재사용 불가 판정은 P0 오딧 근거가 있어야 한다.

---

## 1. 한 줄 정의

**사가(Saga)** = 자동 생성되고, 이벤트(기사·킥오프·골·오피셜)가 터질 때마다 스스로 자라며, 그 위에서 커뮤니티가 투표하고 댓글로 싸우는 **살아있는 위키 문서**.

핵심 전환: 게시판은 글 목록이 아니라 **사가 인덱스**다. 새 이벤트가 발생하면 해당 사가가 `last_event_at` 기준으로 피드 상단으로 범프된다. 관련 콘텐츠(기사, 떡밥 게시물, 리뷰, 인터뷰)는 흩어지지 않고 전부 해당 사가 문서 하나로 귀속된다.

사가는 기능이 아니라 **패턴**이며, 현재 3개 타입의 인스턴스를 갖는다: `transfer`(이적설), `match`(경기), `season`(시즌 연대기).

---

## 2. 왜 지금 — 캘린더가 빌드 순서를 정한다

- 오늘: **2026-08-03**. 비시즌 + 여름 이적시장 한복판. 월드컵 직후 여름이라 이적 떡밥 볼륨이 연중 최대.
- EPL 26/27 개막: **2026-08-21(금)**, 아스날 vs 코번트리 (아스날 = 디펜딩 챔피언).
- 여름 이적시장 마감: **2026-08-31** → **데드라인 데이 = Phase A의 클라이맥스이자 정산일.**
- 8/21~8/31: 시즌과 이적시장이 동시에 라이브인 겹침 구간.

따라서 빌드 순서:

| 페이즈 | 기간 | 내용 | 근거 |
|---|---|---|---|
| **Phase A** | 지금~8/31 | TransferSaga + 사가 엔진 코어 | 지금 콘텐츠가 있는 곳. 이적센터가 곧 프런트 페이지 |
| **Phase B** | 9월~ | MatchSaga + SeasonSaga | 경기 데이터는 API로 **백필 가능** → 개막에 쫓기지 않음. 9월 중순 오픈해도 R1부터 완결된 연대기로 태어남 |

> 기술 리스크만 보면 match(fixture_id라 매칭 문제 0)를 먼저 만드는 게 쉽지만, 빈 방에 매치사가를 만들어봤자 유저가 없다. **콘텐츠 캘린더가 우선한다.** 대신 §6의 완화책으로 transfer의 매칭 리스크를 관리한다.

---

## 3. 확정 결정 로그 (Decision Log) — 재논의 금지

| # | 결정 | 근거 |
|---|---|---|
| D1 | 공통 사가 엔진 1개 + 타입 3종(transfer/match/season). 타입별 별도 시스템 구축 금지 | 중복 구현 방지, "게시판=사가 인덱스" 통일 |
| D2 | **TransferSaga identity = 선수 + 방향(in/out) + 윈도우.** 목적지 클럽은 identity에서 제외 | 밀란 관심 기사와 바이에른 관심 기사가 문서를 쪼개면 안 됨. 목적지들은 문서 안의 "구혼자 스레드" |
| D3 | MatchSaga identity = 외부 API의 fixture_id | 매칭 문제 원천 차단 |
| D4 | SeasonSaga identity = 팀 + 시즌 (예: "2627 아스날"). match/transfer 사가의 부모 문서 | 팀 커뮤니티의 최상위 연대기 |
| D5 | **기사 본문 저장·표시 금지.** 제목 + 매체명 + 링크 + 자체 요약(1~2문장, 완전 재작성)까지만 | 저작권 |
| D6 | 발행은 HITL 큐 경유(Hermes 트러스트 티어 모델 재사용). 품질 안정 후 HOTL 졸업 | 매칭·요약 오류가 프로덕션에 닿기 전 차단 |
| D7 | 미확인 루머 사가는 `noindex` + "미확인 루머" 배너 고정. 오피셜 확정 후 해제 | 선수 실명 명예훼손 리스크 |
| D8 | 위키 편집권: AI 작성 + 유저는 제안/투표만. 직접 편집은 추후 트러스트 상위 티어에만 개방 | 반달 방지 |
| D9 | 중복 기사는 **원출처 기준 클러스터링** → 연표 엔트리 1개 + "이 소식을 전한 매체 N곳" 접기 | 로마노 트윗 받아쓰기 15건 도배 방지 |
| D10 | **댓글 작성 시점의 투표 스탠스를 스냅샷 저장** | 소환 기능의 무결성 (유저가 나중에 투표를 바꿔도) |
| D11 | 경기·시즌 데이터는 크롤링이 아닌 **API** (API-Football 계열 — 라인업·이벤트·순위 필요). 크롤러는 이적설 전용 | Soccerway 등 스크래핑은 ToS·유지비 문제 |
| D12 | 리그 내 이적(양쪽 EPL)은 문서 1개 + 양 팀 게시판 미러 뷰 + **댓글 공유** | 양 팀 팬이 한 방에서 싸우는 구조가 흥행 최적 |
| D13 | 초기 스코프 = **EPL 20클럽** (확장은 사전·소스만 교체하면 되도록 설계) | 엔티티 사전 ~500명으로 축소 → 매칭 난이도 급감 |
| D14 | 리뷰·프리뷰는 외부 텍스트를 가져오지 않고 **데이터에서 생성**하며, 자체 커뮤니티 데이터를 섞는다 | 저작권 + 차별점(세상에 없는 리뷰) |

---

## 4. 사가 타입 스펙

### 4.1 공통

- URL: `/saga/[slug]` — slug 자동 생성 (예: `nwaneri-out-2026s`, `arsenal-2627`, `ars-cov-2026-08-21`)
- 문서 레이아웃: **헤더**(제목 · 단계 진행도 바 · 메인 투표) → **본문 섹션** → **연표** → **댓글**
- 인덱스 피드: `last_event_at desc`, 타입·클럽 필터, 이벤트 발생 시 범프
- 종결 시: 문서 잠금 → 종결 리포트 자동 생성("N일, 기사 M건, 댓글 K건" + 적중 리더보드) → 호칭 부여 → 아카이브

### 4.2 TransferSaga

- 제목 자동 생성: `은와네리(OUT)` 형식
- stage enum: `interest → contact → bid → negotiation → medical → done | collapsed | stayed`
  - `stayed` = 윈도우 마감 시점에 미성사 사가 일괄 자동 종결
  - 단계 후퇴(negotiation→collapsed 임박 등)도 그 자체로 이벤트이며 연표에 기록
- **구혼자 스레드**(`saga_threads`): 목적지 클럽별로 stage와 최신 기사를 독립 트래킹, 문서 내 목록 렌더
- 투표 2층:
  - 메인: "나간다 vs 남는다" (목적지별 예측은 서브 투표)
  - 엔트리별: "믿는다 / 찌라시" → 매체 티어의 커뮤니티 사후 검증 데이터로 축적
- 매체 티어: T1(로마노, 르퀴프, BBC, Sky, 디 애슬레틱 등) / T2(국내 스포츠지) / T3(유튜브·커뮤니티발)
- 정산 규칙: `done` → "나간다" 승 / 마감 시 `stayed` → "남는다" 승
- **8/31 대량 정산**: 열린 사가 전체 강제 종결 → 포인트 일괄 정산 → 9/1 "이적시장 예언자" 호칭 시상 → 리더보드가 시즌 예측으로 유저를 인계

### 4.3 MatchSaga

- stage: `scheduled → preview_open(D-2) → live → finished → reviewed → archived`
- D-2: 프리뷰 자동 작성 + 예측 오픈 (기존 매치 예측 시스템 연동 `[P0확인]`)
- FT: 스코어·라인업·이벤트 인제스트 → 리뷰 자동 작성 → 포인트 정산 → SeasonSaga 롤업 트리거
- 리뷰의 차별점 (D14): 외부 데이터(스코어·득점자·라인업) + **자체 데이터** — "홈승 예측 72%가 무너졌다", 여론 그래프 변곡점, 베스트 댓글 인용(자체 플랫폼 댓글이므로 자유), 경기 전 장담 댓글 소환

### 4.4 SeasonSaga

- 섹션 구성:
  - **현황판**: 현재 순위, 최근 폼(WWDWL), 다음 경기
  - **연혁**: 라운드별 1줄 엔트리 — `R24 vs 첼시(A) 2-1 승 · 사카 2골 · 한 줄 리뷰 · 순위 3→2` — 클릭 시 매치사가로 진입. **2층 구조 원칙**: 연혁=요약, 디테일(라인업·풀 리뷰·댓글)=매치사가. 38경기 상세를 한 문서에 넣지 않는다
  - **누적 스탯**: 팀 내 득점·도움·출전, 경기마다 자동 갱신
  - **월간 리캡**: "10월 — 5승 1무, 이달의 선수 ○○" 자동 생성
  - **이적 장부**: IN/OUT 목록 — TransferSaga에서 롤업. **탄생 시 Phase A의 여름 이적 장부를 첫 섹션으로 승계** (사가 간 데이터 연결)
- 연혁 이벤트 kind: `match_result | interview | injury | official | milestone`
  - 인터뷰/기자회견: 자체 요약 + 짧은 인용 최대 1개 + 링크. 전문 게재 금지 (D5 준용)
- 장기 예측: 최종 순위, 팀 득점왕, 특정 선수 잔류 여부 등 — 시즌 종료(5월) 정산

---

## 5. 데이터 모델 (초안 — P0 오딧 후 확정)

> ⚠️ **이 절은 초안 스케치다.** P0 오딧을 거친 **확정 스키마는 `docs/saga/P0_AUDIT.md` §확정 스키마**를 따른다
> (주요 정정: user_id 는 uuid 가 아니라 **text**(Clerk), 댓글은 앵커 posts 행 경유, 투표는 append-only 등).

```sql
create table sagas (
  id            uuid primary key default gen_random_uuid(),
  saga_type     text not null check (saga_type in ('transfer','match','season')),
  identity_hash text not null unique,   -- 타입별 identity의 정규화 해시 (§4 규칙)
  identity      jsonb not null,         -- transfer: {player_id, direction, window}
                                        -- match:    {fixture_id, home, away, comp, round}
                                        -- season:   {team_id, season}
  slug          text not null unique,
  title         text not null,
  stage         text not null,
  status        text not null default 'active',   -- active | closed | archived
  is_confirmed  boolean not null default false,   -- true가 될 때 noindex 해제 (D7)
  last_event_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table saga_events (
  id          uuid primary key default gen_random_uuid(),
  saga_id     uuid not null references sagas(id),
  occurred_at timestamptz not null,
  kind        text not null,        -- article | match_result | interview | injury | official | milestone | stage_change
  stage       text,                 -- 이 이벤트로 도달한 단계 (nullable)
  summary     text not null,        -- 자체 작성 1~2문장 (D5)
  payload     jsonb,                -- 스코어, 라인업, 추출 원본 등
  cluster_key text,                 -- 원출처 클러스터링 키 (D9)
  created_at  timestamptz not null default now()
);

create table saga_sources (         -- 이벤트에 접혀 들어가는 매체 목록 (D9)
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references saga_events(id),
  outlet       text not null,
  tier         smallint not null,   -- 1 | 2 | 3
  url          text not null,
  title        text not null,       -- 기사 제목만. 본문 저장 금지 (D5)
  published_at timestamptz
);

create table saga_sections (        -- 생성형 본문 (프리뷰/리뷰/리캡/장부)
  id         uuid primary key default gen_random_uuid(),
  saga_id    uuid not null references sagas(id),
  kind       text not null,         -- preview | review | recap | ledger | closing_report
  content_md text not null,
  revision   int not null default 1,
  status     text not null default 'draft'  -- draft | pending_review | published | rejected (D6)
);

create table saga_relations (       -- season → match, season → transfer
  parent_id uuid not null references sagas(id),
  child_id  uuid not null references sagas(id),
  relation  text not null,          -- season_match | season_transfer
  primary key (parent_id, child_id)
);

create table saga_threads (         -- 구혼자 스레드 (transfer 전용)
  id            uuid primary key default gen_random_uuid(),
  saga_id       uuid not null references sagas(id),
  club          text not null,
  stage         text not null,
  last_event_at timestamptz not null,
  unique (saga_id, club)
);

-- 투표: 기존 예측 엔진이 임의 바이너리 마켓을 지원하면 그것을 사용 [P0확인].
-- 미지원 시 아래 신규:
create table saga_polls (
  id             uuid primary key default gen_random_uuid(),
  saga_id        uuid not null references sagas(id),
  kind           text not null,     -- main | destination | credibility | longterm
  event_id       uuid references saga_events(id),  -- credibility일 때 대상 엔트리
  question       text not null,
  options        jsonb not null,
  settles_at     timestamptz,
  settled_option text
);

create table saga_poll_votes (
  poll_id  uuid not null references saga_polls(id),
  user_id  uuid not null,           -- [P0확인: 유저 테이블]
  option   text not null,
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id, voted_at)  -- 이력 보존 → 여론 시계열 그래프의 원천
);

-- 댓글: 기존 comments 테이블에 polymorphic 연결 [P0확인: 기존 구조에 따라 조정]
create table saga_comment_meta (
  comment_id      uuid primary key,  -- references 기존 comments
  saga_id         uuid not null references sagas(id),
  event_id        uuid references saga_events(id),  -- 엔트리 앵커 댓글이면 지정
  stance_snapshot text               -- 작성 시점 메인 투표 진영 (D10, 소환의 원천)
);
```

RLS·인덱스 정책은 기존 코드베이스 패턴을 따른다 `[P0확인]`.

---

## 6. 런타임 파이프라인 (Phase A)

```
[cron 크롤러] → [추출 LLM] → [클러스터링] → [사가 매칭/생성] → [요약 작성] → [HITL 큐] → [발행/append] → [피드 범프 + 알림]
```

- **소스**: 르퀴프, 로마노(X), BBC/Sky/디 애슬레틱, 국내 축구 매체. RSS 우선, 목록은 P0에서 확정 `[P0확인]`
  → **오너 확정(2026-08-03): Phase A = 기존 티커(news_ticker_items) 2차 소비 + 해외 RSS만. 국내 매체는 안정화 후.**
- **주기**: 기본 4회/일 → 마감 전 마지막 주 시간당 → **데드라인 데이 10~15분 간격**
- **추출 스키마** (구조화 출력 강제):
  ```json
  { "player_key": "...", "direction": "in|out", "clubs": ["..."], "stage": "...",
    "outlet": "...", "tier": 1, "original_source": "...", "summary_ko": "..." }
  ```
- **엔티티 사전**: EPL 20클럽 스쿼드 ~500명. API에서 시딩. **ko/en 별칭 배열 필수** (은와네리/느와네리 같은 국내 표기 흔들림 흡수). 선수 식별은 사전 매칭이 1차, LLM은 보조
- **요약 프롬프트 규칙**: 원문 표현 재사용 금지 명시 / 1~2문장 / 중립 서술 / "르퀴프에 따르면" 식 매체 귀속 (D5·D7)
- **HITL 큐**: `draft → pending_review → published | rejected`. Hermes 발행 큐 인터페이스 재사용 `[P0확인]`. 초기엔 오너가 전건 승인, 정확도 안정 후 티어별 자동 발행(HOTL) 졸업
- **100건 배치 테스트**: 크롤러 완성 주에 실기사 100건으로 측정. 목표(제안치): 선수 식별 ≥95%, 방향(in/out) ≥90%, 클러스터링 병합 오류 0건. 미달 시 사전·프롬프트 보강 후 재측정, 통과 전 자동 발행 금지

---

## 7. 커뮤니티 레이어 (싸움 설계)

- **진영 배지**: 댓글에 작성자의 메인 투표 진영(성사파/결렬파 등) + 응원팀 자동 표시. 익명 싸움 → 진영 싸움
- **소환**: 사가 종결 순간, 패배 진영의 과거 댓글을 자동 끌올 — "3주 전 이 분의 말씀". `stance_snapshot` 기반 (D10). **본 시스템의 킬러 기능** — 결말을 보러 재방문하게 만드는 장치
- **댓글 2모드**: 전체 최신순 피드 / 연표 엔트리 앵커 (장기 사가에서 옛 떡밥 매몰 방지)
- **여론 시계열 그래프**: `saga_poll_votes` 이력 기반. 연표 이벤트와 겹쳐 그려 "이 기사에서 여론이 꺾였다"를 시각화
- **단계 진행도 바**: 문서 헤더에 stage 진행도 상시 표시. "지금 어디까지 왔나"가 재방문 이유
- **데드라인 데이 모드**: D-DAY 배너 + 크롤 가속 + 라이브 티커형 피드 (라이트하게, 별도 인프라 불요)
- **호칭 연동**: 8/31 정산 → "이적시장 예언자" 등. 기존 호칭 시스템 사용 `[P0확인]`

---

## 8. 가드레일

| 영역 | 규칙 |
|---|---|
| 저작권 | 기사 본문 저장·표시 금지 (D5). 요약은 완전 재작성. 인터뷰는 요약+짧은 인용 1개+링크. 리뷰는 데이터에서 생성 (D14) |
| 명예훼손 | 미확인 사가 `noindex` + "미확인 루머" 배너 (D7). 요약은 중립 서술 + 매체 귀속. 오피셜 전 단정 표현 금지 |
| 반달 | 편집권 제한 (D8). AI 작성 + 유저 제안/투표. 직접 편집은 트러스트 상위 티어 한정, Phase A/B 범위 밖 |
| 크롤링 | 이적설 기사 수집만. robots.txt 준수, RSS 우선. 경기 데이터 스크래핑 금지 (D11) |

---

## 9. Phase 플랜

### P0 — 접합면 오딧 (모든 코드 작업의 선행 조건)

**✅ 완료 (2026-08-03)** — 산출물: `docs/saga/P0_AUDIT.md`.

체크리스트:
- [x] 유저·프로필 테이블 구조, 응원팀 필드 유무
- [x] 포인트 원장(ledger) 스키마와 정산 로직 위치
- [x] 기존 매치 예측 시스템: 임의 바이너리 마켓(사가 투표) 수용 가능 여부 → **불가 판정, saga_votes 신규**
- [x] comments 테이블 구조: polymorphic 연결 가능성, 재사용 방식 → **앵커 posts 행 경유**
- [x] 호칭 시스템 부여 인터페이스 → **코드 부여 인터페이스 부재, 신규 헬퍼**
- [x] Hermes Seeder 발행 큐 인터페이스 → **agg_reservoir 선례 따라 자체 테이블**
- [x] app router 구조: `/saga/[slug]` 배치 → **충돌 없음**
- [x] RLS 정책 패턴, 알림 시스템 인터페이스
- [x] Playwright 테스트 기반 현황 → 템플릿 `tests/e2e/journeys/guest/static-gnb.spec.ts`

### Phase A — TransferSaga (지금 ~ 8/31)

| EPIC | FEATURE | 비고 |
|---|---|---|
| **A1 사가 코어** | 스키마 마이그레이션(§5) / `/saga/[slug]` 문서 UI(헤더·진행도 바·연표·섹션) / 사가 인덱스 피드 + 범프 | 테이블은 제네릭(원칙 4) |
| **A2 수집 파이프라인** | 크롤러(cron) / 추출 + 엔티티 사전 / 원출처 클러스터링 / HITL 발행 큐 / 100건 배치 테스트 | §6 |
| **A3 커뮤니티** | 메인 투표 + 여론 시계열 / 엔트리 신빙성 투표 / 진영 배지 / 엔트리 앵커 댓글 + stance 스냅샷 | §7 |
| **A4 이적센터 홈** | 마감 D-day 카운트다운 / 클럽별 IN·OUT 보드 / 구혼자 스레드 렌더 | 비시즌 프런트 페이지 |
| **A5 종결·정산** | `stayed` 자동 종결 잡 / 8/31 대량 정산 / 예언자 호칭 / 종결 리포트 / 소환 | 클라이맥스 |

게이트: EPIC별 Playwright 스모크(문서 생성→이벤트 append→범프→투표→댓글→종결 리포트) + 마이그레이션 리허설.

주차 스케치: **W1~2** A1+A2 → **W3** A3 → **W4** A4+A5+데드라인 모드 → **8/31 정산** → 9월 Phase B.
(실행 플랜의 확정 슬라이스는 `C:\Users\user\.claude\plans\saga-golden-treasure.md` 및 P0_AUDIT.md 참조 —
W1 A1 / W2 A2전반 / W3 A2후반=MVP / W4 A5. A4는 기존 /transfer 가 당분간 대행.)

### Phase B — MatchSaga + SeasonSaga (9월)

| EPIC | FEATURE |
|---|---|
| **B1 데이터 연동** | API-Football 연동 / 시즌 픽스처 싱크(한 시즌치 MatchSaga 일괄 생성) / **백필**(개막 후 지난 라운드 소급 생성) |
| **B2 MatchSaga** | D-2 프리뷰 생성 + 예측 오픈 / FT 인제스트 / 리뷰 생성(자체 데이터 믹스, D14) / 정산 연동 |
| **B3 SeasonSaga** | 연대기 롤업(연혁·스탯·순위) / 월간 리캡 / 이적 장부 승계 / interview·injury 이벤트 수집 / 장기 예측 |
| **B4 미러 뷰** | 리그 내 이적 문서의 양 팀 게시판 미러 + 댓글 공유 (D12) |

---

## 10. 리스크 레지스터

| 리스크 | 완화 |
|---|---|
| 추출·매칭 오류로 사가 오분류/쪼개짐 | D2로 난이도 자체를 낮춤(선수+방향만 맞으면 됨) + 엔티티 사전 + HITL + 100건 배치 테스트 통과 전 자동 발행 금지 |
| 받아쓰기 도배로 연표 오염 | D9 원출처 클러스터링. 클러스터링 실패는 병합(보수적) 방향으로 |
| 저작권 | D5·D14. 요약 프롬프트에 원문 재사용 금지 명문화 |
| 명예훼손 | D7. noindex + 배너 + 중립 서술 |
| 크롤러 취약성(마크업 변경) | RSS 우선, 소스별 어댑터 분리, 실패 알림 |
| 4주 런웨이 초과 | A4·A5의 장식 요소(그래프 폴리시 등)는 컷 가능. **A1+A2+메인 투표+댓글이 MVP 코어** — 이것만으로도 데드라인 데이 대응 가능 |
| API 비용 | Phase B에서 API-Football 플랜 확정. Phase A는 스쿼드 시딩용 최소 호출만 |

---

## 11. Open Questions (오너 확인 필요 — 임의 결정 금지)

1. ~~기존 예측 엔진의 임의 바이너리 마켓 지원 여부~~ → **P0 해소: 불가. saga_votes 신규** (P0_AUDIT.md)
2. ~~초기 크롤 소스 확정 목록과 국내 매체 범위~~ → **오너 확정(2026-08-03): 티커 2차 소비 + 해외 RSS만, 국내는 안정화 후**
3. API-Football 유료 플랜 예산 승인 (Phase B 전) — **미결**
4. ~~대량 정산 기준 시각~~ → **오너 확정(2026-08-03): 9/1 09:00 KST**
5. EPL 외 리그 확장 시점 (D13은 초기 스코프만 확정) — **미결**

---

## 12. CLAUDE.md 앵커 (붙여넣기용)

```md
## Saga Engine
- 스펙: docs/saga/SAGA_ENGINE_PRD.md — §3 결정 로그는 재논의 금지
- 작업 전 필수: docs/saga/P0_AUDIT.md 존재 확인. 없으면 P0 접합면 오딧부터 수행
- 현재 페이즈: Phase A (TransferSaga, ~2026-08-31 데드라인 데이 정산)
- 원칙: audit-first / 페이즈 게이트(Playwright 스모크+마이그레이션 리허설) / 테이블은 saga_type 제네릭 / 런타임 멀티에이전트 금지
```

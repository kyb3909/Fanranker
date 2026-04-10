# Architecture & Workflow

## 한 줄 요약
중앙 reservoir(`news_reservoir` 테이블)를 두고, 13개 에이전트가 status 컬럼을 전이시키며 비동기로 동작하는 newsroom 파이프라인. 축구(football) 중심.

## 데이터 흐름

```
[reddit-fetcher (기존)] ──▶ [Reddit Scout]
                                 │
                                 ▼ ingested
                        [Credibility Filter]
                                 │ credibility_passed
                                 ▼
                          [Normalizer]
                                 │ normalized
                                 ▼
              ┌───── [Tagging] [Naming Resolver] [Link Collector] ─────┐
              │                                                          │
              └─────────────── enriched ────────────────────────────────┘
                                 │
                                 ▼
                         [Dedupe Checker]
                                 │ dedupe_checked (or duplicate)
                                 ▼
                          [Desk Reviewer]
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
              approved        held / merge    rejected
                  │
                  ▼ desk_approved
                          [Assignment]
                                 │ assigned
                                 ▼
                          [Summary Writer]   ◀── 유일한 T3 단계
                                 │ drafted
                                 ▼
                          [SEO Formatter]            ◀ Phase B
                                 │ formatted
                                 ▼
                          [Final Publisher]          ◀ Phase B
                                 │ published
                                 ▼
                  community board API (integration point)
```

## Phase A 시점의 실제 흐름

```
reddit-fetcher → Reddit Scout → Credibility → Normalize → 
  → (Tagging stub) → Naming Resolver → (Link extract stub) → 
  → (Dedupe rule only) → Desk Reviewer → Summary Writer → drafted
                                                          │
                                                          ▼
                                              **여기서 정지. 사람 검수.**
```

Tagging/Link/Dedupe는 룰 기반 stub만 두고, 본격 LLM 단계는 Phase B에서 추가한다.

## 단계별 책임

### 1. Scout
- 입력: subreddit 목록 (Phase A는 r/soccer만)
- 출력: `RawPost[]` (제목, 본문 발췌, 메타, 링크)
- 모델: 없음. 기존 reddit-fetcher를 wrap
- 결과를 reservoir에 `status='ingested'`로 INSERT

### 2. Credibility Filter
- 입력: reservoir.ingested 항목들 (배치)
- 출력: `{credibility, newsworthiness, verdict, reason}`
- 모델: T1 classifier, 5~20건 묶음
- 0.55 미만 또는 ban 패턴 매치 → `credibility_rejected`
- 통과 → `credibility_passed`

### 3. Normalizer
- 입력: credibility_passed 항목 (structured fields only)
- 출력: 정규화된 ReservoirItem 필드 + candidate entities
- 모델: T1 structured. 결과 → `normalized`

### 4. Triage 병렬 (Phase B에서 본격화)
- **Tagging** (T1): 팀/선수/감독/대회/이슈 카테고리
- **Naming Resolver** (T2): alias dictionary 조회 + 한글 표기 결정. dictionary 미스는 unresolved
- **Link Collector** (T0+T1): article/X/Instagram/YouTube URL 추출, oEmbed 가능 여부

세 결과 머지 후 → `enriched`.

Phase A는 Naming Resolver만 LLM, 나머지는 stub.

### 5. Dedupe Checker
- 입력: enriched 항목
- dedupeKey 1차 매칭 → 동일 키 존재 시 `duplicate` + 기존 draft에 link append
- 1차 미스 시 embedding 보조 (Phase B): 24h 윈도우 cosine > 0.92면 duplicate
- 통과 → `dedupe_checked`

### 6. Desk Reviewer
- 입력: dedupe_checked 항목 (T2)
- 결정: approve / reject / hold / merge / request_rewrite / reassign
- request_rewrite는 메시지와 함께 normalized로 되돌림 (재진입 max=2)
- approve → `desk_approved`

### 7. Assignment (Phase A는 결정론)
- desk_approved → 단일 writer로 라우팅
- → `assigned`

### 8. Summary Writer (유일한 T3)
- 입력: reservoir에서 필요한 필드만 직렬화 (raw 본문 미포함)
- 길이/스타일 강제
- 출력: `KoreanBrief = {headline, body, citations, unverifiedFlags}`
- → `drafted`

**Phase A는 여기서 멈춘다.**

### 9. SEO Formatter (Phase B)
- 입력: KoreanBrief
- 출력: `{title, slug, metaDescription, ogImageHint, keywords[]}`
- T1. → `formatted`

### 10. Final Publisher (Phase B)
- 모든 필드 합쳐 PublishPayload 생성
- 멱등성 체크. community board API 호출
- 성공 → `published`. 실패 → `failed` + audit

## Status 전이표

| from | to | trigger | actor |
|---|---|---|---|
| – | ingested | INSERT | scout |
| ingested | credibility_passed/_rejected | filter run | credibility |
| credibility_passed | normalized | normalize run | normalizer |
| normalized | enriched | 3 enrichers all done | join |
| enriched | dedupe_checked / duplicate | dedupe run | dedupe |
| dedupe_checked | desk_* | review run | desk |
| desk_approved | assigned | assign run | assignment |
| assigned | drafted | writer run | writer |
| drafted | formatted | format run | seo (Phase B) |
| formatted | published / failed | publish call | publisher (Phase B) |

## 통합 지점

### 입력 통합
- 기존 `data/crawlers/core/reddit-fetcher.js`의 출력을 그대로 `RawPost`로 받을 수 있다
- Naver News fetcher는 Phase A 범위 외 (한국 매체는 한국식 표기 문제가 거의 없어서 분리하는 게 깔끔)

### 출력 통합 (Phase B)
- PublishPayload → community board POST endpoint. 필드 매핑:
  - `headline` → `posts.title`
  - `body` → `posts.content`
  - `tags` → `post_tags`
  - `urls.article + urls.socials` → `posts.metadata.sources` (oEmbed 렌더링)
  - `entities` → `post_entities` (선수/팀 페이지 자동 링크용)
- ⚠️ 위 컬럼명은 예시. 실제 schema 확인 후 매핑

## Reservoir 테이블 (Supabase 권장 스키마)

```sql
CREATE TABLE news_reservoir (
  id              text PRIMARY KEY,
  source          jsonb NOT NULL,
  urls            jsonb NOT NULL,
  raw             jsonb NOT NULL,
  normalized      jsonb,
  entities        jsonb,
  unresolved      jsonb,
  tags            text[],
  issue_type      text,
  scores          jsonb NOT NULL,
  dedupe_key      text NOT NULL,
  status          text NOT NULL,
  decision        jsonb,
  assignment      jsonb,
  draft           jsonb,
  publish         jsonb,
  external_key    text UNIQUE,
  audit           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX news_reservoir_status_idx       ON news_reservoir(status);
CREATE INDEX news_reservoir_dedupe_key_idx   ON news_reservoir(dedupe_key);
CREATE INDEX news_reservoir_created_at_idx   ON news_reservoir(created_at DESC);
```

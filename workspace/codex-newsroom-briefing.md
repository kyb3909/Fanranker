# AI 뉴스룸 전체 파이프라인 점검 브리핑 (for Codex)

> gongnori.fan의 **뉴스 수집 → 분석 → 번역·기사화 → 데스킹 → 사가(위키) 편입** 전 과정을
> **에이전트 구조 관점에서** 점검한다. 작성 2026-08-05.
> 사가 엔진 자체의 세부는 `workspace/codex-saga-briefing.md`(별도 문서)를 함께 읽어라.

## 0. 미션

이 시스템은 "사람 1명이 운영하는 무인 뉴스룸"을 지향한다. 지금은 **여러 세대의 구현이
겹쳐 쌓인 상태**(레거시 크롤러 + 멀티에이전트 뉴스룸 + VPS 스캐너 + Vercel cron)라,
누가 무슨 일을 하는지가 코드만 봐서는 안 잡힌다.

요청: **에이전트 구조를 실제 코드 기준으로 재구성해서 그리고, 중복·공백·모순을 찾아라.**
"이 단계는 누가 책임지는가 / 겹치는 책임은 없는가 / 끊긴 곳은 없는가"가 핵심 질문이다.

## 1. 실행 인프라 3곳 — 먼저 이걸 이해해야 한다

| 위치 | 무엇이 도는가 | 특징 |
|---|---|---|
| **Vercel** (이 리포) | `app/api/cron/*` 전부 + `lib/*` 로직 | `vercel.json`에 스케줄 등록. 배포=push |
| **Vultr 서울 VPS** | `/opt/crawlers/runner.js`(10분), `/opt/news-scanner`(데스킹 큐 생성), `/opt/betman/*` | **git 밖 파일**. 해외 IP 차단 회피용(betman) + 레딧 페이싱. 원칙: **VPS 무수정** |
| **로컬 PC (Hermes)** | 교정 학습 배치 cron(21시) | gpt-5.5 에이전트. 게이트웨이 안 뜨면 조용히 멈춤 → **2026-08-04 Vercel cron으로 이관됨**, 이제 안전망 |

⚠️ **가장 흔한 착각**: "기사가 짧다/이상하다"의 원인은 리포의 `data/agents/`가 아니라
**VPS `/opt/news-scanner`**다. `data/agents/`는 수동 실행 뉴스룸이고 cron 자동화가
금지돼 있다(비용). 리포 코드를 고쳐도 프로덕션 기사 품질은 안 바뀔 수 있다 — 어느 쪽이
실제로 도는지 먼저 확정하라.

## 2. 파이프라인 5단계 — 단계별 담당자

```
[수집] → [분석·필터] → [번역·기사화] → [데스킹] → [발행] → [사가 편입] → [학습 되먹임]
```

### ① 수집 (crawling)
- **VPS `/opt/crawlers/runner.js`** (10분) → `news_ticker_items` upsert. Reddit + Naver News.
  **절대 끄지 말 것** (티커의 원천).
- **리포 `data/crawlers/`** — 위 러너의 소스 코드 계열. Reddit 44 + Naver 11 = 55 소스.
  자체 `package.json` (별도 `pnpm install` 필요).
- **`saga-ingest` cron** (매시 12,42분) — 티커를 **2차 소비** + 해외 RSS → `saga_reservoir`.
- ⚠️ **레딧 예산 실측: IP당 60초에 1건.** "소스 14/16이 죽었다"의 진짜 원인은 서브레딧
  차단이 아니라 이 페이싱이다. 로테이션 응급처치가 들어가 있고 근본해결은 OAuth.

### ② 분석·필터
- `filter-credibility-run.js` (data/agents) — 신뢰도 점수
- **`news-interest-filter` cron** (매시, gpt-4o-mini) — 관심도 필터
- **여자 축구 3중 가드** — 제목·출처 URL·영문 원제까지 검사 (`isWomensFootball`).
  한국어 번역 제목에서 성별 표기가 지워지는 실사고(몰리 바트립)로 3중이 됐다.
- **한국 매체 피드 금지** (`source_url` 기준) — 사가 연표는 예외
- **개인 블로그·뉴스레터 금지** (`PERSONAL_BLOG_RE`) — Substack 실사고

### ③ 번역·기사화 (여기가 품질의 원천)
- **VPS 스캐너**가 원문 ~2,800자를 받아 한국어 기사 500~1,000자로 작성
- **드라이 톤 규칙**: 감상·질문·평가 금지, 팩트 와이어체. 전부 한국어
- **교정 few-shot 자기개선**: `raw ≠ draft` 교정쌍을 스캐너 프롬프트에 주입 →
  고칠수록 원본이 좋아지는 구조 (Ornstein → 온스테인 등)
- `data/agents/prompts/*.md` — credibility-filter / korean-naming-resolver /
  desk-reviewer / summary-writer / seo-formatter / agg-rewriter

### ④ 데스킹 (검수)
- 산출물은 `news_reservoir` 행: `drafted → published | rejected`, **48h 자동 만료**
  (`news-expire-drafts` cron)
- **사람 검수**: `/admin/news-review` — 단일 검수 화면 (2026-08-04 "검수는 하나로").
  기사 검수 + 사가 큐 + 표기 사전 후보 + 발행물 사후 교정이 한 페이지에 있다
- **자동 발행**: `news-auto-publish` cron (:07/:37) — env `NEWS_AUTO_PUBLISH=on`.
  일일 상한 없음(2026-08-04 무제한 전환), 회당 2건 페이싱만
- **품질 게이트 (fail-closed)**: `lib/news/quality-gate.ts`
  - 본문 검사관 **gpt-5.6-terra** — 제목-본문 불일치·수치 모순 판정
  - 이미지 검사관 **gpt-5.6-terra vision** — 배너·로고 카드 차단
  - 표기 사전 게이트 `unknownPlayerNames` — 미등재 선수명이면 자동발행 제외
  - 중복 차단 `titleSimilarity >= 0.5`

### ⑤ 사가 편입
- 발행 경로 단일화: `lib/news/publish.ts` → `linkArticleToSaga`(자동, fail-open) 또는
  `linkArticleToSagaChosen`(검수자 지정, 동기·throw)
- 별도로 `saga-extract` cron이 저수지에서 직접 사가를 자동 생성

### ⑥ 학습 되먹임 (고칠수록 좋아지는 루프)
- `learnFromDeskEdit` — 검수·사후 교정 시 **즉시** (gpt-4.1-mini, 환각 가드)
- `news-learn-edits` cron (매일 22:30 KST) — 발행 후 수정분 줍기
- `naming-librarian`(15:40) / `naming-audit` cron — 표기 사전 관리
- **표기 사전 후보 1클릭 등재** (2026-08-04 신설) — 게이트가 막은 이름 → 사람 클릭으로
  등재. `lib/news/alias-suggest.ts`(자모 유사도) + `/api/admin/player-dictionary`
- 사전 = `news_alias_dictionary` (Supabase). **VPS 스캐너와 Vercel이 공유하는 유일한 지식베이스**

## 3. LLM 에이전트 인벤토리 (실측 2026-08-05)

| 파일 | 모델 | 역할 | 트리거 |
|---|---|---|---|
| `lib/news/quality-gate.ts` ×2 | **gpt-5.6-terra** | 발행 전 본문·이미지 검사관 | 자동발행 시 |
| `app/api/cron/hero-editor` | gpt-4o | 메인 히어로 3장 편집장 | 30분 |
| `lib/saga/extract.ts` | gpt-4o-mini | 제목→이적 정보 추출 (20건 배치) | 15분 |
| `app/api/cron/news-interest-filter` | gpt-4o-mini | 관심도 필터 | 매시 |
| `lib/news/vs-issue.ts` | gpt-4o-mini | VS 쟁점 생성 | 발행 시 |
| `lib/naming/verify.ts`, `naming-audit` | gpt-4o-mini | 표기 검증 | cron |
| `app/api/og/route.ts` | gpt-4o-mini | OG 3줄 요약 | 사용자 /write |
| `lib/news/learn-corrections.ts` | gpt-4.1-mini | 교정 diff → 사전 학습 | 수정 시 |
| `lib/admin/insight.ts` | gpt-4.1 | 운영 인사이트 | admin 대시보드 |
| VPS 스캐너 | (VPS 설정) | 기사 작성·데스킹 | VPS cron |

**규칙 판정은 LLM에 맡기지 않는다** — 매체 티어(`lib/saga/tier.ts`), 여자축구 가드,
개인 블로그 차단, 중복 판정은 전부 결정론 코드다. LLM 몫은 언어 이해가 필요한 것뿐.

## 4. 불변 조건 (위반하는 제안 금지)

1. **런타임 멀티에이전트 금지** — cron + 구조화 프롬프트 단순 체인. 멀티에이전트 하네스는
   개발 단계에서만 (비용·불안정성)
2. **VPS 무수정** — 티커는 읽기만. VPS 파일은 git 밖이라 리포 수정으로 안 바뀐다
3. **fail-open vs fail-closed 구분**: 사가 연동 실패는 발행을 막지 않는다(fail-open).
   품질 검사관은 판단 불가면 발행 보류(fail-closed). 뒤집지 말 것
4. **GPT-5 계열에 `temperature` 전달 금지** — 400 에러 → fail-closed라 전건 반려로 조용히 죽는다
5. **자동 사전 등재 금지** — 사전 한 줄 오염이 모든 기사에 전파된다. 후보 추출까지만 자동,
   확정은 사람 클릭. 학습에는 **환각 가드**(원문·수정본에 실재하는 문자열만) 필수
6. **저작권**: 기사 본문 저장·표시 금지. 제목+매체+링크+완전 재작성 요약까지만
7. **콘텐츠는 전부 한국어**, 드라이 톤. 한국 매체 기사는 피드 금지
8. **여자 축구 전면 제외** (운영자 확정)
9. `git push` 금지 — 커밋까지만. DB 직접 변경 금지 (마이그레이션 파일만 추가)

## 5. 현재 실측 baseline (2026-08-04~05, 점검의 출발점)

- 초안 유입 **128건/일**, 발행 **25건/일**(20%), 48h 만료 반려가 나머지 대부분
- 게이트 반려 27건/24h 구성: 사전 미등재 **13(48%)** / 검사관 본문 7 / 중복 6 / 이미지 1
- 최근 제거된 병목: 일일 상한(총20·자동10) 제거, **루머+이적 차단 제거**
  (큐의 46%를 *사유 기록 없이* 탈락시키고 있었다)
- 검사관은 2026-08-04 gpt-4o → gpt-5.6-terra 전환. **효과 측정 중**

## 6. 점검 요청

### A. 에이전트 구조 재구성 (이번 라운드의 본체)
실제 코드 기준으로 다음을 그려라 — 추측 금지, 파일 경로 근거를 달아라.
1. **단계별 책임 지도**: 수집·분석·기사화·데스킹·발행·사가·학습 각각을 **누가**(파일/cron/VPS)
   책임지는가
2. **중복 책임**: 같은 일을 두 곳에서 하는 것 (예: 레거시 크롤러 vs 신규 파이프라인,
   `data/agents` vs VPS 스캐너, 학습 경로 3개). 어느 쪽이 실제로 도는가?
3. **공백**: 아무도 책임지지 않는 구간
4. **모순**: 한쪽이 통과시킨 것을 다른 쪽이 막는 구조

### B. 침묵 실패(silent failure) 전수 조사 — **최우선**
2026-08-04에 "사유를 기록하지 않고 `continue`하는 필터"가 큐의 46%를 먹고 있던 사고가
있었다. 같은 유형이 더 있는지 전수로 찾아라: **탈락·스킵·early return 하면서 아무 흔적도
안 남기는 지점**. 각각에 대해 "운영자가 이걸 어떻게 알아채는가?"를 답하고, 로깅 보완안을
제시하라.

### C. 학습 루프 정합성
학습 경로가 3개다: 즉시(`learnFromDeskEdit`) / Vercel cron(`news-learn-edits`) /
VPS·로컬 배치(`learn-from-edits.js`). 
- 같은 수정을 중복 학습하지 않는가 (audit 해시 컨벤션 확인)
- 사전에 잘못된 규칙이 들어갈 경로가 남아 있는가
- 학습된 사전이 **VPS 스캐너에 실제로 반영되는가** (여기가 끊기면 루프 전체가 무의미)

### D. 비용·모델 배치 타당성
`hero-editor`가 gpt-4o를 30분마다 쓴다(월 최대 지출 지점). 각 호출 지점의 모델 선택이
과한지/부족한지 판단하고 재배치를 제안하라. **월 예산 5만원** 기준.

### E. 파이프라인 처리량
유입 128 → 발행 25(20%)의 손실 구간을 정량화하라. 어디서 얼마나 새는가, 무엇이
회복 가능한 손실이고 무엇이 정당한 차단인가.

## 7. 작업 규칙

- pnpm 10. 타입 `pnpm exec tsc --noEmit`(strict), 린트 `pnpm exec eslint .`, 테스트 `pnpm test`
- pre-commit hook 있음 — **`--no-verify` 우회 금지**
- `data/agents/`, `data/crawlers/`는 자체 `package.json` — 해당 디렉토리에서 별도 install
- 주석·커밋 메시지는 한국어, "왜"를 남기는 스타일
- **1라운드는 조사·보고 중심.** 코드 수정은 (a) 로깅 보완, (b) 명백한 버그, (c) 테스트
  추가로 제한하고, 구조 개편·프롬프트 변경은 **제안만** 하라 (운영자 승인 후 2라운드)
- 결과물: `workspace/codex-newsroom-review-{날짜}.md`
  — 에이전트 구조도 / 중복·공백·모순 / 침묵 실패 목록 / 처리량 분석 / 우선순위 제안
- DB 접근이 없으면 정적 분석만 하고, 검증에 필요한 SQL을 보고서에 적어둬라

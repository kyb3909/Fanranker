# Draft Builder Agent System — PRD

## 1. 목적

자연어 한 줄 또는 부분 채워진 CSV로 새 드래프트 게임의 **재료 (선수/캐릭터 리스트 + 포지션 + 추정 몸값)** 를 자동 생성. 출력은 gongnori.fan 의 [draft-games-csv](../../draft-games-csv/README.md) 형식. 사용자가 검토/후보정 후 DB 에 직접 insert.

## 2. 시스템 boundary

```
┌─────────────────────────────┐         ┌────────────────────────────┐
│ Draft Builder Agent System  │  CSV    │ gongnori.fan               │
│ (외부 — n8n/Langchain/SDK)  ├────────▶│ - CSV 검토                  │
│                             │         │ - DB insert                 │
│ - 자연어/CSV 입력           │         │ - /games/draft/[slug]       │
│ - Google 종합 검색          │         │   라우트 활성화             │
│ - LLM 으로 후보 + 추정      │         └────────────────────────────┘
│ - 3개 CSV 출력              │
└─────────────────────────────┘
```

이 문서는 **외부 에이전트 시스템 spec**. gongnori.fan 코드는 안 만짐. 향후 외부 repo 로 분리 가능하도록 한 폴더에 응집.

## 3. 핵심 원칙

| 원칙 | 의미 |
|------|------|
| **Entity / Role / Attribute / Price** | 도메인 무관 추상화. 축구·삼국지·아이돌 모두 같은 4축으로 표현 |
| **real_world_value ≠ game_price** | 현실 가치는 참고. 최종 가격은 게임 밸런스용 재구성값 |
| **estimated 플래그 필수** | LLM 추정값은 모두 `estimated=true`. 사용자가 후보정할 정보 |
| **Source URL 보존** | 검색 출처는 가능한 한 source 컬럼에 기록 |
| **사용자 후보정 전제** | 80% 채우고 운영자가 20% 다듬는 패턴. 완벽 추구 안 함 |

## 4. 에이전트 조직 (9개)

| 에이전트 | 책임 | 입력 | 출력 |
|---------|------|------|------|
| **Orchestrator** | 대화 흐름 + 라우팅 + 시즌 루프 관리 | 자연어 / CSV | 다음 단계 |
| **Designer** | 도메인 분류 + 인터뷰 + 역할/속성 스키마 | 자연어 | 게임 정의 (slug, roster, positions, attributes) |
| **Season Crawler** (NEW) | 시즌 단위 squad 리스트 추출 (도메인이 시즌 단위면) | 게임 정의 + 시즌 | 시즌별 후보 명단 |
| **Researcher** | 각 entity 별 검색 + 포지션 + 몸값 추정 | 후보 명단 | enriched entity (stats, position, price, source) |
| **Localization Validator** (NEW) | 외래어 이름 → 한국어 정식 번역명 검증. 한국어 fan wiki 우선 source. | 외래어 + 추정 한국어명 | 검증된 name_ko + estimated 플래그 강제 |
| **Deduplicator** (NEW) | 시즌별 출력 합쳐서 중복 통합 | 시즌별 enriched 출력들 | 통합된 entity 리스트 (era 범위 합침, 출전수 누적) |
| **Coverage Validator** (NEW) | 누락 시즌 / 포지션 체크 | 통합 entity 리스트 + 시즌 범위 | 누락 alert |
| **Self-Critique** (NEW) | "빠진 의외의 선수 N명?" 반복 prompt 로 누락 보강 | 통합 entity 리스트 | 추가 발견 entity |
| **Writer** | 3개 CSV 출력 + 스키마 검증 | 최종 entity 리스트 | `01-game-meta.csv`, `02-game-positions.csv`, `03-game-items.csv` |

### 왜 8개로 늘었나

v1 (4 에이전트) 의 Researcher 가 **단발 LLM 호출**이라 학습 기억에서 떠오르는 유명 entity 50-100명만 잡힘. 시즌 23개 × 평균 24명 = 552 raw entries 모수에서 의도적 sampling 이 아닌 임의 sampling.

v2 는 **시즌 루프 + 누락 검증 + self-critique** 로 systematic coverage 달성.

### Unique 선수 수 추정 (현실적)

| 단계 | 누적 |
|------|-----:|
| Season Crawler 23 시즌 × 평균 24명 | 552 raw entries |
| Deduplicator (평균 체류 3-4 시즌) | ~160 unique |
| + Transfers in/out 페이지 (단기 영입) | +25 |
| + Self-Critique 5 iteration (포지션/시대/임대/문화별) | +35 |
| + Coverage Validator 누락 보강 | +10 |
| **최종** | **~230명** |

한 클럽 23 시즌 1군 출전자 모수의 max 에 근접. 300+ 는 academy 까지 포함하지 않는 한 비현실적.

도메인별 기대치:
- **스포츠 클럽 (23 시즌)** — 230명 안팎
- **삼국지 (전체 시대)** — 100-150명 (정사 vs 연의)
- **K-pop 4세대 걸그룹** — 50-80명 (현역 위주)
- **영화 / 만화 캐릭터** — 50-200명 (작품 범위 의존)

### 비용

v1=3 LLM call. v2=23 (Season Crawler) + N (Researcher per player) + 5 (Critique iteration) ≈ **80-120 LLM call + 50-80 search**. 비싸지만 quality 가 점프.

### 도메인별 적용

- **시즌/연도 구조 명확** (스포츠 클럽, 정치 임기) → Season Crawler 활성. 시즌별 systematic 루프.
- **시대 구조 모호** (소설, 가상 세계관, 영화 시리즈) → Season Crawler off. Researcher 단발 + Self-Critique 만으로 보강.
- **사용자가 "총체적/자세하게" 요청 시** → Season Crawler + Self-Critique iteration 횟수 늘림.

### 빠진 것 (Phase 2)

**Game Balance Simulator** — random draft N회 돌려서 우승 빈도 확인. LLM 으로 못 함. programmatic 모듈로 별도 구축. 이 PRD 범위 밖.

## 5. Workflow

### 시나리오 A — 자연어 입력 (신규 게임, systematic mode)

```
1. 사용자: "아스날 역대 선수들로 드래프트 만들고 싶어 (Invincibles 이후)"
2. Orchestrator → Designer 호출
3. Designer: 도메인 분류 (sports_football_club_legends), 5-7개 질문
   "시대 범위? (2003-04 ~ 현재 / Wenger era / 전체)"
   "유스만 출전한 prospect 포함?"
   "Coverage 깊이? (빠른 100명 / 총체적 250+)"
   ... (defaults 제공)
4. 사용자 답변 (또는 "총체적으로")
5. Orchestrator → Season Crawler 호출 (총체적 모드면)
   for season in [2003-04, 2004-05, ..., 2025-26]:  # 23 시즌
     - Search: "{season} Arsenal F.C. season squad Wikipedia"
     - Extract: 1군 squad table → 22명 안팎
     - 시즌별 raw 명단 누적 → ~500개 (중복 포함)
6. Orchestrator → Researcher 호출 (각 unique player 별)
   - 검색: name + Arsenal career stats
   - 포지션 / 출전 / 골 / 트로피 / 추정 가격
   - source URL 보존
6.5. Orchestrator → Localization Validator 호출
   - 외래어 → 한국어 정식 번역명 검증 (나무위키 등 한국어 fan wiki 우선)
   - 매칭 실패 → estimated=true 강제 + notes 표시
   - 슬램덩크 같은 만화/영화는 이 단계가 특히 중요 (Kawata Masashi → 신현철 같은 매핑)
7. Orchestrator → Deduplicator 호출
   - 시즌 중복 합치기 (Henry 5 entries → 1)
   - era 범위 자동 계산 (min~max season)
   - 출전 / 골 누적
   → 통합 entity 리스트 ~280명
8. Orchestrator → Coverage Validator 호출
   - 각 시즌 18명 이상 cover 됐는지 체크
   - 누락 시즌 / 포지션 alert
9. Orchestrator → Self-Critique (2-3 iteration)
   "이 명단에서 빠진 의외의 선수 10명?"
   → 추가 발견 → Researcher 재호출 → Dedup 재실행
10. Orchestrator → Writer 호출
    - 3개 CSV 출력 + 스키마 검증
11. 사용자에게 CSV 다운로드 제공
```

### 시나리오 A-light — 빠른 모드 (선택)

도메인이 시즌 구조 없거나 사용자가 "빠르게" 요청 시 Season Crawler / Deduplicator / Validator 생략. Researcher 단발 + Self-Critique 1회 만. 50-100명 출력. v1 워크플로우.

### 시나리오 B — CSV 빈칸 보완

```
1. 사용자: 부분 채워진 CSV 업로드 ("이 빈칸 채워줘")
2. Orchestrator → Designer 호출 (도메인 추론만)
3. Designer: CSV 헤더 + 일부 행 보고 도메인 추론. 부족한 규칙만 질문.
4. Orchestrator → Researcher 호출 (빈칸만)
5. Researcher: 각 entity 의 빈 필드만 검색해서 채움
6. Orchestrator → Writer 호출
7. Writer: 원본 보존 + 새로 채운 값에만 estimated=true. 변경 로그 첨부
8. 사용자에게 보완된 CSV 다운로드
```

**원칙:** 시나리오 B 에서 기존 값은 절대 덮어쓰지 않음. `overwrite=true` 명시 시에만.

## 6. CSV Contract

출력 스키마는 gongnori.fan 의 [docs/draft-games-csv/](../../draft-games-csv/README.md) 와 동일. 3개 파일:

- `01-game-meta.csv` — 게임 정의 (slug, roster, budget, formation)
- `02-game-positions.csv` — 포지션 정의 (game_slug FK)
- `03-game-items.csv` — entity 리스트 (game_slug FK, attribute_json 자유 스키마)

추가 컬럼 (에이전트 시스템 전용):

| 컬럼 | 용도 |
|------|------|
| `estimated` | true/false. AI 추정이면 true |
| `source` | 검색 출처 URL (있으면) |
| `notes` | 보조 설명 (불확실성, 후보정 힌트 등) |
| `confidence` | 0-1. 추정 신뢰도 (옵션) |

gongnori.fan import 시점에 이 컬럼들은 무시 (DB 에 안 들어감, 운영자 검토 보조용).

## 7. 검색 전략 (Researcher)

- **Google 종합 검색** — 단일 소스 의존 안 함. 위키 + 팬사이트 + 통계 + 뉴스 종합
- **검색 쿼리 패턴**:
  - 후보 발굴: `"{domain} greatest/legends/all-time"`
  - 개인 데이터: `"{name} {team} stats career"`
  - 포지션 확인: `"{name} position role"`
  - 한국 도메인: 나무위키 fallback
- **출처 보존** — 모든 entity 에 가능한 한 source URL 1개 이상
- **다국어** — 한글 이름 / 영문 이름 둘 다 시도. name_ko 필드 채우기 위해

검색 도구는 외부 시스템에서 선택 (Brave / Tavily / SerpAPI / 자체 fetch). 이 PRD 는 구현 도구 비종속.

## 8. 에이전트별 system prompt

각 prompt 는 [`prompts/`](./prompts/) 폴더의 별도 파일. 그대로 system prompt 로 LLM 에 박아 사용 가능:

- [`orchestrator.md`](./prompts/orchestrator.md)
- [`designer.md`](./prompts/designer.md)
- [`season-crawler.md`](./prompts/season-crawler.md) — NEW
- [`researcher.md`](./prompts/researcher.md)
- [`localization-validator.md`](./prompts/localization-validator.md) — NEW
- [`deduplicator.md`](./prompts/deduplicator.md) — NEW
- [`coverage-validator.md`](./prompts/coverage-validator.md) — NEW
- [`self-critique.md`](./prompts/self-critique.md) — NEW
- [`writer.md`](./prompts/writer.md)

## 9. 실행 환경 옵션

이 PRD 는 환경 비종속. 사용자가 선택:

| 옵션 | 특징 |
|------|------|
| **n8n** | visual workflow, fastest to ship, low code |
| **Langchain (Python/JS)** | 풀 코드, agent loop 컨트롤 강함 |
| **OpenAI Agents SDK** | OpenAI 표준 멀티에이전트 |
| **Claude API + 자체 orchestrator** | 가장 단순. function calling 으로 4개 prompt 순차 호출 |

추천: **Claude API + 자체 orchestrator** 또는 **n8n**. Langchain 은 보일러플레이트 많음.

## 10. MVP 범위

**포함:**
- 자연어 → 신규 게임 생성 (시나리오 A)
- CSV 빈칸 보완 (시나리오 B)
- 4개 에이전트
- 3개 CSV 출력
- Google 종합 검색 + estimated 플래그

**제외 (Phase 2):**
- Game Balance Simulator (random draft N회 시뮬레이션)
- Entity Resolver UI (동명이인 confirmation flow)
- 외부 스포츠 API 직접 연동 (현재는 Google 검색만)
- 캐싱 레이어 (검색 결과 재사용)
- 멀티유저 협업 / 커뮤니티 vote-based 가격

## 11. 성공 기준

| 지표 | 목표 |
|------|------|
| 자연어 → 30+ entity CSV 까지 | < 3 분 |
| 사용자 후보정 비율 | < 30% (10명 중 7명은 그대로 사용 가능) |
| 첫 게임 생성 완료율 | 90%+ (CSV 다운로드까지 도달) |
| `estimated` 플래그 정확도 | 추정값은 모두 true 마킹 (false positive 0%) |

## 12. 다음 단계

1. 4개 에이전트 system prompt 확정 ([`prompts/`](./prompts/))
2. 사용자가 외부 환경 선택 (n8n / Claude API / etc)
3. 첫 게임 (아스날 레전드) 으로 end-to-end 실행
4. CSV 출력 → gongnori.fan DB insert
5. /games/draft/[slug] 활성화 확인
6. 사용 패턴 보고 Phase 2 (Balance Simulator) 결정

# PRD — 경기 프리뷰 자동 글 (Match Preview)

2026-07-27 초안. 오늘의 경기·승부예측에서 경기별 프리뷰 글로 진입하는 유입용 콘텐츠 시스템.

## 1. 목적 / 포지셔닝

- **성격: 프리뷰(정보성 읽을거리)** — 매치 스레드(응원방)가 아님. 댓글창이 자연스럽게 그 역할을 하게 두되, 설계는 비로그인 읽기 가치에 맞춘다.
- 유입 우선 원칙 충족: 유저 0명 성립(봇 발행) / 비로그인 가치 / 경기별 고유 URL(검색 유입) / 경기 일정 = 데일리 훅.
- 핵심 루프 브리지: 소식(프리뷰) → 예측 참여. 슬립 제출 직후 주입 동선(콘텐츠 소비 최대 레버)과 결합.

## 2. 콘텐츠 소스 — Soccerway ANALYSIS 섹션

경기 페이지 예: `soccerway.com/match/{home-slug}/{away-slug}/?mid={eventId}`
ANALYSIS 탭에 자동 생성("Generated automatically") 통계 프로즈가 있음. 섹션 구성과 채택 여부:

| Soccerway 섹션 | 채택 | 비고 |
|---|---|---|
| 도입부 (일시·경기장·리그) | O | 우리 포맷으로 재구성 |
| Where to Watch | **X** | 1xBet 등 해외 도박 스트리밍 링크 — 국내 컴플라이언스상 전체 폐기. 국내 중계는 다루지 않음(오정보 위험) |
| Current Team Form | O | 순위·승점·최근 5경기·직전 경기 결과 |
| Key Players to Watch | O | 팀별 득점 상위 선수 |
| Head-to-Head Record | O | 최근 상대전적 + 홈/원정 득실 통계 (분량 조절 — 전부 넣으면 장황) |
| Hot Stats | O | 코너킥 등 이색 통계 — 떡밥 가치 높음 |
| Streaks | O | 연승/무승 스트릭 — 떡밥 가치 높음 |
| Betting Tips, Prediction | **부분** | 북메이커·배당 언급 제거. "승률 41% / 무 30% / 29%"는 **배당 숫자가 아니므로** "데이터 기반 승률"로 표기 가능. 스코어 예측(over 4.5 등)은 사행성 문구 없이 "다득점 예상" 정도로 순화 |

### 번역 방식: "그대로 번역"이 아니라 "팩트 보존 재작성"

원문이 기계 생성 통계 프로즈라 저작권 리스크는 낮지만, 그대로 번역하면 (a) 도박 링크·광고 문구가 섞이고 (b) 영문 통계체 특유의 장황함이 그대로 온다. 기존 뉴스 검수 원칙(드라이 톤, 팩트 와이어체, 한국어 온리)과 동일하게:

- 추출한 섹션별 텍스트를 LLM(gpt-4.1-mini)에 넣어 **수치·팀명·팩트는 그대로, 문장만 드라이 톤 한국어로 재구성**.
- 팀명·선수명은 뉴스 에이전트의 korean naming 규칙/알리아스를 재사용 (Ornstein→온스테인 교정 학습 체계와 동일 계열).
- 말미에 "데이터 출처: Soccerway" 1줄 표기 (원 소스 해석 체인 정책상 유통 채널이 아닌 데이터 플랫폼이므로 표기 가능. 링크는 선택).

## 3. 수집 기술 — headless 추출 (API 역공학 금지)

- Soccerway는 SPA. 데이터는 Flashscore 피드(`global.flashscore.ninja/.../feed/*`, `÷¬` 구분자 + `x-fsign` 서명)와 GraphQL로 분산 — **역공학은 취약**하고 서명 변경에 깨진다.
- 대신 **Playwright headless로 경기 페이지를 열고 렌더된 ANALYSIS 섹션의 innerText를 추출** (검증 완료: `body.innerText`에서 "Pre-Match Analysis:" 이후 슬라이스로 전 섹션 확보됨).
- 실행 위치: **Vultr VPS** (기존 크롤러 cron 옆). `npx playwright install chromium --with-deps` 1회 필요. Vercel은 chromium 무게 때문에 부적합.

## 4. 경기 매핑 — betman game ↔ soccerway mid

프리뷰 글이 예측 버튼과 연결되려면 betman `games` 행과 soccerway eventId 매핑이 필요.

1. **대상 리그 화이트리스트**(Phase 1: EPL. 이후 라리가·분데스·세리에A·MLS 순 확장)의 soccerway 리그 일정 페이지를 headless로 열어 오늘~+2일 경기 목록(mid, 팀명 EN, KO 시각) 수집.
2. betman 슬레이트(축구, 해당 리그)와 매칭: **팀 알리아스 테이블(EN↔한글) + 킥오프 시각 ±15분**. 알리아스는 `data/agents` seed-aliases 체계 확장.
3. 매핑 실패 경기는 스킵하고 로그만 (강행 발행 금지 — 잘못된 경기에 예측 버튼 붙는 사고 방지).

## 5. 데이터 모델 / 발행

- `match_previews` 테이블: `id, game_id(fk games), soccerway_mid, post_id(fk posts), status(draft|published|failed), raw_text, published_at`.
  - `raw_text`에 추출 원문 보관 → 재작성 품질 검수·재생성 가능 (agg_reservoir 패턴과 동일).
- 발행: 봇 계정(축구 뉴스 봇 재사용 또는 전용 `user_bot_preview`) 으로 posts 생성. **담벼락/카드뉴스 피드에는 미노출** — 빈 글 양산으로 유령도시 인상 방지가 최우선 설계 제약.
  - 구현: 전용 커뮤니티 슬러그(비활성 게시판) 또는 posts 플래그 컬럼으로 피드 쿼리에서 제외. 진입은 아래 4개 동선으로만.
- 제목 포맷: `[프리뷰] 아스날 vs 토트넘 — 프리미어리그 (8/2 토 23:00)`.
- TipTap 본문: 섹션별 소제목 + 문단. 배당 숫자 없음(배당 비노출 정책 준수), 별점·난이도 표기 없음.

## 6. 노출 동선 (4개)

1. **오늘의 경기 위젯** (홈 오늘의 떡밥 상단): 프리뷰 있는 경기 행에 "프리뷰" 링크 추가.
2. **승부예측 경기 카드**: 카드에 "경기 프리뷰 →" 버튼 (매핑된 경기만).
3. **슬립 제출 직후**: 제출 완료 화면/토스트에 방금 예측한 경기의 프리뷰 링크 — PM 토론 Top5의 "인터스티셜" 항목을 이 콘텐츠로 구현.
4. **경기 종료 후 (Phase 2)**: 글 상단에 결과 + 해당 경기 예측 참여자 적중률 자동 업데이트 → 재방문 훅.

## 7. 파이프라인 & 스케줄

```
[Vultr cron, 1일 2회 (아침/저녁)]
map-run    : 리그 일정 → betman 매핑 → match_previews(draft) 생성
extract-run: draft 대상 headless 추출 → raw_text 저장
publish-run: raw_text → LLM 재작성(드라이톤) → posts 발행 → published
```

- 초기에는 **수동 실행으로 품질 검수** 후 cron 전환 (news agents 수동 실행 원칙과 동일하게 시작).
- 생성 시점: 킥오프 24~36시간 전 (soccerway analysis가 그쯤 생성됨 — 확인 필요; 없으면 스킵 후 다음 사이클 재시도).
- LLM 비용: 경기당 입력 ~3KB. EPL 기준 주 10경기 × gpt-4.1-mini → 무시 가능 수준.

## 8. 리스크

| 리스크 | 대응 |
|---|---|
| Soccerway DOM/문구 변경 | innerText 앵커("Pre-Match Analysis:") 기반 추출이라 DOM 클래스 변경에는 강함. 앵커 소실 시 실패 로그 + Discord ops 알림 |
| analysis 미생성 경기 (하부 리그 등) | 대상 리그 화이트리스트로 시작, 미생성 시 스킵 |
| 팀 매핑 오류 | 매핑 실패 = 발행 스킵. 알리아스 테이블 점진 보강 |
| headless 차단 (Cloudflare 등) | 현재 일반 UA로 접근 가능 확인. 차단 시 요청 간격 확대·재시도. 과도한 빈도 금지 (1일 2회 × 리그당 1페이지 + 경기 페이지 수 건) |
| 빈 글 양산 | 피드 미노출 원칙 (5절) |

## 9. Phase

- **Phase 1 (vertical slice)**: EPL만, 수동 실행, 노출 동선 1·2번만. 성공 지표: 프리뷰 글 조회수(post_views)·프리뷰→예측 전환.
- **Phase 2**: cron 자동화 + 슬립 제출 직후 동선(3번) + 경기 후 결과 업데이트(4번).
- **Phase 3**: 리그 확장 (라리가/분데스/세리에A/MLS), 검색 유입용 메타데이터(OG·구조화 데이터) 손질.

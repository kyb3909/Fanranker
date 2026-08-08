# 전수 아키텍처 감사 진행 상태

> 세션이 끊기면 이 파일부터 읽고 이어서 진행. 규칙: 읽기 전용(산출물은 docs/audit/ 만),
> 모든 주장에 `경로:라인` 근거, 이름만 보고 추측 금지, 못 읽은 건 ❓.

## 상태 보드

| Phase | 내용 | 상태 | 산출물 |
|---|---|---|---|
| 0 | 인벤토리 (라우트/테이블/자동화 전수) | ✅ 완료 | _inventory.md |
| 1 | 도메인별 기능 구조 (10개 병렬 에이전트) | ✅ 완료 (10/10) | notes/*.md |
| 2 | 에이전트/LLM 호출 전수 | ✅ 완료 | notes/llm-map.md |
| 3 | 자동화/cron 전수 지도 | ✅ 완료 (+메인 세션 라이브 검증 §5b) | notes/automation-map.md |
| 4 | 구조 건강 진단 (knip/madge/중복/에러삼킴) | ✅ 완료 — 순환 0, lib→app 역참조 0, 무단 에러삼킴 0, posts 결합 63파일 | notes/health-raw.md |
| 5 | 최종 종합 | ✅ 완료 | ARCHITECTURE_MAP.md, HEALTH_REPORT.md |

## 최종 결과 (2026-08-08)

- **총점 71/100** — 골격(순환 0·역참조 0·시크릿 유출 0·cron 인증 33/33·정산 멱등)은 건강, 병은 "같은 것이 두 벌"(트리거 2중·정산 TS/SQL·admin2 이중 정본·화이트리스트 2벌)에서 발현.
- P0 3건: ①비추 미반영 트리거(라이브 확정) ②치킨 추첨 cron 미등록(8/22 전 필수) ③주간 스냅샷 좀비 의심(8/9 판정).
- 후속 판정 대기: 8/9(일) 15:00 UTC season-weekly-snapshot 실행 여부 / user_acquisition 실패 원인(로그 대조) / VPS 쪽 ❓ 항목들.

## 수리 이력 (감사 직후, 2026-08-08)

| 항목 | 조치 | 검증 |
|---|---|---|
| P0-1 비추 미반영 | 마이그 20260808b — sync 트리거 제거·온도 큐 트리거 분리·vote_count 소급 재계산 (라이브 적용 완료) | 불일치 재조회 0건 |
| P0-2 치킨 추첨 | vercel.json 등록(10 14 * * *) + withCronLog 계측 | JSON 유효·crons 28 |
| P0-3 주간 스냅샷 | invariant-audit 첫 회차가 "실행 기록 없음" 자동 검출(원장 open) — 8/9(일) 회차로 최종 판정 | 감사관 가동 확인(10:44·11:44 성공) |
| P1-3 rate-limit 사각 | 예측 제출 POST만 STRICT (sports/betman 두 경로) | tsc 통과 |
| P1-4 이벤트 교차 오염 | worldcup 페이지 2쿼리 + weekly-draw 후보 빌드에 event_id 필터 | tsc 통과 |
| P1-7 귀속 무증상 | backfill 실패 Sentry 배선 + 가입 시 귀속 없어도 "(direct)"로 항상 POST(signup_at 원장 완결) | tsc 통과 |
| 미착수(중간 난이도) | P1-1 정산 SQL 이원화, P1-2 invest RPC화, P1-5 사가 D9(PRD 논의 선행), P1-6 admin2 API 이전 | 로드맵 6~8·11 참조 |

## 도메인 분할 (Phase 1)

| notes 파일 | 도메인 | 주 진입점 힌트 |
|---|---|---|
| news-pipeline.md | 뉴스 수집→검수→자동발행→학습 | app/api/cron/news-*, lib/news/, data/agents/ |
| saga.md | 사가 엔진 | lib/saga/, app/saga/, app/api/cron/saga-* |
| betting.md | 베팅/정산/토큰·골드 경제 | lib/betman/, app/api/betman/, settle-pending |
| community-core.md | 게시글/댓글/투표/플레어/알림 | app/post, app/write, components/post-* |
| auth-security.md | 인증/미들웨어/CSP/rate-limit | middleware.ts, lib/middleware/, next.config.mjs |
| events-growth.md | 월드컵/시즌 이벤트/유입 계측/폴 | app/worldcup, app/api/event/, user_acquisition |
| metaverse-stadium.md | 메타버스/스타디움/기부 | app/metaverse, lib/metaverse, lib/stadium |
| games.md | 드래프트/미니게임/배틀 | lib/draft, app/games |
| aggregator-ticker.md | 커뮤 애그리게이터/티커/이적판 | agg-*, data/crawlers/, app/transfer |
| admin.md | 어드민 콘솔/권한 | app/admin, app/api/admin |

## 참고 (기존 문서 — 재검증 대상, 결론 그대로 믿지 말 것)
- docs/AUDIT_REPORT.md, docs/audit-2026-04-17.md (구버전)
- CLAUDE.md 아키텍처 메모 (방향 잡기용)

## 로그
- 2026-08-08: 감사 시작. Phase 0 + Phase 1 병렬 에이전트 발사. Phase 2(llm-map)·Phase 4(health-raw)도 병렬 발사.
- ✅ notes/metaverse-stadium.md 완료 — 격리 원칙 사실상 폐기(PIP 전역 상주로 전 페이지 의존, Phaser는 dynamic import라 번들 안전), 🟠 /api/stadiums/invest 무트랜잭션 8단계(이중 투자 race), 🟠 flair_team_id null 하드코딩으로 카르마 적립 사망, 레벨 정의 이원화.
- ✅ notes/community-core.md 완료 (+메인 세션 라이브 DB 검증: 비추 미반영 확정, RPC 이중감소 기각) — 🔴 post_votes vote_count 트리거 2중(sync가 recalc를 덮어 비추 미반영 의심), 🟠 댓글 삭제가 마이그레이션에 없는 RPC 호출, 🟠 PATCH /api/posts 검증 공백, 갓파일 post-card-content 1,050줄. (라이브 DB 검증은 메인 세션에서 수행)
- ✅ notes/aggregator-ticker.md 완료 — 애그리게이터 소스 6개 전부 disabled 확정(휴면). data/crawlers는 "deprecated 예정" 메모와 달리 티커의 현역 유일 공급로. 🔴 ops-monitor "커뮤 크롤 정지" 경보가 휴면 상태에서 영구 참(30분마다 오탐 후보), 티커 폴백이 가짜 헤드라인 노출.
- ✅ notes/llm-map.md 완료 — LLM 호출 27지점(OpenAI 단일 벤더). 최대 비용원=VPS 스캐너, 단가 최고=검사관(gpt-5.6-terra). 잠복 버그: crawlers summarizer가 gpt-5.1에 temperature 전송(5세대 400 — 휴면이라 미발화). 프롬프트 중복 다수.
- ✅ notes/news-pipeline.md 완료 — 16단계 파이프라인·15게이트 전수 표화. 냄새: TipTap 텍스트 추출 4벌 복제, 제목 유사도 2종 병존, funnel 지표 소비처가 폐기 admin2뿐, LLM 10곳(모델 4종).
- ✅ notes/admin.md 완료 — admin2가 "폐기"라기엔 실사용(정본 news-review가 admin2 API 호출, editor 유일 진입로). 가드 무방비 0건이나 구현 4계열 분산. admin_activity_logs 죽은 테이블, content_flags/user_sanctions 미배선.
- ✅ notes/games.md 완료 — 죽은 기능 확정: movie_quiz/virtual_casting/commission/reviews 등 스키마-only 테이블 다수(코드 참조 0). 휴면 보존: 배틀·이상형 월드컵. 냄새: 미니게임 점수 클라이언트 신뢰, 드래프트 픽 무트랜잭션.
- ✅ notes/events-growth.md 완료 — 🔴 season-chicken-draw cron 미등록(치킨 추첨 안 돎), 🔴 event_registrations 조회에 event_id 필터 없어 이벤트 간 교차 오염, user_acquisition 미적재 원인 후보 4개(에러 삼킴 포함), 시즌 이벤트 운영 UI 부재.
- ✅ notes/betting.md 완료 — 핵심: 예측 제출 트랜잭션 없음(보상 방식, 크래시 구멍), SQL 함수 expire_stale_pending_predictions가 정산 로직 2번째 구현(감사·환불 누락), 환불 재시도 패턴 3곳 복제, 돈 라우트 /api/betman/prediction 이 rate-limit 사각, GET에 쓰기 부수효과.
- ✅ notes/saga.md 완료 — 핵심: 오피셜이 에코로 접히면 tier 승격/stage 전진 스킵(D9 실경로 불일치, publish.ts:78-100), cluster_key 포맷 4곳 하드코딩, 기사→사가 자동 경로에 게이트 비대칭, 검수 API가 admin2에 잔존.
- ✅ notes/auth-security.md 완료 — 핵심: 권한 체크 5방식 공존, rate-limit 인메모리(전역 한도 아님), CSP 화이트리스트 이중 하드코딩, onboarding 쿠키 미서명, cron 인증 누락 0건.

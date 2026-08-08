# 구조 건강 리포트

> 2026-08-08 전수 감사. 근거 상세는 `docs/audit/notes/*.md`. 라이브 DB 검증(✅표시)은 메인 세션이 읽기 전용 SQL로 수행.

## 1. 총점: **71 / 100**

| 영역 (각 20점) | 점수 | 산정 근거 |
|---|---|---|
| 구조·의존성 | 17 | 순환 의존 0, lib→app 역참조 0, service role 유출 0 (notes/health-raw.md §2,4,6). 감점: posts 직접 쿼리 63파일(리포지토리 계층 부재), PIP 전역 결합으로 격리 원칙 폐기 |
| 데이터 정합성 | 11 | 정산 멱등 CAS·돈 RPC 잠금·감사 로그는 모범. 감점: 비추 미반영 트리거 버그(프로덕션 확정), 정산 SQL 2중 구현, 이벤트 교차 오염, 무트랜잭션 돈 경로 2곳 |
| 자동화 안전성 | 13 | cron 인증 33/33, 2층 상호 감시, 실측 24h 실패 0. 감점: 치킨 추첨 미등록, 주간 스냅샷 좀비 의심, pg_cron·Edge Fn 리포 밖 정본, 발행 cron 2종 겹침 무방비, 디스코드 SPOF |
| 일관성·중복 | 13 | 정산 코어 단일, sanitize 단일, 에러 삼킴 전부 주석 부착(무단 0). 감점: KST 인라인 31곳, 환불 재시도 3벌, 제목 유사도·온도 2벌, 권한 가드 4계열, 페칭 방식 혼재 |
| 위생 (죽은 코드·드리프트) | 17 | knip 미사용 파일 5뿐, 갓파일 소수. 감점: 죽은 테이블 15+, 미사용 export 117, 문서↔코드 드리프트 다수(admin2·crawlers·README), 루트 산재 파일 |

한 줄 진단: **골격(의존성·보안·멱등성)은 시니어급으로 건강하다. 병은 "두 벌 존재"에서 온다** — 같은 로직·같은 정의·같은 화이트리스트가 두 곳에 살면서 한쪽만 진화한 지점들이 실제 프로덕션 버그(비추 미반영, 좀비 cron)로 발현돼 있다.

## 2. 위험 신호

### P0 — 지금 고칠 것

| # | 항목 | 근거 | 왜 문제 | 방치 시 |
|---|---|---|---|---|
| P0-1 | **비추천이 vote_count에 미반영** — post_votes에 recalc(up−down)·sync(up만) 트리거 2중, 알파벳순으로 sync가 나중에 덮어씀. ✅라이브 확정: 트리거 2개 공존 + 비추 1개 글 3건이 vote_count=0 | notes/community-core.md 냄새#1 + 라이브 검증 §; prod_schema :9004 vs :9016 | 핵심 지표(정렬·온도 패널티)의 정본이 틀림 | 트래픽 늘수록 정렬·온도 신뢰 붕괴, 소급 재계산 비용 증가 |
| P0-2 | **season-chicken-draw cron 미등록** — 주석 "매일 23:10 KST"+멱등 설계 완비인데 vercel.json에 없음, withCronLog도 없음 | notes/automation-map.md §3; season-chicken-draw/route.ts:11 | 등록 누락 사고로 판정 (돌릴 작정으로 만든 코드) | **개막(8/22) 후 데일리 치킨 추첨이 조용히 안 돎** — 이벤트 신뢰 사고 |
| P0-3 | **주간 스냅샷 2종 좀비 의심** — 등록 커밋 7/31인데 8/2(일) 회차 cron_run_log 무기록 ✅(10일 조회 0건). 8/9(일) 15:00 UTC 회차로 최종 판정 | notes/automation-map.md §5b | 팬덤 순위·경품 추첨의 백단이 한 번도 안 돌았을 가능성 | 월요일 발표 콘텐츠 부재 → 이벤트 운영 구멍 |

### P1 — 이번 스프린트

| # | 항목 | 근거 | 왜 문제 | 방치 시 |
|---|---|---|---|---|
| P1-1 | **정산 로직 SQL 2중 구현** — `expire_stale_pending_predictions`가 TS `settlePredictions`와 독립으로 슬립 판정. 부분취소 total_odds 재계산·audit·알림·환불 큐잉 전부 누락 | notes/betting.md §5-1; prod_schema.sql:1518-1576 | 같은 상태머신의 두 번째 구현 — 이미 기능 차이(드리프트)가 실재 | 48h 만료 케이스에서 오지급/무감사 정산 발생 가능 |
| P1-2 | **돈 경로 원자성 2곳** — (a) 예측 제출: 차감→슬립 사이 크래시 시 보상 코드 미실행(pending_refunds 기록도 없음), (b) /api/stadiums/invest: 잔액검사→insert 비원자 8단계(이중 투자 race) | notes/betting.md §1-b; notes/metaverse-stadium.md §6-1 | 보상 방식의 구조적 사각 + donate는 RPC인데 invest만 아님(비대칭) | 트래픽 증가 시 무증상 볼 증발/이중 투자 — 사후 원장 추적만 가능 |
| P1-3 | **돈 라우트 rate-limit 사각** — `/api/betman/prediction`이 STRICT 목록에도 라우트 내 체크에도 없음 (tokens/spend는 이중 방어) | notes/betting.md §5-5; lib/middleware/rate-limit-guard.ts:4-12 | 유일하게 무방비인 돈 차감 라우트 | 스팸 제출로 슬립 폭주·RPC 부하 |
| P1-4 | **이벤트 등록 교차 오염** — event_registrations 조회에 event_id 필터 없는 곳 2곳(월드컵 페이지 카운트/등록 판정, 주간 추첨 후보 빌드) | notes/events-growth.md 냄새 🔴🟡; app/worldcup/page.tsx:56-68, lib/event/weekly-draw.ts:83-91 | 시즌 등록자가 월드컵 판정·유니폼 pool에 섞임 | 추첨 공정성 시비 — 상품 걸린 이벤트라 실피해 |
| P1-5 | **사가 D9 에코 접힘이 오피셜을 삼킴** — 나중 온 오피셜이 같은 cluster/URL로 접히면 tier 승격·stage done·is_confirmed 개방 전부 스킵 (official 우선 선출 함수는 드라이런 전용) | notes/saga.md §6-2; lib/saga/publish.ts:78-100 vs cluster.ts:144-153 | "오피셜인데 문서는 루머 단계" — 노출(noindex) 스위치까지 안 열림 | 이적 마감기 오피셜 러시에서 사가 신뢰 하락 |
| P1-6 | **admin2 폐기 결정 ↔ 실사용 모순** — 정본 검수 화면이 `/api/admin2/news/bulk`·`/api/admin2/saga` 호출, editor 등급 유일 진입로도 /admin2. 지우면 검수가 깨짐 | notes/admin.md §2 | "폐기 확정"이라는 운영 인식과 코드 실태 불일치 — 실수 삭제 위험 | 어느 날 정리 작업이 검수 파이프라인을 끊음 |
| P1-7 | **유입 귀속 무증상 실패** — user_acquisition 적재가 클라 `.catch(()=>{})`+서버 console만. 실패 원인 후보 4개 정리됨, 확정은 로그 대조 필요 ❓ | notes/events-growth.md §2 | 언론사 계약용 지표(소급 불가)가 조용히 유실 중 | 개막 유입 데이터 공백 — 협상 카드 상실 |

### P2 — 로드맵에 편성

| # | 항목 | 근거 |
|---|---|---|
| P2-1 | pg_cron 6개+Edge Fn 1개가 리포 밖 정본 (마이그레이션 0건, Edge 소스 부재) — 재구축 불가·알림 사각 | notes/automation-map.md §2 |
| P2-2 | 발행 cron 2종(news-auto-publish·agg-publish-queue) 겹침 실행 구조적 무방비 (현 주기상 확률 낮음) | notes/automation-map.md §4 |
| P2-3 | 중복 로직 4종 — KST 산술 31건/21파일, 환불 재시도 3벌, 제목 유사도 2벌, cluster_key 포맷 4곳 | notes/health-raw.md §9; notes/betting.md §5-2; notes/saga.md §6-1 |
| P2-4 | rate-limit 인메모리 (인스턴스별 독립 — 전역 한도 아님, STRICT 포함) | notes/auth-security.md S4 |
| P2-5 | CSP 화이트리스트 enforce/report-only 이중 하드코딩 (drift 방지 장치 없음) | notes/auth-security.md S7 |
| P2-6 | 권한 판정 4계열 분산 + role==='admin' 3중 정의 ("한 곳" 원칙 자기모순) | notes/auth-security.md §3; notes/admin.md §3 |
| P2-7 | 온보딩 가드: 쿠키 미서명 우회 + DB 장애 시 전원 /sign-up 리다이렉트 (장애 증폭) | notes/auth-security.md S2·S3 |
| P2-8 | 카르마 적립 사망 (posts가 flair_team_id null 하드코딩 → awardFlairKarma 영원히 false) + 스타디움 레벨 정의 이원화 | notes/metaverse-stadium.md §6-3·4 |
| P2-9 | 티커 폴백이 가짜 헤드라인 목업 노출 / 미니게임 점수 클라 신뢰 / PATCH posts 검증 공백 | notes/aggregator-ticker.md #5; notes/games.md #7; notes/community-core.md #3 |
| P2-10 | ops-monitor "커뮤 크롤 정지" 경보가 소스 전면 휴면을 몰라 영구 참 조건 (알림 둔감화) + 디스코드 웹훅 자체가 무감시 SPOF | notes/aggregator-ticker.md #2; notes/automation-map.md §5 |
| ~~P2-11~~ | ✅ **2026-08-09 수리** — 판정을 `lib/llm/openai-params.ts` 로 단일화하고 호출부 15곳 적용. 단 "gpt-5.1 재가동 시 전건 400" 부분은 **오진이었다**(실제 프로브: 200 OK). 거부하는 건 terra 한정이고 `temperature`·`top_p`·`max_tokens` 셋 다 | notes/llm-map.md §6-1·2 |
| P2-12 | 홈 SSR 피드 catch 전삼킴(빈 피드, 로그 0 — 44% 에러율 사태 패턴 재현 조건) | notes/community-core.md #6 |

### P3 — 여유 있을 때

죽은 admin2 API 2개(호출자 0), 사이드바 죽은 배지, admin 감사 로그 조회 화면 부재+insert 에러 무검사, use-feed 제목 dedupe가 유저 글도 숨김, 프로필 수동 조인 5곳 반복, 갓파일 4개(post-card-content 1,050·news-auto-publish 675+게이트15·prediction route 745·season page 1,024), 루트 산재 파일 40여 개, knip 설정 노후.

## 3. 죽은 코드 / 좀비 cron 목록

**좀비·사고 cron** (정의는 있는데 안 돎):

| 항목 | 판정 |
|---|---|
| season-chicken-draw | 🔴 등록 누락 사고 (P0-2) |
| season-weekly-snapshot / draw-snapshot | 🔴 좀비 강한 의심 — 8/9(일) 회차로 최종 판정 (P0-3) |
| news-learn-edits | 간헐 결번 (8/7 무기록) — invariant-audit 심박 감시가 이제 커버 |

**죽은 잡·고아 라우트**: update-temperatures(pg_cron 이관 후 잔존), standings/ingest(호출자인 VPS 스크래퍼 3월 정지), reddit-seed-posts(중단 — 단 CLAUDE.md·admin 크론 모니터에 잔존해 영구 "지연" 표시).

**죽은 테이블** (앱 코드 참조 0 — notes/games.md §3, notes/admin.md §4-5, notes/metaverse-stadium.md §4):
movie_quizzes·movie_quiz_results, virtual_castings 3종, commission 4종, reviews, favorites, banners, inquiries, disputes, faqs, announcements, admin_activity_logs, metaverse_fandom_memberships. 미배선(계획 산출물): content_flags, user_sanctions. 쓰기 전용(소비자 0): saga_comment_stances. 스키마만(의도적): saga_settlements.

**죽은 파일/export**: 미사용 파일 5(gold-balance 등), export 41 + 타입 76 (lib/news·lib/saga 집중), admin2 newsroom-funnel·assignment-shadow 라우트, hasVisualContent, 스캐너 구사본 `scripts/news-scanner.mjs` ❓. 전수는 notes/health-raw.md §1.

## 4. 리팩터링 로드맵 (작고 효과 큰 것부터)

| 순서 | 작업 | 난이도 | 효과 |
|---|---|---|---|
| 1 | post_votes sync 트리거 제거 + vote_count 일괄 재계산 (마이그 1개) | 하 | P0-1 종결 — 지표 정본 복구 |
| 2 | season-chicken-draw vercel.json 등록 + withCronLog (8/22 전 필수) | 하 | P0-2 종결 |
| 3 | 8/9(일) 주간 스냅샷 실측 → 좀비면 원인 추적 | 하 | P0-3 판정 |
| 4 | `/api/betman/prediction` STRICT rate-limit 추가 | 하 | P1-3 종결 |
| 5 | event_id 필터 3곳 추가 (worldcup 페이지 2 + weekly-draw 1) | 하 | P1-4 종결 |
| 6 | expire_stale_pending_predictions를 TS settle 경유로 교체(라우트에서 sweep 호출) 또는 SQL에 audit/재계산 보강 | 중 | P1-1 종결 — 정산 단일화 |
| 7 | invest 라우트 RPC화 (donate와 동일 패턴 재사용) | 중 | P1-2(b) 종결 |
| 8 | admin2 API 2개(news/bulk·saga)를 /api/admin으로 이전 + editor 진입 재설계 → admin2 진짜 폐기 가능 상태로 | 중 | P1-6 종결, 인식-코드 일치 |
| 9 | 귀속 실패 관측 배선 (Sentry/디스코드) + 원인 확정 | 하 | P1-7 — 개막 전 |
| 10 | kstDay·cluster_key·환불 재시도 헬퍼 통합 (기계적 치환) | 중 | P2-3 — 드리프트 원천 축소 |
| 11 | 사가 에코 접힘 시 tier 상향·stage 재평가 (D9 origin 규칙 결정 필요 — PRD 논의 선행) | 중상 | P1-5 — 마감기 전 권장 |
| 12 | pg_cron 6종 마이그레이션 채록 + Edge Fn 소스 회수(또는 Vercel 이관) | 중 | P2-1 — 재구축 가능성 |
| 13 | 죽은 테이블 drop 마이그 + knip 청소 (아래 "건드리지 말 것" 제외) | 하 | 인지 부하 감소 |

## 5. 지금은 건드리지 말 것

| 대상 | 이유 |
|---|---|
| 이상형 월드컵·배틀 코드/테이블 | docs/REFACTOR_PLAN.md:33 "삭제·수정 금지" 명시 — 재오픈 대비 의도적 보존 (재오픈 시 start/stats API 결손부터 복구 필요) |
| `data/crawlers/` 전체 | **"deprecated 예정" 인식이 틀렸음** — news_ticker_items의 유일한 공급로이자 agents 스크립트의 의존 대상. 끄면 티커·/transfer·사가 인제스트가 마름 |
| agg 파이프라인 (cron 2종 포함) | 소스 0개 no-op은 의도된 휴면 (aggregator.json:3 운영자 결정 명시) — 재개 대비 유지. 단 재개 전 P2-2(겹침)·발행 경로 이원화 정리 필요 |
| saga_settlements 스키마 | D15(정산 취소)와 정합한 빈 스키마 — PRD 재개 대비. 코드 0줄이라 무해 |
| 온도 TS/SQL 이원화 | 역할 분리(표시용/배치용)가 주석으로 문서화된 의도적 구조 — 통합보다 동기화 주석 유지가 저렴 |
| next.config.mjs 캐시 carve-out의 유령 경로 | 주석이 "고치지 말 것" 명시 (:134-136) — 방어적 패턴 |
| `.catch(()=>{})` 일괄 청소 | 전수 확인 결과 무단 삼킴 0건 — 전부 의도된 best-effort. 일괄 "수정"이 오히려 발행/정산 보호를 깨뜨림. 예외: 디스코드 알림 4곳만 관측 보강 가치 |
| VPS 셸 스크립트 사본 (`data/*.sh`) | 정본은 서버 — 리포 사본 수정은 드리프트만 늘림. 서버 반영과 세트로만 |
| 비밀댓글·sanitize·정산 코어 | 모범 구현으로 판정 (notes/community-core.md #10, health-raw §9) — 리팩터링 대상 아님 |

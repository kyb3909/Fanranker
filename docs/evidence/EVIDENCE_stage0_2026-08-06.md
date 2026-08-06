# EVIDENCE — 단계 0 즉시수리 6건 (2026-08-06)

- 대상: `docs/gauntlet/implementation-order.md` 단계 0 (0-1 ~ 0-6)
- 판정: **통과** — 아래 술어 전부 green

## 술어 실행 결과

| 술어 | 명령 | 결과 |
|---|---|---|
| 타입 | `pnpm exec tsc --noEmit` | 0 error |
| 린트 | `pnpm exec eslint <변경 파일 전부>` | 0 error (scripts/ 2건은 ignore 패턴 경고 — 기존 설정) |
| 단위 테스트 | `pnpm test` | **104 files / 1,229 tests passed** (변경 전 101/1,208 → 신규 3파일·21케이스 추가, 기존 회귀 0) |

## 항목별 구현 · 검증

| # | 작업 | 구현 | 검증 근거 |
|---|---|---|---|
| 0-1 | 정산 후 결과 덮어쓰기 가드 (R1) | `lib/betman/result-guard.ts` 순수 판정 + `admin/matches/result`·`betman/results` 2관문 배선. settled 픽 존재 시 결과 변경/취소 전환/상태 후퇴 차단, 동일값 재기록·스코어 표기 수정은 허용. D-5 확정 전 전면 금지 | `result-guard.test.ts` 12케이스 + `admin-matches-result.test.ts` 5케이스 (차단 시 update 미호출 검증) |
| 0-2 | 순위 재가동 (R9) | `lib/standings/naver-fetch.ts` 추출(스크립트와 공유) + `cron/standings-refresh` (매일 08:00 KST) + vercel.json 등록. **시즌 코드는 실시간 isDefault 우선, 핀 폴백** — EPL 핀 `lji9`(25-26)가 8/22 새 시즌에 낡는 문제 선제 차단 | `naver-fetch.test.ts` 4케이스 (한글 키 계약). 실데이터 검증은 배포 후 첫 실행의 cron_run_log + standings_cache.fetched_at 갱신으로 확인 예정 |
| 0-3 | 백필 스크립트 가드 (R2) | 킥오프+2.5h 미만 스코어 유추 제외 + **드라이런 기본**(`--apply` 필수). 크롤·스코어백필·정산 3단계 전부 게이트 | 드라이런 분기는 코드 경로 단순(카운트만) — tsc 로 형 검증. 실행 검증은 다음 수동 실행 시 `[dry-run]` 배너로 |
| 0-4 | withCronLog 7종 소급 (R16) | ops-monitor(감시자 자신)·draft-rooms-cleanup·sync-videos·agg-publish-queue·agg-auto-approve·season-weekly-snapshot·season-weekly-draw-snapshot — GET 만 래핑(하우스 스타일), POST 수동 트리거는 비로깅 유지 | 기존 각 라우트 테스트 회귀 0 (agg-auto-approve 등 포함 1,229 green). 배포 후 어드민 cron 모니터에 7종 등장으로 최종 확인 |
| 0-5 | env zod 편입 (R17) | `lib/env.ts` 에 OPENAI_API_KEY·NAVER_2종·GA4_3종·SAGA_CARD_ROUTING·NEWS_ASSIGNMENT_DESK·ADMIN_INSIGHT_MODEL·DISCORD_EVENT_WEBHOOK_URL (전부 optional — 미설정 시 기능별 스킵 관례 유지) + `.env.example` 누락 키 전체 추가 | tsc + 앱 기동 영향 없음 (optional 만 추가 — required 승격 없음) |
| 0-6 | pg_cron 정본화 (R18) | `docs/PG_CRON_JOBS.md` — 6잡 스케줄·command·재생성 스켈레톤 + Edge Function `betman-sync-watchdog` 소재·복원 절차 + 5층 스케줄러 지도 | 기록 문서 (2026-08-06 DB 실측 기준 — probe-infra ①) |

## 남긴 것 (의도적 미포함)

- 0-1 의 "정정 허용 경로"(명시 플래그+audit)는 **D-5 오너 결정 후** — 현재는 전면 차단이 사양.
- VPS results 경로 가드는 차단 시 해당 행만 skip (나머지 정상 처리) — VPS 재수신 전체를 죽이지 않기 위함.
- 0-2 실데이터 검증(15리그 실제 수집)은 프로덕션 배포 후 첫 cron 실행에서 — 로컬에서 네이버 호출은 하지 않음 (운영 데이터·외부 호출 무변경 원칙).

# EVIDENCE — 단계 2 슬라이스 A: 팀 사전 + 경기 매핑 shadow (2026-08-07)

- 대상: `docs/gauntlet/implementation-order.md` 단계 2 (수직 슬라이스 A)
- 판정: **통과** — 술어 green + 프로덕션 실데이터 첫 매핑 성공

## 술어

| 술어 | 결과 |
|---|---|
| `pnpm exec tsc --noEmit` | 0 error |
| `pnpm exec eslint <변경분>` | 0 error |
| `pnpm test` | **106 files / 1,250 tests** (신규 soccerway 2파일·21케이스 포함, 회귀 0) |
| 프로덕션 shadow 실행 | proposed 8 / team_unresolved 22 / fetch_error 0 / errors 0 |

## 실측으로 뒤집힌 전제 (기록 의무)

1. **"날짜 페이지 정적 발견"(D16 초기 전제) 기각** — 신 soccerway 는 전면 SPA. 이전 세션의 "빌라-뮌헨 정적 발견"은 seoFooter 인기 경기 위젯의 우연이었음. 대체 경로 = **팀 해시 2개로 `/match/{slug-hash}/{slug-hash}/` 구성 URL 정적 대조** (404=쌍 없음 / SSR meta 에 날짜·대회·홈/원정). 상세: missing-information.md I-3b 개정.
2. **구 URL 리다이렉트는 숫자 id 만 본다** — 슬러그 무시. 틀린 id 는 홈페이지가 아니라 **엉뚱한 팀**에 착지 (west-ham 추정 666→bolton, atletico 추정 2013→somalia — 드라이런이 잡음). expectedSlugs 검증 가드로 오염 차단, 불일치 5건 중 2건 폐기.
3. **경기 페이지 description 은 2템플릿** — 단일(A: 연도 포함)과 2연전 목록(B: `DD.MM. 홈 (CC) - 원정 (CC),` 반복·연도 없음·대회는 og:description). .1 파서가 B 를 몰라 UCL 예선이 전부 parse_failed → 원장의 dead_letter 8행이 그 기록. .2 에서 B 지원 + 연도 추론(킥오프 ±1년 근접) 후 통과.

## 첫 실전 매핑 (프로덕션 원장 실측)

- **페네르바흐체SK v 슈투름 그라츠** (betman UCL 예선, 8/5 18:00 UTC) → 2연전 페이지에서 **1차전 레그(05.08, Fener 홈)로 단일 확정**, betman 홈/원정과 일치(flip=false), 대회 "EUROPE: Champions League - Qualification - Semi-finals". 마켓 8행(일반/핸디캡/언더오버/SUM) 전부 동일 매핑 — URL fetch 는 런 내 메모로 1회.
- **team_unresolved 22건 = 레알 베티스·K리그2 8팀·J1 4팀** — 사전 공백의 자기 보고 (admin 후보 화면이 소비할 큐). 오탐 없음.

## 구성물

| 파일 | 역할 |
|---|---|
| `supabase/migrations/20260811_team_dictionary_match_mapping.sql` | team_dictionary + match_mapping_attempts (적용됨. RLS service-role 전용, (game,input_hash,version) 부분 유니크 멱등, 판정/실패 분리) |
| `lib/soccerway/match-page.ts` | 구성 URL 빌더 + 2템플릿 파서 (title 게이트 + description candidates + canonical 해시) |
| `lib/soccerway/match-mapping.ts` | 해석(정확 일치만)·술어(해시 집합+±1일+단일 후보, fail-closed)·shadow 러너 (`PREDICATE_VERSION=….2`) |
| `app/api/cron/match-mapping-shadow/route.ts` | 매시 :41, `MATCH_MAPPING_SHADOW=shadow` 킬스위치, withCronLog |
| `scripts/seed-team-dictionary.ts` | 41팀 시드 (--apply 완료). expectedSlugs 가드 |
| `scripts/run-match-mapping-shadow.ts` | 수동 실행기 (cron 과 동일 lib) |

## 남긴 것 (다음 슬라이스)

- **B**: admin 팀 사전 화면 — unresolved 큐 1클릭 등재 + proposed→confirmed 승격 (선수 사전 패턴 복제).
- 골든셋 G-매칭: shadow proposed 누적 후 오너 라벨 50쌍 → 게이트 통과 시에만 `betman_games.mapped_*` 실기록.
- Vercel env `MATCH_MAPPING_SHADOW=shadow` 설정 필요 (미설정 시 cron no-op — 의도된 기본).
- 국가대표(축월드컵)는 클럽 사전 범위 밖 — 현재 스캔 대상에 섞이면 team_unresolved 로 흘러감 (노이즈 수준, 사전에 국가팀 등재로 해소 가능).

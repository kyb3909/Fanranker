# Changelog

본 프로젝트의 의미 있는 변경사항. 최신순.

## [Unreleased] — 2026-05-02

### Added — 팬 정체성 시스템 (Phase A/B/C/D)
유저별 flair 활동 점수 누적 → 호칭 자동 잠금 해제 → 마이페이지 선택 → 닉네임 옆 표시 + 경기장 기부의 완전한 사이클.

- **DB 인프라** (`migrations/20260502b_fan_scores_and_titles.sql`):
  - `post_flairs.team_id` (text → `team_map_pins.team_id`), EPL 6 클럽 매핑
  - `user_flair_scores (user_id, flair_id, score_total, score_balance, last_at)` — 평생 누적 + 기부 잔액 분리 모델
  - `flair_titles (flair_id, name, threshold)` + `user_unlocked_titles`
  - `profiles.display_title_id`
  - `apply_flair_score()` 함수 + 트리거 3종 (posts / comments / post_votes) — 임계값 자동 unlock
- **호칭 시드** (`migrations/20260502d_flair_titles_seed_all.sql`): 141개 (아스날 + 축구 12 + 야구 14 + 농구 8 + 아이돌 12). 패턴: 팬덤명 2K / 레전드 선수 10K / 시그니처 50K.
- **기부 RPC** (`migrations/20260502c_flair_donate_rpc.sql`): `donate_flair_score_to_team` — 잔액 차감 + 경기장 점수 누적 + 레벨 재계산. 같은 flair team 만 가능 (리그 flair 거부).
- **API**: `/api/profile/me/titles`, `/api/profile/me/display-title`, `/api/flair/donate`, `/api/stadiums/[teamId]/leaderboard`. `/api/profile/[userId]` 응답에 `display_title` + `flair_top` 추가.
- **UI**: 마이페이지 "내 팬 정체성" 섹션 (호칭 칩 + 기부 인풋), post-card-header amber 호칭 뱃지, public profile 호칭 + flair top 5 카드, stadium-room "랭킹" Dialog.

### Added — 전 종목 flair 개편
일반 카테고리(정보/잡담/분석/뉴스/질문) → 종목별 친숙한 단위.

- 축구 18 (EPL 빅6 + EPL + 라리가 빅2 + 라리가 + 분데스 + 세리에A 빅3 + 리게앙)
- 야구 16 (KBO 10 + KBO + MLB 인기 4 + MLB)
- 농구 10 (NBA 인기 8 + NBA + KBL)
- 배구 8, 게임 11, 영화 12 (장르), 음악 10 (장르), 아이돌 13 (여자그룹), 애니 10
- 기존 flair 50여개는 `is_active=false` 비활성화 (게시글 flair_id 참조 보존)

### Added — Audit Harness (Full App Audit + CWV)
production 회귀 자동 감지 + 사이클 운영 시스템. 9 사이클 + cwv 측정 누적.

- `tests/audit/full-app-audit.spec.ts` — BFS 크롤 + 안전장치 (삭제/결제/로그아웃 차단) + UI 관찰 + 모바일 패스
- `tests/audit/cwv.spec.ts` — Core Web Vitals 측정 (LCP/FCP/CLS/TTFB, 6 페이지 × 2 viewport × 3 샘플 → 중앙값)
- `tests/audit/lib/parse-events.ts` + `compare-runs.ts` — JSONL → 구조화된 issues + diff (resolved/newly/persisting/regressed) + health.json 누적
- `playwright.audit.config.ts` — e2e 와 분리
- 명령어: `pnpm audit / audit:headless / audit:cwv / audit:diff / audit:parse`
- `tests/audit/README.md` 가이드

### Fixed — production 회귀 / a11y / 발견성
- React #418 hydration mismatch — `formatRelativeTime` SSR 호출 제거, `<RelativeTime>` 컴포넌트 (client-mount 후 변환) 도입 (`components/ui/relative-time.tsx`)
- post-card-header 모바일 분기 raw ISO 텍스트 노출 (sm:hidden 분기에 `<span>{timestamp}</span>` 그대로 남았던 회귀)
- TipTap image extension 커스터마이징 — alt 빈 string 시 "게시물 이미지" fallback (사용자 입력 alt 누락 ~100건 자동 처리)
- ImageLightbox / 트윗 라이트박스 alt="" → 의미 있는 alt
- activity-sidebar `formatRelativeTime` SSR 호출 제거 (timestamp prop 을 raw ISO 로 보존)
- `/community` 안전망 — 인덱스 페이지 `redirect("/explore")` 추가
- 모바일 메인 터치 타겟 118 → 1 (vote button hit area, 알림 배너 닫기, 댓글/community 링크 min-w-11, 이미지 캐러셀 화살표 h-11 w-11, 헤더 로고 min-h-11, news-ticker 모바일 min-h-11, shop 정렬/카테고리 칩, community 팔로우/말머리/글쓰기 버튼)
- 봇 프로필 404 → 200 stub (`_bot$`, `seed_bot`, `user_bot_*`, `user_reddit_*` 패턴 인식, recent_posts 그대로)
- 글쓰기 FAB 발견성 — 비로그인도 표시 (sign-in 모달 유도) + community 컨텍스트 prefill

### Added — Betman 미지원 베팅 유형 raw 캡처
신규 베팅 유형(전반전 등) 분석용 보존소.

- `migrations/20260502_betman_unknown_games.sql` — `betman_unknown_games` 테이블 (UNIQUE: source/gm_ts/game_no/bet_typ_id/handi_val), RLS service_role 만
- `POST /api/betman/unknown-games` — VPS 호출, cron-auth 보호, items upsert
- `scripts/vps-betman-scraper.ts` — `parseGames` 반환을 `{games, unknowns}` 로 확장, `sendResultsToApi` 도 미지원 HANDI_VAL / 매핑 실패 GAME_RESULT 캡처, 새 endpoint 로 전송
- VPS bash 스크립트 (`scripts/vps/sync.sh`, `fetch-results.sh`) 저장소 편입 + 같은 캡처 패턴 패치
- 검증: gmTs 260051 에서 "야구 승1패" (betTypId=3) 27건 캡처 확인

### Quality
- Critical 0 / Major 0 (8 사이클 누적)
- 모든 측정 가능한 페이지 CWV 🟢 (LCP/FCP/CLS/TTFB)
- 모바일 메인 터치 타겟 < 36px 99% 감소
- 페이지 navigation 0 실패 (BFS 64 페이지)
- console error / warning 0 (사이클 4부터)
- production page error 0 (8 사이클)
- 5xx 0

### Audit Harness Cycles (실행 기록)
| Cycle | Critical | Major | 모바일 터치 < 36px | 비고 |
|---|---:|---:|---:|---|
| 1 | 0 | 2 (false positive) | 118 | 첫 baseline |
| 2 | 0 | 1 (봇 프로필 404) | 100 | 봇 stub fix 직전 |
| 3 | 0 | 0 | 78 | 봇 stub deploy 후, vote/footer fix 직전 |
| 4 | 1 (#418 회귀) | 0 | 1 (info) | 모바일 fix 효과 + #418 처음 발현 |
| 5 | 1 | 0 | 1 | community/shop fix 직후 |
| 6 | 1 | 3 (audit 부하 false positive) | 1 | rate-limit 발동 |
| 7 | 0 | 0 | 1 | rate-limit 풀림, #418 self-resolved |
| 8 | 0 | 0 | 1 | #418 fix push 후 안정 |
| 9 (예정) | 0 | 0 | 1 | 4개 fix 검증 (FAB / alt / activity-sidebar / 모바일 분기) |

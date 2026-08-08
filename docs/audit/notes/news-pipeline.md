# 뉴스 파이프라인 아키텍처 감사 노트 (Phase 1)

작성: 2026-08-08 · 범위: 수집(외부) → news_reservoir → 게이트/검수 → 발행(posts) → 사후 학습·감사

## 1. 유저/데이터 플로우

| # | 단계 | 실행 주체 (스케줄) | 핵심 파일:라인 | 읽는 테이블 | 쓰는 테이블 |
|---|------|------|------|------|------|
| 1 | 수집·초안 생성 | **저장소 외부** — VPS `/opt/news-scanner` (Hermes, 15분 주기) | 코드 없음. 흔적: `app/admin/news-review/page.tsx:113` (`source->>type='hermes'` 필터), `app/api/cron/ops-monitor/route.ts:78-98` (정지 감시) | (외부 소스) | news_reservoir(`drafted`) |
| 2 | 관심도 필터 | Vercel cron 매시 :14 | `app/api/cron/news-interest-filter/route.ts:90-338` | news_reservoir | news_reservoir(decision.interest / `rejected`), news_candidate_events(RPC) |
| 3 | 만료 자동반려 | cron 매시 :00 | `app/api/cron/news-expire-drafts/route.ts:24-109` (24h, 브레이킹 48h :21-22) | news_reservoir | news_reservoir(`rejected`), news_candidate_events |
| 4 | 자동발행 | cron :07/:37 (env `NEWS_AUTO_PUBLISH=on` 필수) | `app/api/cron/news-auto-publish/route.ts:89-668` | news_reservoir, news_alias_dictionary, team_dictionary, posts, news_candidates | posts, post_flair_map, news_reservoir, news_candidates(RPC), news_alias_dictionary(검증 루프 등재) |
| 5 | 수동 검수 발행 | 운영자 — `/admin/news-review` | `app/admin/news-review/page.tsx:80-232`, `app/api/admin/news-review/route.ts:52-193` | news_reservoir, news_candidates, post_flairs, sagas | posts, news_reservoir, news_alias_dictionary(after 학습) |
| 6 | 발행 공용 초크포인트 | lib (4·5 공유) | `lib/news/publish.ts:109-335` | posts(48h 중복), post_flairs, news_alias_dictionary | posts, post_flair_map, news_reservoir(`published`+pre_edit), news_candidate_events |
| 7 | 즉시 학습 (검수 편집) | publishNewsDraft `after()` | `lib/news/publish.ts:321-332` → `lib/news/learn-corrections.ts:173-291` | posts | news_alias_dictionary |
| 8 | 야간 배치 학습 | cron 13:30 UTC (KST 22:30) | `app/api/cron/news-learn-edits/route.ts:63-162` | news_reservoir(published), posts | news_alias_dictionary, news_reservoir.audit(해시) |
| 9 | 독자 오류 제보 | cron 매시 :26 | `app/api/cron/news-comment-reports/route.ts:27-183` | comments, posts, news_error_reports | news_error_reports, (디스코드 알림) |
| 10 | 발행 후 교정 화면 | 운영자 — published-fixes | `app/api/admin/published-fixes/route.ts` (posts 수정 + `learnFromDeskEdit` 즉시 학습, :7,20) | posts, news_error_reports | posts, news_error_reports(accepted/dismissed), news_alias_dictionary |
| 11 | 사전 1클릭 등재 | 운영자 — player-dictionary | `app/api/admin/player-dictionary/route.ts` (등재 후 `requeueDraftsUnblockedByDictionary` :170,197,221) | news_reservoir, news_alias_dictionary | news_alias_dictionary, news_reservoir(낙인 해제) |
| 12 | 불변식 감사 (2층) | cron 매시 :44 | `app/api/cron/invariant-audit/route.ts:47-245` | sagas, cron_run_log, posts, news_alias_dictionary, invariant_findings | invariant_findings, (디스코드) |
| 13 | 히어로 편집장 | cron :22/:52 | `app/api/cron/hero-editor/route.ts:22-125` | posts, saga_article_links | agent_picks |
| 14 | 어사인먼트 데스크 | cron 매시 :19 — **shadow 전용** (env `NEWS_ASSIGNMENT_DESK=shadow`) | `app/api/cron/news-assignment-desk/route.ts:113-363` | news_candidates, news_reservoir, news_assignments | news_assignments (append-only) |
| 15 | 표기 소급 교정 | **수동** (vercel.json 미등록) | `app/api/cron/naming-audit/route.ts:13-23` | posts, news_alias_dictionary | posts, news_alias_dictionary, 사가 연표 |
| 16 | 브레이킹 방치 경보 | ops-monitor cron */30 | `app/api/cron/ops-monitor/route.ts:107-152` | news_candidates, news_reservoir | (디스코드) |

`data/agents/`(자체 package.json)는 문서상 Phase A 뉴스룸 파이프라인이나, 실제 초안 생산은 VPS Hermes로 이관됨(README는 r/soccer Phase A 기술, 검수 화면은 hermes 초안만 노출 — `page.tsx:113`). `data/agents/scripts/learn-from-edits.js`는 야간 학습의 VPS 안전망(`news-learn-edits/route.ts:17-21`).

## 2. 핵심 파일

| 파일 | 줄수 | 책임 |
|---|---|---|
| app/api/cron/news-auto-publish/route.ts | 675 | 자동발행 본체 — 게이트 전체 오케스트레이션 |
| lib/news/publish.ts | 360 | 발행 공용 로직 (자동/수동 공유 초크포인트) |
| lib/news/quality-gate.ts | 191 | LLM 검사관(본문/이미지) + 개인블로그·여자축구·사전 게이트 |
| lib/news/naming-verify-loop.ts | 242 | 발행 전 미등재 선수명 네이버 검증·자동 등재·별칭 흡수 |
| lib/news/learn-corrections.ts | 301 | 검수 diff → 표기 교정 추출(LLM) + 사전 upsert + 환각 가드 |
| lib/news/candidate-ledger.ts | 76 | 상태 전이 원장 기록 (RPC `record_news_candidate_events`, fail-open) |
| lib/news/dictionary-recheck.ts | 140 | 사전 등재 → 막힌 초안 낙인 해제(부활) |
| lib/news/breaking.ts | 85 | 브레이킹(오피셜) 판별 + 네이버 웹 대조 |
| lib/news/alias-suggest.ts | 120 | 자모 유사도, 미등재 이름 파싱, 기존 항목 제안 |
| lib/news/amount-evidence.ts | 63 | 원문 무근거 금액 제목 제거 (결정론) |
| lib/news/naming-normalize.ts | 82 | 발행 시 hangul_alts→preferred_ko 결정론 치환 |
| lib/news/canonical-url.ts | 20 | "같은 URL=같은 기사" 정규화 단일 소스 |
| lib/news/comment-reports.ts | 120 | 오류 제보 룰 필터 + LLM 판정 |
| lib/news/content-quality.ts | 26 | 무내용 초안 판정 (80자·필러 문구) |
| lib/news/assignment-desk.ts | 657 | shadow 배정 판정 (프롬프트 v5 히스토리 주석 ~60줄 포함) |
| lib/news/vs-issue.ts | 263 | VS 쟁점 폴 생성 (초안 단계 제안 → 발행 시 확정) |
| lib/news/suggest-flair.ts | 75 | 제목 기반 말머리 규칙 추천 (AI 없음) |
| lib/news/funnel-metrics.ts / assignment-metrics.ts | 90/201 | 원장→퍼널 집계 순수 함수 (소비처는 /api/admin2 뿐 — §6) |
| lib/naming/verify.ts | 116 | LLM 표기 후보 → 네이버 검색량 검증 파이프 |
| app/admin/news-review/fast-review.tsx | 860 | 검수 UI (클라이언트 단일 컴포넌트) |

## 3. 자동발행 게이트 전수 (news-auto-publish/route.ts, 실행 순서)

선별: 24h 이내 `drafted` 최신순 120건(:123-130) → 만료 임박(잔여 4h)군 우선 정렬(:139-153). 회당 발행 상한 2건(:62).

| 순서 | 게이트 | 조건 | 불통과 시 상태(원장) | 근거 |
|---|---|---|---|---|
| 0 | 킬스위치 | env `NEWS_AUTO_PUBLISH !== "on"` | run 전체 skip | :98-103 |
| 1 | 유효 초안 | title/content(sanitize 후) 부재 | held `invalid_draft` | :276-281 |
| 2 | 개인 블로그 | `PERSONAL_BLOG_RE` (substack/medium 등) | held `personal_blog` | :283-286, quality-gate.ts:147-148 |
| 3 | 여자 축구 | 제목+출처URL+영문 원제 `WOMENS_FOOTBALL_RE` | held `womens_football` | :291-294, quality-gate.ts:163-168 |
| 4 | 실제 이미지 | 첫 이미지 없음. **예외**: 브레이킹은 기본 이미지 부착 발행 | needs_human `no_image` | :300-319 |
| 5 | 무내용 초안 | 80자 미만·자기지시 필러 | held `content_free` | :322-325, content-quality.ts:22-26 |
| 6 | 이전 게이트 탈락 | `decision.auto_gate.pass===false` 재검사 금지. **예외**: 브레이킹+사전 미등재 사유만 재평가(회당 3) | needs_human `prior_gate_rejected` | :334-345, breaking.ts:47-50 |
| 7 | URL 중복 | canonicalSourceUrl ∈ 최근 48h 발행 | duplicate `same_source_url` + auto_gate 기록 | :350-390 |
| 8 | 제목 중복 | titleSimilarity ≥ 0.5 | duplicate `recent_title_match` | :392-433 |
| 9 | 품질 검사관 | `inspectDraft` LLM(gpt-5.6-terra), fail-closed | needs_human `quality_gate_rejected` (auto_gate 기록) | :446-457, :525-563 |
| 10 | 표기 사전 | 검사관이 뽑은 선수명 중 미등재 → 네이버 검증 루프 → 등재 실패분만 반려. 인프라 실패 시 낙인 없음 | needs_human(미등재) / retry_wait `naming_check_unavailable` | :459-496 |
| 11 | 이미지 적합성 | `inspectImage` vision. infra 실패 시 재호스팅 사본 재검사, 여전히 infra면 낙인 없음. 폴백 이미지는 검사 제외 | needs_human(부적합) / retry_wait `image_check_unavailable` | :499-524 |
| 12 | 오피셜 웹 대조 | 브레이킹만: 네이버 보도 ≥2건 필요 | needs_human `official_unverified` / retry_wait `official_check_unavailable` | :566-585, breaking.ts:64-73 |
| 13 | 금액 증거 | 브레이킹만: 원문에 없는 숫자 토큰 금액을 제목에서 제거 (차단 아님) | — (제목 수정) | :586-596, amount-evidence.ts:40-63 |
| 14 | 최후 URL 중복 | publishNewsDraft 내부 — 수동 발행 포함 전 경로 | error 반환, 원장 `duplicate:same_source_url_blocked` | publish.ts:145-173 |

발행 성공 시 사전 치환(naming-normalize)·문단 분할·이미지 재호스팅·말머리·디스코드·사가 연동·VS 폴이 publish.ts:127-317에서 수행.

## 4. LLM 호출 지점

| 모델 | 용도 | 파일:라인 | 실패 처리 |
|---|---|---|---|
| gpt-5.6-terra | 본문 품질 검사관 | lib/news/quality-gate.ts:62 | fail-closed — 호출 실패도 불통과(사람 검수). temperature 파라미터 금지(주석 :61) |
| gpt-5.6-terra (vision) | 이미지 적합성 | lib/news/quality-gate.ts:114 | fail-closed + `infra` 플래그 분리(:99-104) — 인프라 실패는 낙인 없이 재시도 |
| gpt-4o-mini | 관심도 심사 | app/api/cron/news-interest-filter/route.ts:56 | null 반환 → 유지(반려 안 함), 다음 회차 재시도 |
| gpt-4o-mini | 표기 후보 제안 | lib/naming/verify.ts:33 | 빈 후보 → "후보 생성 실패" = 인프라 사유(사람 검수) |
| gpt-4o-mini | VS 쟁점 생성 | lib/news/vs-issue.ts:55 | null — 폴 없는 기사로 발행 |
| gpt-4o-mini | shadow 배정 판정 | lib/news/assignment-desk.ts:66 | retry_wait/dead_letter 분류, 원문 raw 보존(route:299-301) |
| gpt-4o-mini | 소급 선수명 추출 | app/api/cron/naming-audit/route.ts:57 | 빈 배열 — 해당 기사 skip |
| gpt-4.1-mini | 교정 추출 (표기/사실 분리) | lib/news/learn-corrections.ts:17,198 | `ran:false` 반환 — 해시 미기록으로 야간 재시도 보장 + 환각 가드(:243) |
| gpt-4.1-mini | 오류 제보 판정 | lib/news/comment-reports.ts:15,74 | null — 아무것도 기록 안 함, 다음 회차 |
| gpt-4o | 히어로 3장 선정 | app/api/cron/hero-editor/route.ts:77 | 실패 시 기존 픽 유지(규칙 폴백 별도, :110-112) |

외부 비-LLM: 네이버 뉴스 검색 API (lib/naming/verify.ts:74-95) — 표기 검증·오피셜 대조 공용, null=인프라.

## 5. 테이블별 읽기/쓰기 주체

| 테이블 | 쓰는 곳 | 읽는 곳 |
|---|---|---|
| news_reservoir | VPS 스캐너(외부, drafted 생성), interest-filter, expire-drafts, auto-publish(auto_gate), publishNewsDraft(published+pre_edit), admin/news-review(save/reject), dictionary-recheck, news-learn-edits(audit) | 위 전부 + admin 검수 화면, assignment-desk(shadow), ops-monitor |
| news_candidates / news_candidate_events | RPC `record_news_candidate_events` 경유 — auto-publish, interest-filter, expire-drafts, publishNewsDraft, dictionary-recheck (candidate-ledger.ts:56-76, fail-open) | auto-publish(중복 판정 억제 :202-213), admin 검수 화면(:131-135), assignment-desk, ops-monitor, admin2 funnel |
| news_alias_dictionary | naming-verify-loop(자동 등재·흡수), learn-corrections(upsert 3분기 :99-165), player-dictionary(수동), naming-audit | auto-publish(사전 게이트), publishNewsDraft(치환), dictionary-recheck, invariant-audit(표기 흔들림), saga |
| news_assignments | news-assignment-desk (append-only) | 같은 cron(멱등 판정), admin2/assignment-shadow |
| news_error_reports | news-comment-reports(upsert), published-fixes(status 전이) | published-fixes 화면 |
| invariant_findings | invariant-audit (upsert/resolve) | 같은 cron, /admin/operations |
| posts | publishNewsDraft(insert), published-fixes/naming-audit(update) | auto-publish(중복 재료), news-learn-edits(diff), comment-reports, hero-editor, invariant-audit |
| post_flair_map, agent_picks, team_dictionary, cron_run_log | publish.ts:218-220 / hero-editor / (읽기 전용) / withCronLog | — / 홈 히어로 / auto-publish 오피셜 대조 / invariant-audit 심박 |

## 6. 특이사항 / 냄새

| 구분 | 내용 | 근거 |
|---|---|---|
| 죽은 코드 의심 | `hasVisualContent` export — 실호출 0곳 (auto-publish는 실이미지 검사로 대체, 주석에만 언급) | lib/news/publish.ts:351-360, 유일 참조 app/api/cron/news-auto-publish/route.ts:295(주석) |
| 죽은 코드 의심 | funnel-metrics.ts·assignment-metrics.ts 소비처가 `/api/admin2/*` 뿐 — /admin2는 2026-08-04 폐기 확정(운영 메모). API 라우트는 아직 존재 | app/api/admin2/newsroom-funnel/route.ts:7, assignment-shadow/route.ts:9 |
| 중복 로직 | 제목 유사도 함수 2종 병존 — 발행 전 게이트는 `titleSimilarity`(토큰 자카드, lib/saga/cluster.ts:66), 발행 후 감사는 `bigramTitleSimilarity`(lib/ops/title-similarity.ts). 의도적(전자의 한국어 2음절 한계 보완)이나 임계값·의미가 갈라져 있음 | lib/ops/title-similarity.ts:4, invariant-audit/route.ts:134 |
| 중복 로직 | TipTap→문단 텍스트 추출이 4벌 복제: news-learn-edits/route.ts:29, learn-corrections.ts:74, news-comment-reports/route.ts:86(excerpt), admin page.tsx:48(preview). 앞 2개는 "해시 호환" 사유 주석 있음 — 나머지는 그냥 복제 | 각 라인 |
| 에러 삼킴(의도적) | 디스코드 알림 `.catch(()=>{})` — auto-publish:252, comment-reports:169. 원장 기록 fail-open(candidate-ledger.ts:53-55, `observability:degraded`로 노출). 발행 후 reservoir 갱신 실패 시 발행 유지+CRITICAL 로그+`partially_published` 원장 | publish.ts:242-266 |
| 잠재 버그(경미) | 검증 루프 등재 후 런타임 사전 캐시에 가짜 id `runtime_${n}` push — 같은 run의 후속 기사가 이 항목을 흡수 대상으로 삼으면 `absorbAliasIntoEntry`가 `entry_not_found` 반환(인프라 실패 취급 → retry_wait). 실해는 없으나 회차 지연 유발 가능 | news-auto-publish/route.ts:476-484, naming-verify-loop.ts:190-196 |
| 거대 파일 | news-auto-publish/route.ts 675줄(게이트 15개 단일 루프), fast-review.tsx 860줄, assignment-desk.ts 657줄(버전 히스토리 주석 ~60줄) | wc 실측 |
| 비대칭 | 원장 상태명과 검수 화면 라벨 매핑이 화면에 하드코딩 — 새 reason_code 추가 시 라벨 누락은 원문 노출로 강등(안전) | admin page.tsx:31-45 |
| 스케줄 주의 | naming-audit 라우트는 vercel.json 미등록(수동 전용, 주석 명시) — invariant-audit의 cron_heartbeat 검사는 vercel.json 기준이라 오탐 없음 | naming-audit/route.ts:14, invariant-audit/route.ts:84-88 |
| 문서 드리프트 | data/agents/README.md는 "Phase A: r/soccer, 자동 발행 OFF" 기술 — 실제는 VPS Hermes 초안 + 자동발행 on(env). data/agents는 학습 안전망 스크립트 외 본선 경로에서 이탈 중 | data/agents/README.md:5-9 vs news-auto-publish 주석 :44-57 |
| ❓미확인 | VPS `/opt/news-scanner` 스캐너 코드 — 저장소 외부, 초안 생성 프롬프트·소스 목록 검증 불가 | ops-monitor/route.ts:78-98 |
| ❓미확인 | RPC `record_news_candidate_events` 본문(SQL) — 마이그레이션 파일 미열람, append 규칙·news_candidates 갱신 로직은 코드 주석 기반 추정 | candidate-ledger.ts:66 |

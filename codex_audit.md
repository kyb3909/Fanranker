# Codex Audit

참고: 이 문서는 코드/문서 기반 감사 리포트에 더해, 2026-04-25 대화에서 확인된 제품 의도를 반영해 보정한 판본이다.  
사용자 설명 기준 제품 의도는 다음과 같다.

- `예측`: 매일 다시 오게 만드는 방문 트리거
- `분석글`: 신뢰와 전문성 축적
- `커뮤니티 피드`: 가장 큰 페이지뷰와 체류를 담당하는 핵심 광장
- `가벼운 채팅`: 경기 전후 체류 시간을 늘리는 보조 레이어
- `metaverse/stadium`: 무거운 메타버스 상품이 아니라, 경량 소셜/채팅 경험에 가까운 확장 레이어

위 의도 설명은 사용자 발화 기준 반영 사항이며, 저장소만으로 100% 검증된 사실은 아니라는 점을 분리해서 읽어야 한다.

## A. 한 문단 핵심 요약

이 프로젝트는 문서상으로는 `무료 스포츠 승부예측 + 커뮤니티 + 공개 랭킹/팔로우`라는 콘셉트가 분명하고(`README.md:3`, `docs/PROJECT.md:10,27,35`), 사용자 설명 기준 전략도 일관적이다. 즉 `예측`으로 재방문을 만들고, `분석글`로 신뢰를 쌓고, `커뮤니티 피드`로 페이지뷰를 먹고, `가벼운 채팅`으로 체류를 연장하는 구조다. 이 전략 자체는 설득력이 있다. 문제는 현재 저장소에서 그 역할 분리가 밖에서 즉시 읽히지 않는다는 점이다. 홈 구조, broad한 게시판 범위, `/prediction`의 리다이렉트 구조, `metaverse/stadium/shop/games` 같은 표면 기능이 메시지를 분산시킨다. 엔지니어링 수준은 평균 이상이고 보안, 테스트, 관리자 도구, Supabase 스키마 성숙도도 좋다. 반면 `title + 내용` 검색 약속 불일치(`app/search/page.tsx:24` vs `app/api/search/route.ts:99-102`), `profiles.id`/`user_id` 혼용 버그(`supabase/migrations/20260424_metaverse_avatar_shop.sql:160-161`, `app/api/metaverse/avatar/me/route.ts:27`), env naming 불일치(`lib/env.ts:23,31` vs `.github/workflows/ci.yml:38,62`), Service Role 의존, 실결제 미완성은 출시 리스크다. 결론적으로 이 제품의 핵심은 메타버스가 아니라 `스포츠 광장 + 검증 레이어`이고, 지금 필요한 것은 방향 전환이 아니라 그 전략을 더 선명하게 보이게 만드는 정렬이다.

## B. 확인된 사실

- 서비스 정의는 명확하다. `README.md:3`, `docs/PROJECT.md:10,27,35`는 스포츠 예측, 공개 랭킹, 팔로워 획득을 핵심으로 둔다.
- 전략 문서도 초점을 못 박고 있다. `docs/COMMUNITY_STRATEGY.md:12`는 핵심 해자를 “적중률·팬심·활동이 모두 숫자로 남는 공개 기록 커뮤니티”로 정의하고, `docs/COMMUNITY_STRATEGY.md:241`는 도박 프레임 UI를 피하라고 적는다.
- 기술 스택은 현대적이다. `package.json:30,46,48,55,57,63,65,67,99` 기준 Next.js 15, React 19, Supabase, Clerk, TipTap, Sentry, Phaser, Tailwind 4를 사용한다.
- 홈과 예측의 구조는 분산돼 있다. `app/page.tsx:102`는 `?view=prediction`으로 예측 뷰를 홈에 삽입하고, `app/prediction/page.tsx:4`는 `/prediction`을 영구 리다이렉트한다.
- 홈 메인 경험은 `게시물`과 `경기 분석글` 탭 중심이다(`components/home/home-client.tsx:196,212`).
- 상단/모바일 내비게이션은 `담벼락`, `운동장`, `경기 예측` 위주이며, `components/header/header-nav.tsx:59`에 스타디움은 가오픈에서 제외한다고 명시돼 있다.
- 커뮤니티 범위는 스포츠에 한정되지 않는다. `lib/constants/communities.ts:16,34,43,52,65,74,83,92,101,110`에 `game`, `movies`, `music`, `idol`, `anime`, `free-board`가 있고, 온보딩에서도 `스포츠`와 `라이프`를 함께 노출한다(`components/sign-up/communities-step.tsx:37,67`).
- 검색 UI와 실제 검색 로직은 다르다. 화면은 `제목 + 내용`을 제공하지만(`app/search/page.tsx:24`), API는 TipTap JSONB 이슈로 제목만 검색한다(`app/api/search/route.ts:99-102`).
- 메타버스 아바타 저장 로직에는 실제 버그가 보인다. DB 함수는 `profiles.id`를 업데이트하고(`supabase/migrations/20260424_metaverse_avatar_shop.sql:160-161`), 읽기 API도 `.eq("id", me.userId)`를 사용한다(`app/api/metaverse/avatar/me/route.ts:27`). 이 코드베이스 전반의 Clerk 식별자는 `user_id` 중심이다.
- 결제/수익화는 설계와 구현이 엇갈린다. PortOne 상수와 실결제 마이그레이션은 존재하지만(`lib/portone/constants.ts:22`, `supabase/migrations/069_create_payment_orders.sql:3-8`), `app/api/payments/purchase/route.ts:20`은 아직 토큰 기반이며 실제 게이트웨이 연동이 필요하다고 적는다. `app/payments/page.tsx:43-49`도 사실상 골드 잔액/내역 화면이다.
- 관리자/운영 도구는 강하다. `app/admin/page.tsx:42-50`, `app/api/admin/content/reports/route.ts:118-165`는 KPI와 신고 처리 흐름을 실제 데이터 기반으로 구성한다.
- 테스트/운영 의식도 좋다. `.github/workflows/ci.yml:25-32,66-72`에 lint, test, Lighthouse가 있고, `e2e/`와 `__tests__/`도 넓게 깔려 있다.
- 보안 하드닝은 잘 돼 있다. `next.config.mjs:37-55`의 보안 헤더, `app/api/upload/image/route.ts:7,54,96`의 magic bytes/WebP 처리, `lib/tiptap/sanitize.ts:215-223`의 sanitize, `app/api/og/route.ts:29-31`의 SSRF 차단이 확인된다.
- SEO 기본기는 있으나 범위가 좁다. `app/sitemap.ts:58`은 static/community/post만 반환하고, `app/opengraph-image.tsx:3,37`은 여전히 `FanRanker` 브랜딩을 사용한다.
- `metaverse`는 실제로 검색 노출을 막아 둔 상태다. `app/metaverse/page.tsx:6`, `app/metaverse/uk/page.tsx:6`은 `robots: { index: false, follow: false }`를 둔다. 즉 최소한 현재 공개 핵심 랜딩은 아니다.

## C. 확인 불가 / 추가 검증 필요 항목

- 실제 운영 DAU/MAU, D1/D7 리텐션, 팔로우 전환율, 예측 참여율은 저장소만으로 확인 불가다.
- 사용자 설명 기준 `예측 = 방문 트리거`, `피드 = 최대 페이지뷰`, `채팅 = 체류 연장` 전략은 설득력 있지만, 실제 트래픽 데이터로 검증된 것은 아니다.
- 실제 프로덕션 Supabase에 모든 migration/RLS가 반영됐는지는 확인 불가다. `.gstack/qa-reports/qa-report-localhost-2026-04-24.md:40,58` 기준 로컬/QA에서는 avatar shop migration 미적용 흔적이 있다.
- 성능은 환경 차이가 크다. `.gstack/design-reports/design-audit-gongnori-fan-2026-03-30.md:56-58`는 TTFB 3300ms를 말하고, `TEST_EXECUTION_REPORT.md:143`는 TTFB 477ms를 기록한다. 추가 검증이 필요하다.
- 법무 검토, 사업자 정보, 환불/약관 운영 프로세스, 결제 컴플라이언스 상태는 코드만으로 확인 불가다.
- 실제 모더레이션 인력, 신고 SLA, 운영 정책 집행 수준은 확인 불가다.
- `라이프` 게시판이 장기 전략 확장인지, 당장의 분산 요인인지에 대한 최종 판단은 운영 데이터 없이는 어렵다.
- `metaverse/stadium`이 실제로 체류 시간에 기여하는지, 아니면 메시지 혼선을 만드는지는 추가 검증이 필요하다.

## D. 종합 점수표

| 항목 | 점수 | 근거 |
|---|---:|---|
| 제품 명확성 | 7 | 내부 전략은 설득력 있으나 외부 노출 구조가 다소 흐리다 |
| 시장 가능성 | 7 | 스포츠 팬덤/예측/커뮤니티 수요는 실재한다 |
| 차별성 | 7 | 광장 위에 검증 레이어를 얹는 구조는 차별화 여지가 있다 |
| UX | 6 | 온보딩과 기본 내비는 괜찮지만 핵심 동선의 역할 분리가 더 선명해야 한다 |
| UI 완성도 | 7 | 의도 있는 디자인이지만 위계와 일부 디테일이 아쉽다 |
| 기술 아키텍처 | 7 | 스택 선택과 보안/운영 구조는 좋지만 권한 모델이 흔들린다 |
| 코드 품질 | 7 | 테스트와 구조는 양호하나 실제 버그와 중복 정책이 있다 |
| 성능 | 6 | 코어는 관리 가능하나 metaverse 관련 번들은 무겁다 |
| SEO/그로스 준비도 | 5 | 기본 metadata는 있으나 sitemap/share/브랜딩이 약하다 |
| 출시 준비도 | 6 | 방향성은 맞지만 메시지 정렬과 몇몇 실제 버그 수정이 선행돼야 한다 |

## E. Top 10 강점

- 제품 의도가 모호하지 않다. 문서와 사용자 설명을 합치면 역할 분리가 분명하다.
- `예측 -> 분석글 -> 피드 -> 채팅` 구조는 스포츠 서비스에서 현실적인 트래픽 루프다.
- `예측 -> 랭킹 -> 팔로우`라는 검증 레이어는 단순 커뮤니티보다 강한 차별점이 될 수 있다.
- 기술 스택이 현재 기준으로 충분히 경쟁력 있다.
- 홈은 ISR과 병렬 fetch를 사용해 기본 구조를 신경 썼다(`app/page.tsx:8,20,94`).
- 온보딩이 얕지 않다. 약관, 인증, 프로필, 커뮤니티 선택이 한 흐름에 있다.
- 관리자/KPI/신고 처리 체계가 초반 서비스치고 강하다.
- Supabase 스키마와 RLS 설계 의식이 좋다.
- 업로드, sanitize, CSP, SSRF 차단 등 보안 기본기가 탄탄하다.
- 모바일 내비게이션과 반응형 고려가 실제 코드에 반영돼 있다.

## F. Top 10 약점

- 가장 큰 문제는 전략이 아니라 전략의 표현 방식이다. 지금 구조는 `스포츠 광장 + 검증 레이어`보다 `여러 기능이 섞인 서비스`처럼 보일 가능성이 있다.
- 핵심 기능인 예측이 독립 목적지라기보다 홈의 query-param 뷰로 밀려 있다.
- 검색 UI가 실제 기능보다 과장돼 있어 신뢰를 깎는다.
- `라이프` 게시판 확장은 초반 스포츠 광장 포지셔닝을 흐릴 수 있다.
- 메타버스/스타디움이 경량 채팅 레이어라면, 지금 명명과 노출 방식은 그보다 더 큰 실험처럼 읽힐 수 있다.
- 메타버스 아바타 식별자 버그는 기능 신뢰를 깨는 실제 결함이다.
- env naming이 코드, CI, 문서에서 다르게 굴러 배포 사고 위험이 크다.
- 여러 API가 Service Role로 RLS를 우회해 장기적으로 권한 안정성이 약하다.
- 수익화는 계획은 많은데 제품화된 1차 모델이 약하다.
- SEO/OG/브랜드가 일관되지 않다. `gongnori.fan`과 `FanRanker`가 섞여 있다.

## G. Top 10 고효율 개선안

- 홈과 랜딩 메시지를 `오늘 경기 보러 오는 곳 + 사람들이 계속 머무는 스포츠 광장`으로 정렬하라.
- `/prediction`을 진짜 1급 라우트로 승격하고, 홈에서는 예측을 “재방문 트리거”로 더 명확하게 보여줘라.
- 검색은 둘 중 하나만 하라. `제목 + 내용` 라벨을 지우거나, content plaintext 인덱스를 만들어 실제로 구현하라.
- MVP 범위를 `스포츠 커뮤니티 피드 + 예측 + 분석글 + 프로필/랭킹 + 가벼운 채팅`으로 선명하게 정의하라.
- `metaverse/stadium`은 제거보다 재정의가 맞다. 무거운 세계관보다 `경기 전후 체류용 경량 소셜 기능`으로 메시지를 맞춰라.
- `profiles.id` vs `profiles.user_id` 규칙을 전역 표준으로 통일하라.
- env 이름을 하나로 정하고 `lib/env.ts`, `app/layout.tsx`, `CI`, `docs`를 동시에 맞춰라.
- Service Role API는 최소화하고, 권한이 중요한 쓰기는 auth-bound RPC나 더 좁은 서버 계층으로 모아라.
- 브랜딩을 `gongnori.fan` 하나로 정리하고, sitemap에 profile/prediction/community landing을 포함시켜라.
- 수익화는 1차 `광고/스폰서`, 2차 `expert subscription`, 3차 `팬덤 cosmetic`, 4차 `실결제` 순으로 가는 편이 현실적이다.

## H. MVP 출시 체크리스트

- `[반드시]` 이번 출시의 핵심 메시지를 `스포츠 광장 + 예측 + 분석글`로 고정할 것.
- `[반드시]` `커뮤니티 피드가 최대 페이지뷰 구간`이라는 전략이 홈과 내비게이션에서 바로 읽히게 만들 것.
- `[반드시]` `title + 내용` 검색 불일치 문제를 수정하거나 라벨을 축소할 것.
- `[반드시]` 메타버스 아바타의 `id/user_id` 혼용 버그를 수정할 것.
- `[반드시]` env 변수명을 코드/CI/문서 전체에서 통일할 것.
- `[반드시]` 프로덕션 Supabase migration 적용 상태와 RLS 정책을 재검증할 것.
- `[반드시]` Service Role API에 대해 권한 회귀 테스트를 추가할 것.
- `[반드시]` `FanRanker`/`gongnori.fan` 브랜딩, OG 이미지, sitemap을 통일할 것.
- `[반드시]` 신고 처리, 차단, 콘텐츠 삭제, 법적 페이지, 관리자 운영 플로우를 실제 공개 기준으로 점검할 것.
- `[허용]` `metaverse/stadium`은 경량 체류 기능으로 남겨도 된다. 단, 메인 가치 제안보다 앞으로 나와서는 안 된다.
- `[허용]` 골드 경제는 내부 가상재 수준으로 남겨도 된다. 단, 실결제처럼 보이게 만들지 말 것.
- `[후순위]` PortOne 기반 실결제, 정기구독, billing key 자동갱신은 정식 PMF 확인 뒤로 미뤄도 된다.
- `[후순위]` 메타버스 번들 최적화는 공개 핵심 기능이 아닌 한 후순위여도 된다.

## I. 30일 개선 로드맵

- 1주차: 제품 메시지 확정, env 정리, 검색 불일치 수정, avatar 식별자 버그 정리, Service Role 위험 API 목록화.
- 2주차: 홈, `/prediction`, 피드, 분석글, 프로필의 역할 문구와 CTA를 재정렬.
- 3주차: SEO, OG, sitemap 보강, 공유 카드 개선, 팔로우/알림 재활성화 루프 강화.
- 4주차: 수익화 1차 모델 확정, 파트너/투자자용 핵심 지표 대시보드 정의, `metaverse/stadium`의 노출 수준 재결정.

## J. 내가 이 제품의 책임자라면 가장 먼저 집중할 것

첫 우선순위는 방향 전환이 아니라 `역할 정렬`이다. 이 제품은 `예측으로 다시 오고, 분석글로 신뢰를 쌓고, 피드에서 가장 오래 머무르고, 채팅으로 경기 전후 시간을 붙잡는 스포츠 광장`이어야 한다. 따라서 가장 먼저 할 일은 홈, `/prediction`, 피드, 분석글, 프로필, 알림이 이 역할 분리를 명확하게 드러내도록 정리하는 것이다. `metaverse/stadium`은 그 자체로 메인 상품처럼 보이면 안 되고, 체류 시간을 늘리는 경량 소셜 기능으로 읽혀야 한다. 즉 지금 필요한 것은 기능을 더 벌리는 것이 아니라, 이미 계산된 전략이 사용자 눈에도 같은 구조로 읽히게 만드는 일이다.

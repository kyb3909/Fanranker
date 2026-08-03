# Realist 검증 — 사가 엔진 오늘자 배포 (2026-08-03)

코드 근거: `docs/saga/SAGA_ENGINE_PRD.md`, `docs/saga/P0_AUDIT.md`, `lib/saga/*`, `app/saga/[slug]/page.tsx`,
`app/admin2/saga/page.tsx`, `app/api/admin2/saga/route.ts`, `app/api/cron/saga-*`, `lib/feed/cardnews.ts`,
`components/cardnews/card-news-feed.tsx`, `lib/analytics/events.ts`, `lib/analytics/attribution.ts`,
`app/layout.tsx`, `vercel.json`, `supabase/migrations/20260804_saga_core.sql`,
`supabase/migrations/20260805_saga_reservoir.sql`, `supabase/migrations/20260806_saga_article_links.sql`.
(Supabase MCP 실측 쿼리는 이번 세션 도구 제약상 미실행 — ③·④의 일부 수치는 "코드로 확인 가능한 것"과
"실측이 필요한 것"을 구분해 표기했다.)

---

## ① 성패 판정 지표 — 기존 인프라로 실제 잴 수 있는 것만

**결론: 지금 배포 상태로는 "사가가 도는지"를 잴 수 있는 계측이 사실상 0에 가깝다.** 코드 0줄로 바로 쓸 수
있는 SQL 지표와, GA4/DB에 신규 계측이 필요한 것을 나눠야 한다.

### 코드 0줄로 지금 당장 쓸 수 있는 것 (테이블에 이미 쌓임)
- **`saga_votes` 참여자 수/추이** — append-only 원장(`20260804_saga_core.sql:76-90`)이라 `count(distinct user_id) group by saga_id`, 일별 버킷 집계 모두 SQL 한 방. 이게 사실상 유일하게 "믿을 만한" 참여 지표다.
- **사가별 댓글 수** — 앵커 포스트(`sagas.anchor_post_id`) 경유라 기존 트리거가 `posts.comment_count`를 자동 갱신(P0_AUDIT §1 "앵커 포스트 경유 재사용" 판정). 별도 계측 코드 불필요.
- **사가 성장 속도(자동 생성 검증)** — `saga_entries` count, `sagas.last_event_at` 갱신 빈도로 "파이프라인이 실제로 도는가"는 바로 확인 가능.

### 신규 계측이 필요한 것 (지금은 비어 있음)
- **카드→사가 클릭 전환율**: `card-news-feed.tsx:360-362`의 `openPost(id)` 는 목적지가 사가든 일반글이든 같은 `cardnews_card_open_post` 이벤트만 쏜다 (`destination` 파라미터 없음). 즉 GA4에서 "사가로 간 클릭"과 "글로 간 클릭"을 지금은 구분할 수 없다.
- **사가 문서 조회수**: `app/saga/[slug]/page.tsx` 전체를 확인했지만 `trackEvent` 호출이 한 곳도 없다. `usePostViewTracker`(post_views 집계)도 호출 안 함 — 사가 페이지는 "몇 명이 봤는지"를 어디에도 남기지 않는다.
- **재방문**: `saga_votes`는 append-only라 "같은 유저가 다른 날 또 투표했나"는 원장에서 계산 가능하지만, "투표 없이 그냥 다시 읽으러 온 재방문"은 계측 자체가 없어 답할 수 없다.

### 실측 신뢰도 문제 — SPA 네비게이션은 GA4 pageview가 안 잡힐 가능성이 높다
`app/layout.tsx:270-272`의 `<GoogleAnalytics gaId=.../>` (`@next/third-parties/google`)는 초기 로드 시
1회 pageview를 쏘는 방식이고, 라우트 변경 시 재발사하는 커스텀 리스너(`usePathname` 훅 등)를 이 저장소
어디에서도 찾지 못했다. 카드뉴스 카드의 사가 링크는 `components/ui/app-link.tsx`(`next/link`, 클라이언트
전환)를 쓴다 — 즉 **홈 카드에서 클릭해서 들어간 사가 방문은 GA4 자동 pageview에 잡히지 않을 가능성이
크다.** URL에 실리는 `utm_source=cardnews&from=<postId>` 도 이 pageview가 안 잡히면 무의미하다.
→ 이건 추정이지 실측이 아니다. GA4 DebugView로 "카드 클릭 → 사가 진입"이 실제로 page_view 이벤트를
쏘는지 오늘 안에 1회 확인할 것을 권한다(코드 검토만으로는 100% 단정 불가).

### 권장 최소 지표 세트 (구현 비용 순)
1. `saga_votes` 일별 유니크 참여자 — SQL, 0줄
2. 앵커 포스트 `comment_count` 합계 — SQL, 0줄
3. `cardnews_card_open_post`에 `destination` 파라미터 추가 — 1줄 패치 (아래 ⑤-a)
4. 사가 페이지 조회 이벤트 1개 신설 — 컴포넌트 1개 (아래 ⑤-b)

---

## ② "사가 체류/재방문"이 언론사 계약 지표(기사 조회)로 카운트되는가

**판정: 아니다. 구조적으로 별개 트랙이다.**

메모(`project_media_partnership_goal`, 2026-08-02)와 `lib/analytics/events.ts:30-33` 주석이 명시하듯,
언론사가 볼 지표는 "예측 참여자 수"가 아니라 **기사 조회·체류**(`board_view`, `post_read`)다. 그런데:

1. **`post_read`는 선언만 있고 발사 지점이 없다.** `components/post-detail/post-detail-content.tsx`를 끝까지
   확인했지만 15초 체류 트래커가 없다 — `usePostViewTracker`(IP 기반 `post_views` 카운트, 별도 시스템)만
   호출된다. `board_view`도 실사용처는 `TransferPromoCard`의 `board:"transfer_promo"` 1건뿐(`card-news-feed.tsx:278`)
   — 게시판 진입 계측이 아니라 프로모 카드 클릭 라벨로 오용되고 있다. 즉 **사가 이전에 이미 "기사 조회·체류"
   계측 자체가 죽어 있었다**(메모의 `board_view` 死 진단과 정합).
2. **사가 문서는 posts 조회 경로를 아예 안 탄다.** `/saga/[slug]`는 `PostDetailContent`를 렌더하지 않으므로
   `usePostViewTracker`가 호출되지 않는다. 타임라인 안에서 "기사 펼쳐보기"(`articlesByEntry`, `page.tsx:288-327`)로
   원문 글의 본문을 펼쳐 봐도, 그건 그 글의 `view_count`를 전혀 증가시키지 않는다 — 사가 안에서 소비된 기사
   읽기는 원본 게시물의 조회 지표에 반영되지 않는다.
3. **결론적으로 사가가 체류·재방문을 아무리 잘 만들어도, 지금 파이프라인 위에서는 "기사를 몇 명이 얼마나
   읽었나"를 보여줄 숫자가 하나도 없다.** 8/2 메모의 경고("이벤트 전에 계측 살릴 것 — 소급 불가")가
   사가에도 그대로 적용된다. 사가가 콘텐츠 소비를 실제로 늘리는지와 별개로, **그걸 언론사에 보여줄 숫자가
   구조적으로 안 생긴다**는 게 지금 확인 가능한 사실이다.

---

## ③ 운영 부하 현실성 — 검수 발행이 병목인데 사가까지 얹으면?

**뉴스 자동발행은 여전히 정지 상태다.** `app/api/cron/news-auto-publish/route.ts:53-58` —
`NEWS_AUTO_PUBLISH !== "on"` 이면 스킵. env가 켜졌다는 근거는 이 세션에서 확인 못 했으므로 정지가
디폴트로 유지 중이라고 봐야 한다. 즉 **기존 뉴스 검수(운영자 1인)가 이미 유일한 발행 관문**인 상태에서,
사가 검수(`/admin2/saga`)라는 **두 번째 독립 큐**가 오늘 얹혔다.

- **파이프라인은 뉴스 검수와 분리돼 있다** — `saga-ingest`(30분마다, `news_ticker_items` 2차 소비 + RSS)와
  `saga-extract`(15분마다, LLM 추출)가 별도로 돈다(`vercel.json:67-74`). 뉴스 자동발행이 꺼져 있어도
  사가 파이프라인은 영향받지 않는다 — 설계상 좋은 분리다.
- **하지만 원재료 문턱이 뉴스보다 훨씬 낮다.** `saga-ingest/route.ts:19-20`의 `TRANSFER_HINT_RE`는
  `transfer|sign|deal|bid|offer|fee|move|...|영입|이적|임대|오피셜|결별|방출|재계약|입단|계약`처럼
  이적 관련 키워드를 사실상 전부 통과시키고, 티커의 `category in ('transfer','rumor')` 24시간치(최대 200건)
  전체를 후보로 흡수한다. 뉴스 검수(기사 한 편을 통째로 다시 써야 함)보다 **후보 발생량 자체가 구조적으로
  많을 가능성이 높다** — 특히 지금은 "연중 최대 이적 볼륨" 시기(PRD §2)라 더더욱 그렇다.
- **1건당 검수 UI 조작**(`app/admin2/saga/page.tsx:57-225`)은 선수 영문/한글/방향/단계 4필드 확인 +
  헤드라인 확인 + 발행/반려 클릭이다. 데이터가 맞으면 10~20초, 고쳐야 하면 30~60초 정도로 보인다
  (UI 구조 기준 추정 — 실측 아님).
- **"하루 몇 분 늘어나는가"에 대한 근거 있는 숫자는 지금 낼 수 없다.** `saga_reservoir`의 `status='queued'`
  일별 건수, `cron_run_log`의 `saga-extract` 실행별 `queued` 카운트를 실제로 조회해야 나온다 — 이번
  세션은 Supabase 쿼리 도구가 없어 실행하지 못했다. **오늘 안에 `cron_run_log` 또는 `saga_reservoir`를
  직접 조회해 지난 24h `queued` 건수를 확인하는 것이 ③에 대한 진짜 답을 얻는 유일한 방법**이고, 그
  숫자가 하루 10건 미만이면(2~3분/일) 무시할 수준이지만 수십 건이면(20~30분/일) 뉴스 검수 병목 위에
  또 다른 병목이 쌓이는 것이다. 지금은 이 숫자 없이 일정을 낙관/비관할 근거가 없다 — **확인 필요 항목으로
  못박는다.**

---

## ④ 9/1 정산(W4)까지 데드라인이 맞는가

- **W4 산출물 중 스키마는 이미 나와 있다** — `saga_settlements`(정산 멱등 원장), `notifications` CHECK에
  `saga_settled` 추가(`20260805_saga_reservoir.sql:41-62`)까지 배포됨. **하지만 소비 코드(정산 잡)는
  0줄**이고, `vercel.json`에 `saga-deadline`/`saga-settle` cron이 등록돼 있지 않다(`saga-ingest`,
  `saga-extract` 두 개뿐, `vercel.json:67-74`) — W4는 착수 전이다.
- **정산 로직 자체의 구현 난이도는 낮다.** P0_AUDIT §5가 이미 `lib/betman/settle.ts`(CAS 선점 + 3회
  재시도 + `settlement_audit_log`)를 "패턴 복제" 대상으로 지목했고, `saga_settlements.awarded_at`이
  `null`이면 일일 100점 상한 이월이라는 규칙까지 스키마에 명시돼 있다(P0_AUDIT §6-5). 선례가 있는 복제
  작업이라 1주 안에 구현 가능한 규모로 보인다 — **여기가 데드라인의 진짜 리스크는 아니다.**
- **진짜 리스크는 "정산할 사가가 얼마나 쌓이는가"다.** 이건 코드 문제가 아니라 ③의 검수 처리량 문제로
  귀결된다 — 검수가 밀려서 `queued` 상태로 쌓이기만 하고 발행이 안 되면, 8/31에 정산할 사가 자체가
  적어져서 "대량 정산" 이벤트의 임팩트가 약해진다. 즉 **④의 리스크는 실질적으로 ③에 종속된다.**
- **PRD 스스로 이미 안전판을 마련해뒀다.** `SAGA_ENGINE_PRD.md:316`(리스크 레지스터) — "A1+A2+메인
  투표+댓글이 MVP 코어", 장식 요소(여론 그래프, 소환 v0 폴리시 등)는 컷 가능. P0_AUDIT §7도 "W4 이후
  컷: 댓글 스탠스 뱃지 렌더, A4 이적센터 홈(기존 /transfer가 당분간 대행)"으로 명시 — **설계 단계에서
  이미 못 맞출 가능성을 인지하고 우선순위를 매겨뒀다는 점은 합리적이다.** 다만 클러스터링 품질 게이트
  (§6 "100건 배치 테스트 통과 전 자동 발행 금지")를 밀어붙이지 않는 것이 원칙이므로, 검수 볼륨이
  예상보다 크면 W3(검수·발행)가 늦어지고, 그 지연은 그대로 W4로 전가된다.

**결론: 코드 관점의 일정은 타이트하지만 불가능하지 않다. 진짜 관건은 검수 인력(1인) 처리량이며, 이건
③의 실측 없이는 답할 수 없다.**

---

## ⑤ 지금 가장 싸게 고칠 수 있는 구멍 3개

**a. `cardnews_card_open_post`에 목적지 구분 파라미터 추가 (반나절 이내)**
`card-news-feed.tsx:360-362`의 `openPost(id)`는 사가행/게시물행을 구분하지 않는다. 카드 데이터
(`CardNewsItem.sagaSlug`)는 이미 있으므로 호출부 한 곳에서 `destination: card.sagaSlug ? "saga" : "post"`
파라미터 하나만 추가하면 카드→사가 전환율을 GA4에서 즉시 분리해 볼 수 있다. 지금은 이 구분이 없어서
①의 핵심 질문("떡밥 카드가 사가로 사람을 얼마나 보내는가")에 답할 방법 자체가 없다.

**b. 사가 문서 조회 계측 신설 (컴포넌트 1개, 반나절)**
`app/saga/[slug]/page.tsx`는 `trackEvent` 호출이 0건이다. 클라이언트 컴포넌트 하나로 mount 시
`saga_view` 류 이벤트 하나만 쏴도 "사가가 몇 번 열렸는지"는 최소한 GA4에 남는다. 지금 이대로면
사가가 성공해도 실패해도 그 결과를 증명할 숫자가 없다 — 이게 가장 저렴하고 가장 시급한 구멍이다.

**c. `saga_votes` 기반 재방문 지표를 admin2에 SQL 카드 하나로 선반영 (반나절, 코드 배포 불필요)**
append-only 원장이라 "같은 유저가 다른 날 같은 사가에 다시 투표했는가"는 지금 당장 쿼리로 뽑을 수
있다. `/admin2` 퍼널 카드 옆에 이 수치 하나만 추가하면, 9/1 정산을 기다리지 않고도 "사가가 재방문을
만드는 장치로 작동하는가"를 W2~W3 사이에 선행 검증할 수 있다. 정산 로직(④)에 투자하기 전에 이 신호부터
확인하는 것이 ROI가 높다 — 재방문이 안 만들어지고 있다면 W4 스코프를 더 과감히 컷할 근거가 된다.

(참고: `NEWS_AUTO_PUBLISH=off` 자체는 사가 전용 이슈가 아니라 기존 뉴스 파이프라인 이슈라 이번 3개
목록에서는 제외했다 — 단 ③의 실측 없이는 검수 총 부하 판단이 안 된다는 점은 유효하다.)

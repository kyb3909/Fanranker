# 디자인 일관성 감사 — 매치 · 실록 · 사가 vs 홈 (2026-08-18)

범위: `app/match/[gameId]/*`, `app/matches/page.tsx`, `app/saga/page.tsx`, `app/saga/[slug]/page.tsx`, `app/saga/[slug]/season-wiki.tsx` 를 홈(`app/page.tsx` → `components/home/home-client.tsx`)과 대조.
방법: 읽기 전용. 아래 값은 전부 소스에서 확인한 것이며, 추정한 부분은 명시했다.

---

## 0. 먼저 — 제기된 가설 하나를 기각한다

> "매치 페이지가 `worldcup-scope` 안이라 `--wc-*` 만 보이고 `--gn-*` 다크 밴드 문법을 못 쓴다"

**코드상 사실이 아니다.** 세 가지 근거:

1. `.worldcup-scope` 는 페이지가 여는 스코프가 아니라 **전 사이트 래퍼**다.
   `components/app-shell-client.tsx:45` — `<div className="worldcup-scope min-h-screen">` 가 헤더·본문·푸터를 통째로 감싼다. 주석(:40-42)에도 "글로벌 wrapper … 각 페이지가 자체 worldcup-scope wrapper 추가해도 nested cascade 라 안전"이라고 적혀 있다.
   즉 **홈도 `worldcup-scope` 안이다** (`components/home/home-client.tsx:161`). 매치·사가 페이지가 여는 wrapper(`app/match/[gameId]/page.tsx:75`, `app/saga/[slug]/page.tsx:161`, `app/saga/[slug]/season-wiki.tsx:105`, `app/matches/page.tsx:114`)는 전부 중복 래핑이다.

2. `--gn-*` 는 `:root` 전역이다. `app/a-tokens.css:13-28` — `.worldcup-scope` 가 아니라 `:root` 에 선언.

3. `.gn-band` · `.gn-dcard` · `.gn-thumb` · `.gn-num` 유틸은 `@layer components` 안의 **스코프 없는 클래스**다 (`app/a-tokens.css:33-174`). 어느 페이지에서든 `className="gn-band"` 만 붙이면 동작한다. 실제로 `app/cog-event/page.tsx:215`, `app/season/page.tsx:321`, `components/site-footer.tsx:24` 가 그렇게 쓰고 있다.

**따라서 원인은 토큰 접근성이 아니라 "쓸 수 있는데 안 쓴 것"이다.** 취향 문제가 아니라 구조적 문제인 건 맞지만, 구조는 CSS 스코프가 아니라 **컴포넌트 재사용 규율**에 있다.

---

## 1. 대조표

배경 · 카드 · 테두리 · 라운드 · 그림자 · 본문/제목 크기 · max-width · 섹션 간격.
🔴 = 홈과 다름, 🟡 = 부분 일치.

### 1-1. 페이지 골격

| 항목 | 홈 (`/`) | 매치 상세 (`/match/[gameId]`) | 경기 일정 (`/matches`) | 실록 (season-wiki) | 사가 상세 (`/saga/[slug]`) | 사가 인덱스 (`/saga`) |
|---|---|---|---|---|---|---|
| **상단 다크 밴드** | ✅ `MatchdayBand`(`.gn-band`) 또는 `PageBand` — `home-client.tsx:176/192/194` | 🔴 **없음** | ✅ `PageBand` — `matches/page.tsx:115` | 🔴 **없음** | 🔴 **없음** | ✅ `PageBand` — `saga/page.tsx:63` |
| 밴드 높이 | 히어로 ≈500~530px / PageBand `pt-8 pb-8` ≈130px | — | ≈130px | — | — | ≈130px |
| **밴드 뒤 잔광** (`.gn-band + *`, `a-tokens.css:85-88` — 첫 132px 에 `rgba(150,30,55,.06)` 그라디언트) | ✅ 받음 | 🔴 **못 받음** (앞에 밴드가 없음) | ✅ 받음 | 🔴 못 받음 | 🔴 못 받음 | ✅ 받음 |
| **페이지 배경** | `#ffffff` — `globals.css:29` + `.worldcup-scope{background:var(--wc-paper)}` `wc-tokens.css:19,61` | `#ffffff` (상속) | `#ffffff` (상속) | 🟡 `var(--wc-paper)` 명시 지정 `season-wiki.tsx:105` (= 같은 흰색, 중복 선언) | 🟡 동일 `saga/[slug]/page.tsx:161` | 🟡 동일 `saga/page.tsx:62` |
| **max-width** | `sm:600px` / `lg:1280px` — `home-client.tsx:207` | 🔴 **720px** — `match/[gameId]/page.tsx:76` | 🔴 **760px** — `matches/page.tsx:122` | 🔴 **760px** — `season-wiki.tsx:106` | 🔴 **760px** — `saga/[slug]/page.tsx:162` | 🔴 **860px** — `saga/page.tsx:69` |
| **그리드** | `grid-cols-12 gap-5 lg:gap-6`, 3 / 6 / 3 (좌 커뮤니티 · 본문 · 우 활동) — `home-client.tsx:211-351` | 🔴 단일 컬럼, 사이드바 0 | 🔴 단일 컬럼 | 🔴 단일 컬럼 | 🔴 단일 컬럼 | 🔴 단일 컬럼 |
| **본문 패딩** | `px-4 py-5 sm:px-6 sm:py-6` | `px-4 py-6 sm:px-6` | `px-4 py-6 sm:px-6` | 🔴 `px-4 pt-6 pb-16 sm:px-6` | 🔴 `px-4 pt-6 pb-16 sm:px-6` | 🔴 `px-4 pt-6 pb-16 sm:px-6` |

> 밴드는 항상 풀블리드이고 **내부에서만** `mx-auto max-w-[1280px] px-4 sm:px-6` 로 정렬된다 (`page-band.tsx:47`, `matchday-band.tsx:202`). 즉 `/matches` 는 밴드는 1280 폭 정렬인데 본문은 760 폭이라 밴드 제목과 본문 좌측선이 어긋난다 — 헤더(`header.tsx`, 1280 폭)와도 어긋난다.

### 1-2. 카드 문법

| 항목 | 홈 — 떡밥 카드 (기본 탭) | 홈 — 게시판 카드 | 매치 계열 카드 | 실록 연대기 카드 | 사가 카드 |
|---|---|---|---|---|---|
| 출처 | `cardnews/card-news-feed.tsx:545-551` | `components/post-card.tsx:90-108` | `match-header.tsx:45-46`, `match-info-section.tsx:11-12`, `match-stats-section.tsx:31-32,79-80`, `match-extras-section.tsx:33-34,94-95`, `match/[gameId]/page.tsx:108-109`, `matches/page.tsx:230-232` | `season-wiki.tsx:213-218` | `saga/[slug]/page.tsx:176-177,332-337`, `saga/page.tsx:84-85,116-117`, `season-wiki.tsx:45-48` |
| 라운드 | `rounded-xl` = **12px** | `rounded-xl` = **12px** | `rounded-xl` = **12px** | `rounded-xl` = 12px (헤더/스쿼드는 🔴 `rounded-2xl` = **16px**, `season-wiki.tsx:108,251`) | 🔴 `rounded-2xl` **16px**(헤더) + `rounded-xl` 12px(엔트리) |
| 배경 | `var(--wc-card)` = `#fff` | `var(--wc-card)` | `var(--wc-card)` | 🔴 `${이벤트색}0a` = 이벤트 색 4% 틴트 | `var(--wc-card, #fff)` |
| 테두리 | 없음 (그림자 링이 대신) | `1px solid var(--wc-line)` (#e8e5e0) | `1px solid var(--wc-line)` | 🔴 `1px solid ${이벤트색}55` = 이벤트 색 33% | 없음 (그림자 링이 대신) |
| 그림자 | `var(--wc-shadow-1)` = `0 1px 3px rgba(20,20,40,.06), 0 0 0 1px #e8e5e0` (`wc-tokens.css:47`) | `0 1px 2px rgba(24,18,21,.05)` + `.gn-card-lift` hover `0 6px 20px rgba(24,18,21,.09)` (`globals.css:163-168`) | 🔴 **없음** | 🔴 **없음** (안쪽 article 만 shadow-1) | `var(--wc-shadow-1)` |
| hover | `hover:opacity-90` 류 | `.gn-card-lift` (그림자 리프트) | 🔴 없음 / `hover:bg-[var(--wc-soft)]`(행) | 🔴 `hover:shadow-md` (Tailwind 기본, 팔레트 밖) | 🔴 `hover:shadow-md` |
| 패딩 | `px-4 py-3` = 16/12 | `18px 20px` (`post-card.tsx:108`) | `px-4 py-3.5` = 16/14, 헤더만 `px-5 py-5` | `px-3 pt-2` + 내부 카드 `px-4 py-3` (🔴 카드 안 카드 2중) | `px-5 py-6 sm:px-7`(헤더) / `px-4 py-3.5`(엔트리) |

**핵심**: 사이트에 카드 레시피가 **셋** 있다.
- **A) shadow-1 파** — 그림자 + 1px 링. 홈 떡밥 카드, 사이드바(`community-sidebar.tsx:383-386`, `activity-sidebar.tsx:120-123`, `poll-widget.tsx:53-54`), 사가 전 페이지.
- **B) border 파** — 진짜 1px 테두리 + 미세 그림자. 홈 게시판 카드(post-card).
- **C) border only 파** — 1px 테두리, 그림자 0. **매치 계열 전부.**
- 그리고 실록이 **D) 이벤트 색 반투명 테두리 + 4% 틴트 배경** 이라는 네 번째를 새로 만들었다(`season-wiki.tsx:216-217`).

C는 "면이 지면에 붙어 있다", A는 "면이 살짝 떠 있다"로 읽힌다. 같은 사이트에서 이 둘이 페이지 단위로 갈리면 "다른 제품"으로 읽힌다.

### 1-3. 타이포

| 항목 | 홈 | 매치 상세 | 경기 일정 | 실록 | 사가 상세 |
|---|---|---|---|---|---|
| 페이지 제목 | 30px / **sm:42px**, `--font-display-ko`(어그로체 Bold) + `--font-title`(SUIT), w700, ls −0.035~−0.04em, 색 `--gn-cream` — `page-band.tsx:54-61`, `matchday-band.tsx:212-219` | 🔴 페이지 제목 자체가 없음 (팀명 헤더가 대신: 17px / sm:20px, `font-extrabold`=800, **폰트 지정 없음 → Pretendard 본문체**) `match-header.tsx:69-70` | 🟡 밴드 제목은 홈과 동일. 본문 날짜 표제 22px + `--font-display-ko` 사용 — `matches/page.tsx:177-184` (세 페이지 중 **유일**하게 디스플레이 폰트를 본문에 씀) | 🔴 h1 24px / sm:28px, `font-extrabold`, **폰트 지정 없음** — `season-wiki.tsx:115-118` | 🔴 h1 24px / sm:28px, `font-extrabold`, 폰트 지정 없음 — `saga/[slug]/page.tsx:179-182` |
| 카드/기사 제목 | 떡밥 14.5px w650 lh1.38 ls−0.01em (`card-news-feed.tsx:566-576`) · 게시판 17.5px/sm:18px **`font-title`(SUIT)** w700 lh1.45 ls−0.02em (`post-card-content.tsx:172-184`) | 🔴 섹션 제목 **13px** `font-extrabold` (`match-info-section.tsx:14`, `match-stats-section.tsx:34,82`) | 🔴 리그 헤더 12px `font-extrabold` (`matches/page.tsx:211-214`) | 🔴 섹션 h2 **15px** `font-extrabold` (`season-wiki.tsx:152,253`) | 🔴 섹션 h2 16px `font-extrabold` (`saga/[slug]/page.tsx:297`) |
| 본문 | 14px, `--wc-mute`, lh 1.62 (`post-card-content.tsx:190-191`) | 12.5~13.5px | 13.5~14px | 13~13.5px | 13~14.5px |
| 숫자 | `.gn-num`(Barlow Condensed + tnum) — 밴드 카운트다운 34px, 시각 20px | ✅ `.gn-num` 사용 (스코어 28/sm:34px) | ✅ 사용 | 🟡 일부만 (`season-wiki.tsx:255,273,281`), 경기 스코어는 `tabular-nums` 로 따로 씀 (`season-wiki.tsx:343`) | 🔴 미사용 |

**핵심**: 홈은 **디스플레이(어그로체) → SUIT → Pretendard** 3단 타이포 시스템인데, 매치·실록·사가는 **Pretendard 800 하나**로 위계를 만든다. 본문체를 굵게 한 것이라 "제목"이 아니라 "굵은 본문"으로 읽히고, 크기도 13~16px 대역에 몰려 있어 위계가 평평하다. 홈의 제목 대역(42 / 31 / 18)과 비교하면 **같은 사이트의 다른 화면이 아니라 관리자 화면 톤**이다.

### 1-4. 섹션 간격 · 색

| 항목 | 홈 | 매치 | 일정 | 실록 | 사가 |
|---|---|---|---|---|---|
| 본문 블록 간격 | `space-y-4` (16px) — `home-client.tsx:218` | `mt-4` (16px) 반복 | `space-y-6` (24px) 리그 섹션 · 카드 간 `mt-4` | `mt-6` / `mt-8` 혼용 (`season-wiki.tsx:151,250,305`) | `mt-4` / `mt-8` 혼용 |
| 리스트 아이템 간격 | 떡밥 `gap-3`(12px, `card-news-feed.tsx:705`) · 게시판 `space-y-2.5`(10px, `home-client.tsx:335`) | 없음(섹션 단위) | 행 사이 `borderTop 1px --wc-line`, 간격 0 | `gap-3` (12px, `season-wiki.tsx:174`) ✅ 홈 떡밥과 일치 | `gap-3` (12px, `saga/[slug]/page.tsx:310`) ✅ |
| 팔레트 밖 하드코딩 색 | 카테고리 칩 7종만 (`post-card-content.tsx:40-49`) | `#c2352f`(레드카드), `#2f7d5b`/`#c2352f`(승패) — `match-stats-section.tsx:53`, `match-info-section.tsx:49-50` | 없음 ✅ | 🔴 `#3B5BA5`, `#6B5B8A`, `#0E7A3C`, `#946A12` — `season-wiki.tsx:51-66` | 🔴 `#0E7A3C`, `#946A12`, `#D4D4D8` — `saga/[slug]/page.tsx:125-127,222` |

---

## 2. 불일치의 근본 원인 Top 3

### 원인 1 — 페이지 정체성 선언(`.gn-band`)이 세 페이지에 아예 없다

사이트의 "여기가 어느 페이지인가"는 **헤더 바로 아래 풀블리드 다크 밴드**가 선언한다. 이 문법을 쓰는 페이지가 11곳이다:

`components/home/home-client.tsx:176/192/194`, `app/matches/page.tsx:115`, `app/saga/page.tsx:63`, `app/explore/explore-content.tsx:157`, `app/search/page.tsx:212`, `app/community/[slug]/page.tsx`, `components/prediction/prediction-client.tsx:46`, `app/my-predictions/page.tsx:14`, `app/nba/page.tsx:103`, `app/gallery/page.tsx:33`, `app/season/results/page.tsx:82,247`.

안 쓰는 곳이 정확히 **개편 대상 3곳**이다: `app/match/[gameId]/page.tsx:75-76`, `app/saga/[slug]/page.tsx:161-162`, `app/saga/[slug]/season-wiki.tsx:105-106` — 세 곳 모두 `<div worldcup-scope>` 다음 줄이 곧장 `<main>` 이다.

여파가 배경 대비 하나로 끝나지 않는다:
- 헤더가 흰색 + 1px 하단선(`components/header/header.tsx:29-30`)이므로, 밴드가 없으면 **흰 헤더 → 흰 본문**이 이어져 페이지가 "시작"하지 않는다.
- `a-tokens.css:85-88` 의 `.gn-band + *` 규칙이 밴드 **직후 형제**에게만 상단 132px 웜 잔광을 깐다. 밴드가 없으면 이 규칙도 안 걸려 지면 첫 화면의 색온도가 다른 페이지와 다르다. 이건 JSX 수정 0으로 걸리게 설계된 규칙이라(주석 :83-84), 밴드를 넣는 순간 자동으로 따라온다.
- 밴드의 42px 디스플레이 제목이 없으니 타이포 최상단 대역(원인 3)이 통째로 비고, 그 자리를 24~28px `font-extrabold` 가 대신한다.

`/matches` 는 밴드가 있어서 세 페이지 중 홈과 가장 가깝다 — 같은 개편 대상 안에서도 이 차이가 관측된다는 게 원인이 밴드에 있다는 증거다.

### 원인 2 — 카드 레시피가 페이지별로 갈라졌다 (border-only vs shadow-1, 그리고 실록의 5번째 문법)

매치 계열 6곳이 전부 `background: var(--wc-card)` + `border: 1px solid var(--wc-line)` + **그림자 없음** 이다:
`match-header.tsx:45-46` / `match/[gameId]/page.tsx:108-109` / `match-info-section.tsx:11-12` / `match-stats-section.tsx:31-32, 79-80` / `match-extras-section.tsx:33-34, 94-95` / `matches/page.tsx:230-232`.

반면 홈 기본 탭 카드와 좌우 사이드바는 `boxShadow: var(--wc-shadow-1)` 이다 (`card-news-feed.tsx:547`, `community-sidebar.tsx:386`, `activity-sidebar.tsx:123`, `poll-widget.tsx:54`). `--wc-shadow-1` 은 `0 1px 3px rgba(20,20,40,.06), 0 0 0 1px var(--wc-line)` (`wc-tokens.css:47`) — **1px 링을 이미 포함**한다. 즉 매치의 `border`와 홈의 `shadow-1`은 "링"까지는 같고 매치만 그림자 6% 를 빼먹은 형태다. 그래서 나란히 놓으면 매치 카드만 지면에 눌러 붙어 보인다.

실록은 여기서 한 발 더 나간다. `season-wiki.tsx:213-218`:

```tsx
border: `1px solid ${EVENT_COLOR(ev)}55`,
background: `${EVENT_COLOR(ev)}0a`,
```

사료 종류별로 테두리·배경이 **파랑/퍼플/초록/노랑**으로 물든다(`season-wiki.tsx:50-66`). 사이트 어디에도 없는 문법이고, `--wc-*` 팔레트 밖 hex 4종이다. 게다가 그 안에 `style={card}`(= `--wc-shadow-1`)를 쓴 `<article>` 이 또 들어간다(`season-wiki.tsx:327,367,414,432`) → **카드 안 카드**. 홈에는 중첩 카드가 없다.

라운드도 갈린다: 홈은 카드 전부 `rounded-xl`(12px, `--radius-xl = calc(0.5rem + 4px)`, `globals.css:121`). 사가·실록 헤더만 `rounded-2xl` — `--radius-2xl` 은 프로젝트에서 재정의하지 않아 **Tailwind 기본 1rem = 16px** 로 떨어진다. 즉 디자인 시스템이 정한 4·8·12·16 스텝(`globals.css:118` 주석) 중 최상단 값을 이 두 페이지만 쓰고 있다.

### 원인 3 — 디스플레이 폰트 계층이 통째로 빠졌다

`app/layout.tsx:77-83` 이 어그로체 Bold 를 `--font-display-ko` 로, `:54-60` 이 SUIT 를 `--font-title` 로 실어 놓았고, 홈은 이 둘을 이렇게 쓴다:

- 밴드 제목 42px → `var(--font-display-ko), var(--font-title)` w700 (`page-band.tsx:56-58`, `matchday-band.tsx:214-218`, `section-header.tsx:64-66`)
- 톱스토리 헤드라인 31px → `className="font-title"` (`matchday-band.tsx:372`)
- 게시판 카드 제목 18px → `className="font-title"` (`post-card-content.tsx:174`)

개편 대상 5개 파일에서 `font-title` / `--font-display-ko` 사용은 **`matches/page.tsx:180` 단 한 곳**이다. 나머지는 전부 `font-extrabold`(Pretendard 800) — `app/saga/[slug]/page.tsx` 17회, `season-wiki.tsx` 13회, `match-*` 합계 20여 회.

폰트 골격이 본문과 같으면 크기·굵기만으로 위계를 만들어야 하는데, 이 페이지들의 제목 대역이 12 / 13 / 15 / 16.5 / 22 / 24~28px 로 촘촘하게 겹쳐 있어 위계가 시각적으로 서지 않는다. 홈의 42 / 31 / 18 / 14.5 와 대비하면 "같은 브랜드의 다른 페이지"가 아니라 "브랜드가 안 걸린 페이지"로 읽힌다.

---

## 3. 재사용 가능한 자산 (새로 만들 필요 없음)

### 3-1. 컴포넌트

| 자산 | 위치 | 쓰는 법 | 비고 |
|---|---|---|---|
| `PageBand` | `components/page-band.tsx:36` | `<PageBand kicker="Match" title="경기" description="…" aside={…} as="h1"/>` — **그리드 바깥, `<main>` 위 최상단**에 둘 것 (주석 :22-27) | `children` 을 넘기면 `gn-band-open` 으로 클리핑이 풀려 카드가 밴드 아래로 걸쳐 나간다(`page-band.tsx:46`) |
| `PageBandStat` | `components/page-band.tsx:92` | `aside={<PageBandStat value={n} label="MATCHES"/>}` | `/matches:119` 가 이미 사용 중 — 매치 상세는 "FT / KO 시각" 슬롯으로 쓸 수 있다 |
| `SectionHeader` | `components/section-header.tsx:36` | 본문 칼럼 **안**에 넣는 라운드 다크 블록 | ⚠️ 현재 소비자는 아카이브된 `/worldcup` 4곳뿐. `workspace/design-consistency-0730.md:207` 이 "PageBand 독트린과 충돌" 로 지적 — **신규 사용 권하지 않음** |
| `PostCard` | `components/post-card.tsx:48` | `<PostCard post={…} variant="card"|"row"/>` | 실록 연대기의 "기사" 사료(`season-wiki.tsx:411-427`)가 자체 카드 대신 쓸 수 있는 후보 |

### 3-2. CSS 클래스 — 스코프 무관, 어디서나 동작

`app/a-tokens.css`(전부 `:root` / 스코프 없는 `@layer components`):

| 클래스 | 위치 | 값 |
|---|---|---|
| `.gn-band` | `a-tokens.css:45-59` | 나이트 배경 + 버건디 래디얼 3겹 + 그레인. `color: --gn-cream` 자동 |
| `.gn-band-open` | `a-tokens.css:104` | `overflow: visible` — 카드가 밴드 밖으로 걸칠 때 |
| `.gn-dcard` | `a-tokens.css:109-113` | 다크 카드: `--gn-night-soft` + `1px --gn-night-line` + r16. `matchday-band.tsx:509` 가 사용 |
| `.gn-dtile` | `a-tokens.css:114-118` | 다크 타일: `--gn-night-tile` + r12 — **현재 소비자 0, 스탯 타일에 바로 쓸 수 있다** |
| `.gn-thumb` / `.gn-thumb-hero` | `a-tokens.css:121-147` | 썸네일 일괄 그레이드(채도 .82 · 하단 그라디언트). 홈 히어로와 피드 이미지가 같은 사진 톤이 되는 이유 |
| `.gn-num` | `a-tokens.css:38-42` | Barlow Condensed + tnum. **숫자만 감쌀 것** (한글 섞으면 폴백, 주석 :35-37) |
| `.gn-live-dot` | `a-tokens.css:150-156` | LIVE 라임 도트 |
| `.gn-card-lift` | `globals.css:163-168` | hover 그림자 리프트 — 매치·사가 카드의 `hover:shadow-md`(Tailwind 기본) 를 이걸로 교체하면 홈과 동일 |
| `.gn-pin-title` | `globals.css:156-160` | 카드 제목 링크 색 고정(visited 포함) |

`app/worldcup/wc-tokens.css` 중 **`.worldcup-scope` prefix 가 없는 것**(= 전역):

| 클래스 | 위치 | 값 |
|---|---|---|
| `.wc-underline-tabs` (+`.scroll`) | `wc-tokens.css:155-213` | 사이트 공통 언더라인 탭. 활성 표시는 `.on` / `.active` / `[aria-selected="true"]` 셋 다 지원 → **`match-tabs.tsx:47-72` 의 손수 만든 탭을 그대로 대체 가능** (현재 클래스명만 바꾸면 됨). 사용 예: `components/betting/betting-header.tsx:158,199`, `app/explore/explore-content.tsx:278`, `components/profile/public-profile.tsx:216` |
| `.wc-chip-tabs` (+`.sub`) | `wc-tokens.css:1786-1840` | 필터 칩(높이 32px pill). **`matches/page.tsx:139-162` 의 날짜 칩(rounded-lg 8px 자작)을 대체 가능**. 사용 예: `components/betting/betting-header.tsx:52,71` |
| `.wc-skeleton` | `wc-tokens.css:222-226` | 로딩 스켈레톤 (paper 톤) |
| `.wc-hdr-link` / `.wc-hdr-pulse` | `wc-tokens.css:240-276` | 헤더 전용 |

`.worldcup-scope` prefix 가 붙은 것 — **AppShell 이 전역 스코프를 열어 두므로 실제로는 어디서나 동작한다**:

| 클래스 | 위치 | 값 |
|---|---|---|
| `.wc-panel` | `wc-tokens.css:73-85` | 흰 패널: r22 + `1px #f2efea` + `0 4px 20px rgba(30,30,50,.05)` + padding 48px (모바일 28/22, r18) |
| `.wc-page-head` | `wc-tokens.css:88-94` | 라이트 페이지 헤더 블록: r16 + padding 26/24 + `0 2px 8px` |
| `.wc-sec-head` / `.wc-sec-eb` / `.wc-sec-h2` / `.wc-sec-sub` | `wc-tokens.css:713-735` | 라이트 섹션 헤더 세트 (키커 11px/0.18em/버건디 + 제목 26px/800 + 설명 14px) — **실록·사가의 `font-extrabold` 섹션 제목을 대체할 기성품** |

### 3-3. 토큰

- `--wc-shadow-1 / -2 / -3` — `wc-tokens.css:47-49`. 카드 레벨 1/2/3.
- `--wc-card / --wc-line / --wc-line-2 / --wc-ink / --wc-ink-2 / --wc-mute / --wc-mute-2 / --wc-soft / --wc-tint / --wc-wine-tint / --wc-burgundy / --wc-burgundy-deep` — `wc-tokens.css:16-29`.
- 시맨틱 색 — `--wc-go`(#2f7d5b 성공), `--wc-down`(#c03a3a 하락), `--wc-warn`(#c8842a), `--wc-blue`(#2d5bd7) — `wc-tokens.css:32-35`. **실록의 `#0E7A3C`·`#946A12`·`#3B5BA5` 하드코딩을 여기로 흡수할 수 있다.**
- 다크 존 — `--gn-night / -soft / -tile / -line`, `--gn-cream / -dim`, `--gn-bg-50/100/700/900`, `--gn-live` — `a-tokens.css:14-27`.
- 타입 스케일 — `--wc-fs-hero / -h1 / -h2(26px) / -eyebrow(11px)` — `wc-tokens.css:55-58`.
- 라운드 — `rounded-lg`=8px, `rounded-xl`=12px (`globals.css:71,118-121`). `rounded-2xl`(16px)은 정의되지 않은 Tailwind 기본값이므로 **쓰지 말 것**.

### 3-4. 참고 구현

- 언더라인 탭 + 칩 탭 실사용: `components/betting/betting-header.tsx:52,71,158,199`
- 밴드 + 밴드 밖 걸침 카드: `app/explore/explore-content.tsx:157-248` (PageBand children 패턴)
- 밴드 안 다크 카드/타일: `components/home/matchday-band.tsx:507-639`

---

## 4. 개편 시 깨질 위험

### 4-1. `worldcup-scope` 를 벗어나면 — 치명적

`--wc-*` 는 **전량 `.worldcup-scope` 클래스에만** 선언돼 있다 (`app/worldcup/wc-tokens.css:10-63`). `:root` 에 없다.

개편 대상 5개 파일의 `var(--wc-*)` 호출 **169건 중 161건이 fallback 없음**:

| 파일 | fallback 없는 `var(--wc-*)` | fallback 있는 것 |
|---|---|---|
| `app/matches/page.tsx` | 26 | 0 |
| `app/saga/[slug]/season-wiki.tsx` | 37 | 2 |
| `app/saga/[slug]/page.tsx` | 29 | 4 |
| `app/saga/page.tsx` | 17 | 2 |
| `app/match/[gameId]/*` (5파일) | 52 | 0 |

스코프를 잃으면 이 161개가 **무효 선언(invalid at computed-value time)** 이 되어 상속값/초기값으로 떨어진다. `background: var(--wc-card)` → 투명, `color: var(--wc-ink)` → 상속색, `border: 1px solid var(--wc-line)` → `currentColor` 테두리. 게다가 fallback 이 있는 8곳(`season-wiki.tsx:46`, `saga/[slug]/page.tsx:126,177,269,336` 등)만 정상 렌더돼 **절반만 깨진 화면**이 나온다 — 전부 깨지는 것보다 진단이 어렵다.

**다만 실제 위험은 낮다.** `components/app-shell-client.tsx:45` 가 전 페이지를 감싸고 있어서, **페이지 안의 `worldcup-scope` div 를 지워도 상위 래퍼가 남는다.** 즉:
- ✅ 안전: `app/match/[gameId]/page.tsx:75`, `app/matches/page.tsx:114`, `app/saga/page.tsx:62`, `app/saga/[slug]/page.tsx:161`, `app/saga/[slug]/season-wiki.tsx:105` 의 중복 wrapper 제거.
- 🚨 금지: `app-shell-client.tsx:45` 의 wrapper 제거 — 사이트 전체가 무너진다.
- 🚨 주의: Radix Dialog / Portal. `document.body` 로 portal 되므로 AppShell 밖이다. `components/tarot/tarot-modal.tsx:34-45` 가 이 함정을 겪고 `className="worldcup-scope"` 를 DialogContent 에 직접 붙여 해결했다. 매치·실록에 모달을 새로 붙이면 **반드시 같은 처리**를 할 것.
- `--gn-*` 는 `:root`(`a-tokens.css:13`) 라 스코프와 무관하게 안전.

### 4-2. `.worldcup-scope` prefix 클래스는 스코프 밖에서 스타일이 0이 된다

`.wc-panel`, `.wc-page-head`, `.wc-sec-head`, `.wc-mrow*`, `.wc-odd*`, `.wc-games-tabs`, `.wc-reg-*`, `.wc-lb-*` 는 셀렉터 자체가 `.worldcup-scope .xxx` 다 (`wc-tokens.css:73, 88, 110, 279, 399, 713, …`). 스코프 밖에서 클래스만 붙이면 **에러 없이 조용히 무스타일**이 된다. 현재 개편 대상 3페이지는 이 클래스를 **하나도 쓰지 않으므로** 이 축의 위험은 0이다 (검증: `wc-panel|wc-page-head|wc-mrow|wc-odd|wc-games-tabs` grep 결과에 `app/match`, `app/matches`, `app/saga` 없음).

### 4-3. 밴드를 넣을 때 따라오는 부작용

1. **`.gn-band + *` 잔광이 자동으로 붙는다** (`a-tokens.css:85-88`). `PageBand` **바로 다음 형제**에게 상단 132px 웜 그라디언트 + `background-repeat: no-repeat` 가 걸린다. 그 형제가 자체 `background` 를 인라인으로 지정하고 있으면(예: `season-wiki.tsx:105` 의 `style={{background:"var(--wc-paper)"}}`) `background-image` 만 덧씌워지므로 충돌은 없지만, `background` **shorthand** 를 쓰면 image 가 지워진다. 밴드 직후 요소에는 `backgroundColor` 만 쓸 것.
2. **문서 아웃라인**. `PageBand` 기본 태그는 `h1` 이다(`page-band.tsx:41`). 세 페이지 모두 이미 `h1` 이 있다 — `match-header.tsx` 는 없지만 `season-wiki.tsx:115`, `saga/[slug]/page.tsx:179` 는 `h1` 을 쓴다. 홈은 이 충돌을 `as="h2"` 로 피했다(`home-client.tsx:195`, 주석에 이유 명시). 같은 처리 필요.
3. **밴드 폭 vs 본문 폭**. 밴드 내부는 `max-w-[1280px]` 고정(`page-band.tsx:47`)이라 본문을 760px 로 두면 좌측선이 어긋난다. `/matches` 가 이미 이 상태다(`matches/page.tsx:115` vs `:122`). 밴드를 넣을 거면 본문 폭도 홈 계열(1280 + 12컬럼)로 맞추거나, 밴드 내부 폭을 본문에 맞춰 조정해야 한다.
4. **모션**. `.gn-band-entering .gn-band` 진입 애니메이션은 부모에 `gn-band-entering` 이 있을 때만 재생된다(`a-tokens.css:64-66`). 홈만 이 클래스를 붙인다(`home-client.tsx:161`) — 다른 페이지는 애니메이션 없이 정적으로 뜨며, 이게 정상이다.

### 4-4. 카드 문법을 통일할 때

- `border: 1px solid var(--wc-line)` → `boxShadow: var(--wc-shadow-1)` 로 바꾸면 **박스 크기가 1px 줄어든다** (border 는 레이아웃을 차지, box-shadow 는 안 차지). 인접 요소 간격이 미세하게 벌어지므로 `matches/page.tsx:230-237` 처럼 행 구분선을 `borderTop` 으로 긋는 리스트는 계산이 어긋날 수 있다.
- 실록의 이벤트 색 카드(`season-wiki.tsx:213-218`)를 걷어내면 **사료 종류 구분 수단이 배지 하나만 남는다**(`season-wiki.tsx:221-226`). 운영자가 "박스 테두리로 무슨 뉴스인지 표시"를 명시 요구한 결과물이므로(주석 :56-59), 색을 죽이려면 배지·칩 쪽 위계를 먼저 세워야 한다.
- ⚠️ 프로젝트 영구 금지 규칙 재확인: **한쪽 면 액센트 보더(`border-left: Npx solid <색>`) 금지** (`a-tokens.css:9-10`). 실록이 이미 이 규칙을 알고 사방 테두리로 우회했다(`season-wiki.tsx:59`) — 개편안이 이걸 되돌리지 않도록.
- ⚠️ **베팅/픽 카드에 다크 금지**. 다크는 밴드·푸터 등 "선언 영역"에만. `/matches` 의 경기 행 리스트는 픽 카드 계열이므로 라이트 유지.

### 4-5. 죽은 파일 주의

`styles/globals.css` 는 **어디에서도 import 되지 않는다** (검증: `styles/globals` grep 0건). 그런데 `--radius: 0.625rem`(:31) 로 `app/globals.css:71` 의 `0.5rem` 과 다른 값을 갖고 있다. 개편 중 이 파일을 "글로벌 토큰"으로 착각해 수정하면 아무 효과 없이 시간만 쓴다. 진짜 정본은 `app/globals.css` + `app/worldcup/wc-tokens.css` + `app/a-tokens.css` 셋이고, `app/layout.tsx:20,23,26` 이 이 순서로 import 한다 (뒤가 이긴다).

---

## 5. 한 줄 결론

세 페이지가 따로 노는 건 취향이 아니라 **홈이 쓰는 세 가지 공용 문법 — 다크 밴드(`PageBand`/`.gn-band`), 카드 레시피(`--wc-shadow-1` + `rounded-xl` + `.gn-card-lift`), 디스플레이 타이포(`--font-display-ko` / `font-title`) — 을 셋 다 안 쓰고 페이지마다 인라인 스타일로 다시 만들었기 때문**이다. CSS 스코프는 원인이 아니며(모든 토큰·유틸이 이미 접근 가능), `/matches` 가 밴드 하나만 도입하고도 나머지 둘보다 홈에 가까워진 것이 그 증거다. 개편은 새 디자인이 아니라 **기존 자산 연결**로 대부분 해결된다.

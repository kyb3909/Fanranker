# 밴드 ↔ 본문 이음매 — 수치 감사

> 측정: Playwright(Chromium) + `getComputedStyle` / `getBoundingClientRect` 실측.
> 대상: 로컬 프로덕션 빌드 `http://localhost:3100` (`next build && next start`, BUILD_ID 존재).
> 페이지: `/` · `/prediction` · `/community/football` · `/explore` · `/search` · `/my-predictions`
> 뷰포트: 390 / 768 / 1024 / 1280 / 1440 (5종 × 6페이지 = 30 케이스, 실패 0).
> 상태: 비로그인. `/my-predictions`·`/search` 는 비로그인 화면이라 본문 타입 스케일이 실제보다 작을 수 있음 (해당 항목에 표기).
>
> 이 문서는 **수치 감사 전용**이다. 시각·구성 진단은 `band-seam.md`(별도 작업) 참조.

---

## 0. 기준선 — 밴드는 무엇과 정렬되어 있나

밴드(`components/page-band.tsx:47`, `components/home/matchday-band.tsx:76`)의 내부 wrap 은
`mx-auto max-w-[1280px] px-4 sm:px-6` 다. **헤더(`components/header/header.tsx:30`)와 완전히 동일하다.**

| 뷰포트 | 헤더 콘텐츠 좌측 x | 밴드 콘텐츠 좌측 x | 헤더 폭 | 밴드 폭 | Δ |
|---|---|---|---|---|---|
| 390 | 16 | 16 | 358 | 358 | **0** |
| 768 | 24 | 24 | 720 | 720 | **0** |
| 1280 | 24 | 24 | 1232 | 1232 | **0** |
| 1440 | 104 | 104 | 1232 | 1232 | **0** |

→ **밴드는 틀리지 않았다.** 밴드는 헤더와 픽셀 단위로 일치한다.
어긋나는 쪽은 전부 본문(`<main>`)이다. 이하 모든 Δ 는 `본문 콘텐츠 좌측 x − 밴드 콘텐츠 좌측 x` 다.

---

## 1. 가로 정렬 축 — 페이지 × 뷰포트 Δ(px)

### 1-a. 좌측 정렬 오차 (Δ = 본문 − 밴드, 0 이 정답)

| 페이지 | 본문 컨테이너 클래스 | 390 | 768 | 1024 | 1280 | 1440 |
|---|---|---:|---:|---:|---:|---:|
| `/` | `mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]` | 0 | **+84** | 0 | 0 | 0 |
| `/prediction` | 위와 동일 (+`min-h-[80vh]`) | 0 | **+84** | 0 | 0 | 0 |
| `/search` | 위와 동일 | 0 | **+84** | 0 | 0 | 0 |
| `/community/football` | `container mx-auto max-w-[1280px] px-4 py-6` | 0 | **−8** | **−8** | **−8** | **−8** |
| `/explore` | `container mx-auto max-w-[1280px] px-4 pt-[72px] pb-10` | 0 | **−8** | **−8** | **−8** | **−8** |
| `/my-predictions` | `mx-auto max-w-[800px] px-4 py-6` | 0 | **−8** | **+104** | **+232** | **+232** |

### 1-b. 콘텐츠 폭 오차 (ΔW = 본문 폭 − 밴드 폭)

| 페이지 | 390 | 768 | 1024 | 1280 | 1440 |
|---|---:|---:|---:|---:|---:|
| `/` · `/prediction` · `/search` | 0 | **−168** | 0 | 0 | 0 |
| `/community/football` · `/explore` | 0 | **+16** | **+16** | **+16** | **+16** |
| `/my-predictions` | 0 | **+16** | **−208** | **−464** | **−464** |

### 1-c. 원시 실측치 (밴드 / 본문 콘텐츠 좌측 x · 폭)

| 뷰포트 | 밴드 cL / cW | `/`·`/prediction`·`/search` | `/community`·`/explore` | `/my-predictions` |
|---|---|---|---|---|
| 390 | 16 / 358 | 16 / 358 | 16 / 358 | 16 / 358 |
| 768 | 24 / 720 | **108 / 552** | 16 / 736 | 16 / 736 |
| 1024 | 24 / 976 | 24 / 976 | 16 / 992 | **128 / 768** |
| 1280 | 24 / 1232 | 24 / 1232 | 16 / 1248 | **256 / 768** |
| 1440 | 104 / 1232 | 104 / 1232 | 96 / 1248 | **336 / 768** |

### 1-d. 다크 존끼리도 안 맞는다 (푸터)

푸터(`components/site-footer.tsx:25`)도 `--gn-night` 를 쓰는 **다크 존**인데 wrap 이
`mx-auto max-w-[1280px] px-4` — `sm:px-6` 가 없다.

| 뷰포트 | 밴드 cL | 푸터 cL | Δ |
|---|---:|---:|---:|
| 390 | 16 | 16 | 0 |
| 768 | 24 | 16 | **−8** |
| 1280 | 24 | 16 | **−8** |
| 1440 | 104 | 96 | **−8** |

같은 다크 팔레트를 쓰는 두 면이 서로 8px 어긋나 있다.

### 1-e. 헤더 Suspense 폴백은 또 다른 값

`components/app-shell.tsx:13` 의 `HeaderFallback` wrap 은 `max-w-[1280px] px-6 sm:px-10` (24 / 40px).
실제 헤더(16 / 24px)와 다르므로, 헤더가 hydrate 되는 순간 셸 좌측 축이 **≥640 에서 16px** 점프한다.

---

## 2. 세로 간격 — 밴드 하단 → 본문 첫 콘텐츠 상단

밴드 하단 y 와 `<main>` 박스 상단 y 는 **모든 30 케이스에서 정확히 0px** 이다(마진 없음).
따라서 세로 간격은 전부 `<main>` 의 `padding-top` 이 만든다.

| 페이지 | `padding-top` (390) | `padding-top` (≥768) | 밴드 하단→첫 콘텐츠 실측 간격 (1280) |
|---|---:|---:|---:|
| `/` | 20px | 24px | 24.0 |
| `/prediction` | 20px | 24px | 24.0 |
| `/search` | 20px | 24px | 24.0 |
| `/community/football` | 24px | 24px | 24.0 |
| `/my-predictions` | 24px | 24px | 24.0 |
| `/explore` | **72px** | **72px** | 72.0 |

**판정**

- ≥768 에서는 `/explore` 를 뺀 5개 페이지가 전부 24px 로 일치한다 → 세로는 가로만큼 망가지지 않았다.
- 390 에서만 `py-5`(20px) 계열과 `py-6`(24px) 계열이 갈린다 → **모바일에서 4px 편차**.
- `/explore` 의 72px 는 **버그가 아니라 보정치**다. 실측:
  `밴드 하단 303.17` → `걸침 카드 하단 351.17`(`mb-[-48px]`) → `본문 첫 콘텐츠 375.17`
  = 카드 하단 기준 **실효 간격 24px** 로 나머지와 동일하다.
  단, `categories.length === 0` 이면 걸침 카드가 렌더되지 않아(`app/explore/explore-content.tsx:161`)
  72px 가 그대로 빈 공백이 된다 → **조건부 결함**.

---

## 3. 컨테이너 규격 — 밴드 wrap vs 본문 main

| | max-width | padding-inline (<640) | padding-inline (≥640) | 벌어지는 지점 |
|---|---|---|---|---|
| **밴드 / 헤더 (기준)** | 1280px | 16px | 24px | — |
| 변형 A `/` `/prediction` `/search` | `100%` → `600px`(≥640) → `1280px`(≥1024) | 16px | 24px | **640–1023 구간에서 600px 상한** → +84 / −168 |
| 변형 B `/community/[slug]` `/explore` | `container` + 1280px | 16px | **16px** | **≥640 전 구간** (`sm:px-6` 누락) → −8 |
| 변형 C `/my-predictions` | 800px | 16px | **16px** | **≥1024** (800px 상한 + 중앙정렬) → +104…+232 |
| 변형 D `/games` `/shop` `/share` | 1280px | 16px | 24px | **없음 — 밴드와 완전 일치** ✅ |
| 푸터 | 1280px | 16px | **16px** | ≥640 → −8 |
| 헤더 폴백 | 1280px | **24px** | **40px** | 전 구간 |

**정답은 이미 코드 안에 있다.** 변형 D(`app/games/layout.tsx:13`, `app/shop/page.tsx:34`,
`app/share/share-content.tsx:32`)가 밴드·헤더와 픽셀 단위로 일치한다.

`container` 유틸은 이 조합에서 실질 no-op 이다(측정상 `max-w-[1280px]` 와 동일 결과).
남겨두면 브레이크포인트 상한이 이중으로 걸려 향후 값 변경 시 사고 지점이 된다.

---

## 4. 라운드 · 그림자 언어

### 4-a. 라운드

밴드 실측: `border-radius: 0px`, `box-shadow: none` — **전 페이지·전 뷰포트 동일**.

본문에서 실제로 렌더된 radius (30 케이스 합산, 사용 횟수):

| radius | 사용 | 출처 |
|---|---:|---|
| `8px` | 252 | `rounded-lg` (소스 210회 — 최다) |
| `4px` | 207 | `rounded-sm` / shadcn `--radius` 파생 |
| `999px` | 175 | pill |
| `3.35544e+07px` | 158 | `rounded-full` 이 비정사각 요소에 걸린 값 |
| `6px` | 140 | `rounded-md` |
| `16px` | 75 | `rounded-2xl` (톱스토리 카드) |
| `12px` | 53 | `rounded-xl` |
| `10px` | 38 | 인라인 `border-radius: 10px` |
| `20px` | 15 | 인라인 |

→ **렌더 기준 9종**, pill 2종(999 / 3.35e7)을 하나로 보면 **실질 8종**.
소스 기준으로는 여기에 `2px · 9px · 11px · 13px · 14px · 18px · 22px` 인라인이 더 있어 **15종**이다.

밴드(0px)와 본문 최소 카드 radius(4px) 사이에 공유 스텝이 없다 — 밴드는 라운드 언어에 참여하지 않는다.

### 4-b. 그림자

밴드: `none`. 본문에서 실제 렌더된 그림자 (투명 ring 리셋 제외):

| 그림자 | 사용 | 정체 |
|---|---:|---|
| `rgba(20,20,40,.06) 0 1px 3px, rgb(226,229,234) 0 0 0 1px` | 141 | `--wc-shadow-1` |
| `rgba(23,20,15,.1) 0 2px 8px` | 75 | 인라인 (톱스토리/카드뉴스) |
| `rgba(26,20,22,.06) 0 1px 2px` | 20 | 인라인 |
| `rgba(26,20,22,.12) 0 1px 4px` | 8 | 인라인 |

→ **4종**. 세 개의 서로 다른 그림자 색(`20,20,40` / `23,20,15` / `26,20,22`)이 공존한다.
`20,20,40` 은 청보라, `23,20,15` 는 **따뜻한 갈색**, `26,20,22` 는 자주 — 그림자 hue 조차 3갈래다.
`--wc-shadow-2` / `--wc-shadow-3` 은 이 6개 페이지에서 한 번도 안 쓰인다.

---

## 5. 회색 단계 — 실측 + 소스 전수

### 5-a. 실제 렌더된 서피스 (30 케이스 합산)

| 역할 | hex | 밝기(평균 RGB) | 사용 |
|---|---|---:|---:|
| 카드 | `#ffffff` | 255 | 649 |
| 상승 서피스 | `#f7f8fa` | 248 | 20 |
| 캔버스 | `#f1f1f3` | 241 | 5 |
| 소프트 | `#eceef2` | 238 | 84 |
| 보더 1 | `#e2e5ea` | 229 | 559 |
| 보더 2 | `#cfd4dc` | 213 | 284 |
| 보더 (중간) | `#7a828a` | 130 | 10 |
| 다크 잉크 | `#14161a` | 22 | 5 |
| 밴드 바탕 | `#16141a` | 22 | (밴드) |
| 오버레이 | `#0c0b0f` @.5 | — | 145 |

### 5-b. 중간 톤은 **존재하지 않는다**

```
다크 팔레트(--gn-*)     ██ 22 · 30 · 37 · 53
                        ↓
                  ← 밝기 54 ~ 203 구간: 서피스 토큰 0개 →
                        ↓
라이트 팔레트(--wc-*)                     204 · 213 · 229 · 238 · 241 · 248 · 255 ██
```

- 다크 서피스: `--gn-night` 22 / `--gn-night-soft` 30 / `--gn-night-tile` 37 / `--gn-night-line` 53
- 라이트 서피스: 204 ~ 255
- **그 사이 150 스텝에 서피스가 하나도 없다.** 그 구간에 있는 값은 전부 *텍스트* 색이다
  (`#494d56` 78 · `#5b5565` 92 · `#5c6470` 101 · `#6c757d` 116 · `#7a828a` 130 · `#8d8794` 141).

→ 「두 개의 다른 시스템」이라는 인상의 **수치적 근거**가 이것이다. 두 팔레트는 겹치는 면이 0이다.

### 5-c. 더 결정적인 문제 — 두 팔레트의 **색상(hue)이 다르다**

| 토큰 | hex | hue | 채도 |
|---|---|---:|---:|
| `--gn-night` | `#16141a` | **260°** (보라) | 23% |
| `--gn-night-soft` | `#1f1c24` | **262°** (보라) | 22% |
| `--gn-night-tile` | `#262230` | **257°** (보라) | 29% |
| `--gn-night-line` | `#363040` | **262°** (보라) | 25% |
| `--gn-cream` | `#f5efe7` | **34°** (주황) | 6% |
| `--gn-cream-dim` | `#b8b0a4` | **37°** (주황) | 11% |
| `--wc-ink` | `#14161a` | **220°** (파랑) | 23% |
| `--wc-line` | `#e2e5ea` | **218°** (파랑) | 3% |
| `--wc-line-2` | `#cfd4dc` | **217°** (파랑) | 6% |
| `--wc-soft` | `#eceef2` | **220°** (파랑) | 2% |

세 가지가 동시에 벌어지고 있다:

1. **다크 면 260° 보라 ↔ 라이트 면 218° 파랑** → **42° 어긋남**.
2. **밴드 텍스트 34° 주황 ↔ 본문 텍스트 220° 파랑** → **약 186° 반대편**.
   밴드는 웜, 본문은 쿨. 이음매에서 색온도가 통째로 뒤집힌다.
3. `--gn-night` = `#16141a`, `--wc-ink` = `#14161a` — **R/G 두 자리만 뒤바뀐 쌍둥이 hex** 인데
   하나는 260°, 하나는 220° 다. 같은 값을 쓰려다 실수로 갈라진 것으로 보인다.

### 5-d. 소스 전수 — 회색 hex 개수

`app/` `components/` `lib/` 의 `*.tsx` `*.css` 에서 채도 ≤18 인 6자리 hex 를 전수 집계:
**60종 이상**. 그중 눈으로 구별 불가능한 중복 군집:

| 군집 | 값들 | 개수 |
|---|---|---:|
| 밝은 서피스 (밝기 237–250) | `#eceef2` `#f1f1f3` `#ebedf0` `#eef0f3` `#edeff2` `#eff2f4` `#f1f3f5` `#f2f3f5` `#f3f4f6` `#f4f5f7` `#f6f7f9` `#f7f8fa` `#f5f5f5` `#fafafa` `#eeeeee` `#f4f2ee` | **16** |
| 보더 (밝기 224–233) | `#e2e5ea` `#e4e7ec` `#e7e9ed` `#e5e5e5` `#e1e4ea` `#e0e0e0` `#dfe3e9` `#eadfe3` | **8** |
| 강한 보더 (밝기 204–215) | `#cfd4dc` `#cfd4db` `#cfd2d7` `#d2d6dd` `#c9cfd8` `#cccccc` | **6** |
| 웜/핑크 잔재 | `#f6e4e8`(8회) `#f4f2ee` `#eadfe3` | **3** |

→ 세 군집만 합쳐 **30종이 실제로는 5종이면 충분한 자리**를 차지하고 있다.
`#f6e4e8` 은 `wc-tokens.css` 주석에 「구 핑크, 교체됨」이라 적혀 있는데 소스에 아직 8회 남아 있다.

### 5-e. 토큰 스코프 비대칭 (구조적 결함)

문서 루트에서 CSS 변수 해석을 실측한 결과:

| 토큰 | `:root` 에서 해석되나? |
|---|---|
| `--gn-night` `--gn-night-soft` `--gn-night-tile` `--gn-night-line` `--gn-cream` `--gn-cream-dim` | ✅ 전부 해석됨 |
| `--wc-ink` `--wc-paper` `--wc-line` `--wc-line-2` `--wc-canvas` `--wc-soft` `--wc-card` `--wc-mute` | ❌ **전부 `(unresolved)`** |

`--gn-*` 는 `app/a-tokens.css:13` 에서 `:root` 전역, `--wc-*` 는 `app/worldcup/wc-tokens.css:10` 에서
`.worldcup-scope` 클래스 스코프다.

- 감사한 6개 페이지는 모두 `.worldcup-scope` 로 감싸져 있어 지금은 동작한다.
- 그러나 `app/globals.css:155` 등은 `var(--wc-ink, #14161a)` 처럼 **하드코딩 폴백**에 의존한다.
  스코프 밖 컴포넌트는 조용히 폴백 리터럴로 떨어진다 → 위 5-d 의 hex 난립을 구조적으로 유발하는 원인.
- **다크 팔레트는 전역, 라이트 팔레트는 페이지 스코프** — 이 비대칭 자체가 "두 시스템"을 코드 레벨에서 고착시킨다.

---

## 6. 타입 스케일

밴드 내부: 제목 **30px**(<640) / **42px**(≥640), 지표 숫자 34px(`PageBandStat`), 키커 12.5px.

| 페이지 | 밴드 제목 (1280) | 본문 최대 글자 | 간극 | 배율 | 본문에 존재하는 크기들 |
|---|---:|---:|---:|---:|---|
| `/` | 42px | 19px (H2 헤드라인) | 23px | **2.21×** | 10,11,12,13,14,19 |
| `/prediction` | 42px | 18px (이벤트 배너 이모지) | 24px | **2.33×** | 10,11,12,13,14,15,18 |
| `/my-predictions` * | 42px | 18px | 24px | **2.33×** | 14,18 |
| `/explore` | 42px | 17px | 25px | **2.47×** | 10,11,12,13,14,17 |
| `/community/football` | 42px | 16px | 26px | **2.63×** | 10,11,12,13,14,16 |
| `/search` * | 42px | 14px | 28px | **3.00×** | 10,11,12,13,14 |

\* 비로그인 화면 — 로그인 시 본문 최대치가 더 클 수 있음.

390 뷰포트:

| 페이지 | 밴드 | 본문 최대 | 배율 |
|---|---:|---:|---:|
| `/` | 30px | 19px | 1.58× |
| `/prediction` · `/my-predictions` | 30px | 18px | 1.67× |
| `/explore` | 30px | 17px | 1.76× |
| `/community/football` | 30px | 16px | 1.88× |
| `/search` | 30px | 14px | 2.14× |

**판정**

- **20–41px 구간이 전 페이지에서 완전히 비어 있다.** 본문 최대가 19px, 밴드가 42px.
  그 사이 22px 폭에 단 하나의 스텝도 없다.
- 밴드 안에는 42 / 34 / 13 / 12.5 가 있고, 본문에는 19 / 18 / 17 / 16 / 15 / 14 / 13 / 12 / 11 / 10 이 있다.
  두 집합은 13px 근처에서만 겹친다 — 즉 **가장 작은 글자에서만 공유**하고 위계 상단은 단절이다.
- 페이지마다 배율이 2.21× ~ 3.00× 로 흔들린다 → 같은 밴드인데 페이지마다 다른 위계로 읽힌다.
- 데스크톱(2.21–3.00×)이 모바일(1.58–2.14×)보다 일관되게 더 벌어진다. 브레이크포인트가 간극을 키운다.

---

## 7. 정합성이 깨진 지점 — 우선순위 목록

| # | 증상 | 실측 | 원인 파일 · 클래스 |
|---|---|---|---|
| **1** | 태블릿(640–1023)에서 본문이 밴드보다 **84px 안쪽**, 폭 **168px 좁음** | Δ +84 / ΔW −168 @768 | `sm:max-w-[600px]` — `components/home/home-client.tsx:146`, `components/prediction/prediction-client.tsx:47`, `app/search/page.tsx:215`·`478`, `app/loading.tsx:7`, `app/community/[slug]/loading.tsx:6`, `app/explore/loading.tsx:4`, `app/search/loading.tsx:6`, `app/post/[id]/loading.tsx:4`, `app/profile/[id]/loading.tsx:4`, `app/write/page.tsx:86`·`131`·`158`·`182`·`533` |
| **2** | `/my-predictions` 가 데스크톱에서 **232px 안쪽** | Δ +232 @1280·1440 | `max-w-[800px] px-4` — `app/my-predictions/page.tsx:19` |
| **3** | 게시판·운동장이 **≥640 전 구간에서 8px 밖으로** 삐져나감 | Δ −8 @768~1440 | `sm:px-6` 누락 — `app/community/[slug]/page.tsx:274`·`377`, `app/explore/explore-content.tsx:252`, `app/post/[id]/page.tsx:262` |
| **4** | 다크 존끼리 안 맞음 (밴드 vs 푸터) | Δ −8 @≥640 | `components/site-footer.tsx:25` — `px-4` 만, `sm:px-6` 없음 |
| **5** | 헤더 hydrate 시 좌측 축 16px 점프 | 40px vs 24px @≥640 | `components/app-shell.tsx:13` — `px-6 sm:px-10` |
| **6** | 밴드(보라 260°)와 본문(파랑 218°) **hue 42° 어긋남** | 5-c 표 | `app/a-tokens.css:15–18` vs `app/worldcup/wc-tokens.css:18–26` |
| **7** | 밴드 텍스트(주황 34°)와 본문 텍스트(파랑 220°) **색온도 반전** | 5-c 표 | `app/a-tokens.css:19–20` (`--gn-cream`, `--gn-cream-dim`) |
| **8** | 라이트 팔레트만 클래스 스코프 → 스코프 밖에서 무음 폴백 | `--wc-*` 8종 전부 `:root` 미해석 | `app/worldcup/wc-tokens.css:10` (`.worldcup-scope`) |
| **9** | 회색 60종 이상, 구별 불가 중복 30종 | 5-d 표 | 전역 인라인 hex (`app/**/*.tsx`, `components/**/*.tsx`) |
| **10** | radius 15종(렌더 9종) · 그림자 4종 + hue 3갈래 | 4-a, 4-b | 인라인 `border-radius` / `boxShadow` |
| **11** | 20–41px 타입 스텝 부재 | 6절 | `components/page-band.tsx:54` (42px) ↔ 본문 최대 19px |
| **12** | 모바일 세로 간격 20 vs 24 혼재 | 390 에서 4px 편차 | `py-5` vs `py-6` |
| **13** | `/explore` `pt-[72px]` 는 걸침 카드 유무에 의존 | 카드 없으면 72px 빈 공백 | `app/explore/explore-content.tsx:252` + `:161` 조건부 렌더 |
| **14** | `container` 유틸 무의미 중복 | 측정상 no-op | `app/community/[slug]/page.tsx:274`·`377`, `app/explore/explore-content.tsx:252`, `app/post/[id]/page.tsx:262` |

---

## 8. 통일 제안

### 8-1. 셸 컨테이너를 하나로 — `.gn-shell`

밴드·헤더가 이미 쓰고 있고 `/games`·`/shop`·`/share` 가 이미 일치하는 값을 **정본**으로 삼는다.

```css
/* app/a-tokens.css — @layer components 안 */
.gn-shell {
  margin-inline: auto;
  width: 100%;
  max-width: 1280px;
  padding-inline: 16px;
}
@media (min-width: 640px) {
  .gn-shell { padding-inline: 24px; }
}
```

즉 **`mx-auto w-full max-w-[1280px] px-4 sm:px-6`** — 이 한 줄이 사이트의 유일한 가로 축이 된다.

**Tailwind 클래스로만 가고 싶다면** `.gn-shell` 없이 위 유틸 문자열을 그대로 복사해도 되지만,
현재 6종으로 갈라진 원인이 「복사해서 조금씩 바꿈」이므로 **단일 클래스 추출을 권장**한다.

#### 좁은 읽기 칼럼(600 / 800px)은 버리지 말고 **안쪽으로** 옮긴다

600px·800px 상한 자체는 가독 폭으로 타당하다. 문제는 그게 **바깥 셸**에 붙어 있어
밴드와 축이 어긋난다는 점이다. 셸은 항상 1280 으로 두고, 상한은 안쪽 칼럼에 건다.

```
<main class="gn-shell py-6">
  <div class="max-w-[800px]">  ← mx-auto 대신 좌측 정렬
    …
```

`mx-auto` 를 빼고 좌측 정렬해야 밴드 좌측 축과 x 가 일치한다.
중앙 정렬을 유지하고 싶다면 밴드도 같은 폭으로 좁혀야 하는데, 밴드는 풀블리드가 설계 전제이므로
**좌측 정렬을 권장**한다. (이건 디자인 판단이 필요한 유일한 항목이다.)

### 8-2. 변경이 건드리는 파일 목록

**컨테이너 정본화 (필수)**

| 파일 | 라인 | 현재 | 변경 |
|---|---|---|---|
| `components/page-band.tsx` | 47 | `mx-auto max-w-[1280px] px-4 sm:px-6` | `gn-shell` |
| `components/home/matchday-band.tsx` | 76 | 동일 | `gn-shell` |
| `components/header/header.tsx` | 30 | 동일 | `gn-shell` |
| `components/app-shell.tsx` | 13 | `max-w-[1280px] px-6 sm:px-10` | `gn-shell` ← **값 변경** |
| `components/site-footer.tsx` | 25 | `max-w-[1280px] px-4` | `gn-shell` ← **값 변경** |
| `components/home/home-client.tsx` | 146 | `…sm:max-w-[600px]…` | `gn-shell` + 600px 은 피드 칼럼으로 |
| `components/prediction/prediction-client.tsx` | 47 | 동일 | `gn-shell` |
| `app/search/page.tsx` | 215, 478 | 동일 | `gn-shell` |
| `app/my-predictions/page.tsx` | 19 | `max-w-[800px] px-4 py-6` | `gn-shell py-6` + 내부 `max-w-[800px]` |
| `app/community/[slug]/page.tsx` | 274, 377 | `container … px-4 py-6` | `gn-shell py-6` (`container` 제거) |
| `app/explore/explore-content.tsx` | 252 | `container … px-4 pt-[72px] pb-10` | `gn-shell pt-[72px] pb-10` |
| `app/post/[id]/page.tsx` | 262 | `container … px-4 py-6` | `gn-shell py-6` |
| `app/write/page.tsx` | 86, 131, 158, 182, 533 | `…sm:max-w-[600px]…` | `gn-shell` + 내부 상한 |
| `app/games/layout.tsx` | 13 | 이미 일치 | `gn-shell` (표현 통일만) |
| `app/shop/page.tsx` | 34 | 이미 일치 | `gn-shell` |
| `app/share/share-content.tsx` | 32 | 이미 일치 | `gn-shell` |

**스켈레톤 동기화 (필수 — 안 맞추면 로딩→완료 시 레이아웃 점프)**

`app/loading.tsx:7` · `app/community/[slug]/loading.tsx:6` · `app/explore/loading.tsx:4` ·
`app/search/loading.tsx:6` · `app/post/[id]/loading.tsx:4` · `app/profile/[id]/loading.tsx:4`

**세로 간격 통일**

`py-5`(20px) 계열을 전부 `py-6`(24px) 로 → 위 목록 중 `home-client` · `prediction-client` ·
`search/page` · `write/page` · `games/layout` · `shop/page` · `share-content`.
`/explore` 의 `pt-[72px]` 은 걸침 카드가 있을 때만 유효하므로
`categories.length > 0 ? "pt-[72px]" : "pt-6"` 로 조건화.

**검증**: 변경 후 `Δ = 0` 이어야 하는 케이스는 6페이지 × 5뷰포트 = 30개 전부.

### 8-3. 색상 축 통일 — 다크 램프를 라이트와 같은 hue 로

라이트 팔레트는 21곳 이상에서 쓰이고(`#e2e5ea` 단독 21회), 다크 팔레트는 **토큰 4개짜리**다.
따라서 **다크를 라이트 쪽(218–220° 파랑)으로 맞추는 게 압도적으로 싸다** — 파일 1개, 값 4개.

`app/a-tokens.css:15–18`:

| 토큰 | 현재 | hue | 제안 | hue | 비고 |
|---|---|---:|---|---:|---|
| `--gn-night` | `#16141a` | 260° | `#14161a` | 220° | `--wc-ink` 와 동일값 — 두 팔레트가 한 점에서 만난다 |
| `--gn-night-soft` | `#1f1c24` | 262° | `#1c1f24` | 220° | R/G 스왑 |
| `--gn-night-tile` | `#262230` | 257° | `#222630` | 220° | R/G 스왑 |
| `--gn-night-line` | `#363040` | 262° | `#303640` | 220° | R/G 스왑 |

밝기는 전부 그대로(22 / 30 / 37 / 53) — **명도 변화 0, 색상만 42° 회전**.
회귀 위험이 사실상 없고, 밴드↔본문이 같은 색축 위에 놓인다.

`--gn-cream`(34° 주황) 은 브랜드 의도일 수 있으므로 자동 변경 대상에서 제외한다.
다만 **밴드 텍스트만 웜, 나머지 전부 쿨**이라는 사실은 기록해 둔다.
쿨로 통일하려면 `#f5efe7` → `#f2f3f5`, `#b8b0a4` → `#aeb3bb` (밝기 유지).

### 8-4. 회색 감축안 — 60종 → **7종**

| 역할 | 정본 | 밝기 | 흡수할 값 |
|---|---|---:|---|
| `surface/card` | `#ffffff` | 255 | — |
| `surface/raised` | `#f7f8fa` | 248 | `#f6f7f9` `#fafafa` `#f5f5f5` `#f4f5f7` `#f3f4f6` |
| `surface/canvas` | `#f1f1f3` | 241 | `#f1f3f5` `#f2f3f5` `#f4f2ee`(웜 제거) |
| `surface/soft` | `#eceef2` | 238 | `#ebedf0` `#eef0f3` `#edeff2` `#eff2f4` `#eeeeee` `#f6e4e8`(핑크 제거) `#eadfe3`(웜 제거) |
| `line/1` | `#e2e5ea` | 229 | `#e4e7ec` `#e7e9ed` `#e5e5e5` `#e1e4ea` `#e0e0e0` `#dfe3e9` |
| `line/2` | `#cfd4dc` | 213 | `#cfd4db` `#cfd2d7` `#d2d6dd` `#c9cfd8` `#cccccc` |
| `text/mute` | `#5c6470` | 101 | `#6c757d` `#7a828a` `#5b5565` `#494d56`→(별도 `text/2` 유지) |

→ 서피스 4 + 라인 2 + 뮤트 1 = **7종**. 흡수 대상 **30종 이상 제거**.

같은 작업으로 radius 도 정리한다: `4 · 8 · 12 · 16 · 999` **5스텝**만 남기고
`6 · 10 · 20 · 2 · 9 · 11 · 13 · 14 · 18 · 22` 는 가장 가까운 스텝으로 흡수.
그림자는 `--wc-shadow-1/2/3` **3종**만 남기고 인라인 3종(`23,20,15` / `26,20,22` ×2) 제거 —
특히 웜 갈색 그림자(`rgba(23,20,15,.1)`, 75회)는 쿨 팔레트와 충돌하므로 `--wc-shadow-2` 로 대체.

### 8-5. 토큰 스코프 정상화

`--wc-*` 를 `.worldcup-scope` 밖 `:root` 로 승격(또는 `:root` 에 기본값을 두고
`.worldcup-scope` 에서 오버라이드). 그래야 `var(--wc-ink, #14161a)` 류의 하드코딩 폴백을
전부 제거할 수 있고, 8-4 의 감축이 실제로 강제된다.
현 구조에서는 감축을 해도 스코프 밖에서 조용히 리터럴로 되돌아간다.

### 8-6. 타입 스텝 — 20–41px 공백 메우기

밴드 42px 바로 아래 스텝이 19px 라 위계가 끊긴다. 본문 섹션 제목용 스텝을 하나 세운다.

| 스텝 | 값 | 용도 |
|---|---|---|
| display | 42 / 30 | 밴드 제목 (현행 유지) |
| stat | 34 | `PageBandStat` (현행 유지) |
| **h2 (신규)** | **26px** | 본문 섹션 제목 — 42 → 26 → 19 로 배율 1.6 / 1.37 |
| h3 | 19 | 카드 헤드라인 (현행) |
| body | 14–16 | (현행) |
| meta | 11–13 | (현행) |

26px 은 이미 `--wc-fs-h2: 26px` 로 `app/worldcup/wc-tokens.css:57` 에 정의되어 있으나
감사한 6페이지에서 **한 번도 렌더되지 않았다.** 새 값을 만들 필요 없이 **기존 토큰을 쓰기만 하면 된다.**

---

## 9. 요약 — 가장 크게 어긋난 수치 3개

1. **768px에서 +84px / −168px** — `sm:max-w-[600px]` 때문에 본문이 밴드보다 84px 안쪽에서 시작하고 168px 좁다. `/` `/prediction` `/search` 전부.
2. **`/my-predictions` 데스크톱 +232px** — `max-w-[800px]` 중앙정렬이 밴드 좌측 축에서 232px 떨어진다.
3. **hue 42° + 색온도 반전** — 밴드 면 260°(보라) vs 본문 면 218°(파랑), 밴드 텍스트 34°(주황) vs 본문 텍스트 220°(파랑). 밝기 54–203 구간에는 서피스가 0개.

**부가**: 밴드는 헤더와 30/30 케이스 픽셀 일치 — 어긋난 쪽은 전부 본문이다.
정답 규격(`max-w-[1280px] px-4 sm:px-6`)은 이미 `/games` `/shop` `/share` 에 존재한다.

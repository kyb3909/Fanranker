# 한글 디스플레이 폰트 선정 — `--font-display` 슬롯

> `type-accent.md`가 정의한 역할 변수 중 **`--font-display`(한글 디스플레이)** 하나를 확정하기 위한 리서치.
> 대상: 다크 밴드 헤드라인("오늘의 메인 이벤트", "오늘의 경기"), 푸터 브랜드 블록, 섹션 헤더.
> 조건: **짧은 한글**, **28~50px**, 대부분 **다크 존**(#16141a) 위 크림(#f5efe7).
>
> 톤 기준: 무신사 / brown breath / MAXIM — 저채도·대비·여백·콘덴스드.
> 기각된 방향: 붓글씨·손글씨 계열(나눔손글씨/나눔펜/나눔브러쉬).
>
> 조사일 2026-07-28. 라이선스·용량은 전부 실제 확인했고, 확인 못 한 항목은 **미확인**으로 표기했다.

---

## 0. 먼저 — 오늘 이미 갖고 있는 것

`app/layout.tsx`가 로드하는 Pretendard Variable은 `weight: "45 920"`이다. **920 ≈ Black**이 이미 브라우저에 있다.

즉 새 폰트를 한 글자도 안 받고도 `font-weight: 900` + `letter-spacing: -.03em`으로 디스플레이 헤드라인을 만들 수 있다. **추가 전송량 0 바이트.**

이게 베이스라인이다. 아래 후보는 전부 "Pretendard 900을 이길 만큼 다른가?"라는 질문에 답해야 한다. 답이 "아니오"면 그 폰트는 순수 비용이다.

---

## 1. 후보 비교표

| # | 폰트 | 라이선스 | 입수 경로 | 한글 서브셋 | 용량(woff2, 실측) | 성격 |
|---|---|---|---|---|---|---|
| 1 | **Black Han Sans** | **OFL** (google/fonts `ofl/blackhansans`) | `next/font/google`, `subsets: ["korean"]` ✅ | **O** — METADATA.pb `subsets: korean, latin, menu` | TTF 998 KB이나 Google이 **88개 unicode-range 청크**로 분할, 청크당 ≈5.3 KB → 짧은 헤드라인 실전송 **≈30–80 KB** | 배민 한나체 Pro 계열. 초굵고 살짝 좁은 **포스터/스포츠 신문체**. 400 단일 굵기 |
| 2 | **Paperlogy** | **OFL** (공식 명시) | 공식 [freesentation.blog/paperlogyfont](https://freesentation.blog/paperlogyfont) → GitHub `Freesentation/paperlogy` (TTF/OTF only) · 미러 [fonts-archive/Paperlogy](https://github.com/fonts-archive/Paperlogy) (woff2 + 청크 서브셋 제공) | **O** | Black(900) 풀 **166 KB** / Bold(700) **164 KB** / 미러의 청크 서브셋 1개 ≈2.7 KB | Gmarket Sans 한글 + Montserrat 라틴 + M PLUS 2 일문. 꽉 찬 네모꼴 **지오메트릭**, **9웨이트(100–900)**. 2024년, 아직 흔하지 않음 |
| 3 | **어그로체 (SB Aggro)** | 샌드박스 자체 무료 — 공식 페이지 문구 "개인 및 기업 사용자를 포함한 모든 사용자에게 무료로 제공되며 **자유롭게 수정, 재배포가 가능**". 눈누 표에도 웹서비스/임베딩 허용. **라이선스 PDF 전문은 CID 인코딩이라 파싱 실패 → 조항 원문 미확인** | [sandbox.co.kr/font](https://sandbox.co.kr/font) — **TTF/OTF만, 공식 웹폰트 없음** → 직접 woff2 변환 필요 | **O** | 미러 기준 Bold **211 KB**, Medium **207 KB** | 각진 모서리 + 짧고 굵은 획. **공격적 스트리트/스포츠**. L/M/B 3웨이트 |
| 4 | **Gasoek One** | **OFL** | `next/font/google`, `subsets: ["korean"]` ✅ | **O** — METADATA.pb `korean, latin, latin-ext, menu` | TTF 1.06 MB, Google 청크 분할 → 실전송 Black Han Sans급 | 초헤비 **그래피티/포스터** 디스플레이. 개성 매우 강함, 400 단일. 본문 근처에 두면 시끄러움 |
| 5 | **Wanted Sans** | **OFL** | GitHub [wanteddev/wanted-sans](https://github.com/wanteddev/wanted-sans) — **jsDelivr 동적 서브셋 CSS 공식 제공** | **O** (동적 서브셋 전부 한글 포함) | 풀 웨이트 1개 **667 KB**(ExtraBlack 677 KB) / 동적 청크 ≈15 KB. 단, static split CSS 자체가 **305 KB** | 휴머니스트 뉴트럴 산스. 7웨이트 + VF. 품질 최상급이지만 **디스플레이 임팩트는 SUIT/Pretendard와 큰 차이 없음** |
| 6 | **Freesentation** | **OFL** | 공식 [freesentation.blog/freesentation](https://freesentation.blog/freesentation) → GitHub `Freesentation/freesentation` (TTF/VF zip) | **O** | **미확인** — woff2 미제공, 직접 변환 필요 | Noto Sans KR + Heebo 기반 리디자인. 9웨이트. **뉴트럴** — Pretendard와 차별점 약함 |
| 7 | **여기어때 잘난체** | 무료 상업 — 단 "저작권 안내와 라이선스 전문 포함" 조건부 임베딩 | [goodchoice.kr/font](https://www.goodchoice.kr/font/mobile) | **O** | **356 KB** | BI 파생. 꽉 찬 정사각 모듈, 굵고 각짐. 단일 굵기. 임팩트는 크지만 **여행/커머스 톤**이 붙어 있음 |
| 8 | **Gmarket Sans** | 무료 상업 — 수정·재배포 허용 명시 | [corp.gmarket.com/fonts](https://corp.gmarket.com/fonts/) | **O** | Bold **374 KB** | 3웨이트. Paperlogy의 원본. **커머스 톤**이 강하고 이미 과포화 |
| 9 | **LINE Seed KR** | **OFL 1.1** | [seed.line.me](https://seed.line.me/index_kr.html) (zip) | **O** | **미확인** | 둥글고 친근한 산고딕. **남성향 힙과 방향이 반대** |
| 10 | **MaruBuri** | **OFL 1.1** (NAVER) | 미러 [fonts-archive/MaruBuri](https://github.com/fonts-archive/MaruBuri) (woff2 + jsDelivr) | **O** | **미확인** | 부리(명조) 계열. brown breath식 **매거진 세리프** 방향을 원할 때의 유일한 무료 선택지 |

### 즉시 기각

| 폰트 | 기각 사유 |
|---|---|
| **티몬체(몬소리체)** | 라이선스가 "폰트를 고치거나 **다른 포맷으로 변형하는 것은 금지**". woff2 변환이 곧 위반 → **웹폰트로 쓸 수 없다.** 둥근 굴림 톤도 미스 |
| **Moneygraphy (토스)** | 저작권 비바리퍼블리카, **수정·재배포 금지**. Pixel/Rounded 두 종 모두 헤드라인 한글 28–50px에 부적합 |
| **Cafe24 슈퍼매직** | 매직펜 손글씨 골격 — 기각된 붓글씨 방향과 같은 축 |
| **양진체** | 레트로·키치 + Regular 단일 굵기. "적당한 말랑함"이 설계 목표라 남성향 힙과 정반대 |
| **Gasoek One**(4번) | 표에는 남기되 실사용 비추천 — 개성이 브랜드보다 커진다 |

---

## 2. Top 3

### 🥇 1순위 — **Black Han Sans** (`next/font/google`)

**왜**
- 톤 적중률이 가장 높다. 굵고 살짝 좁은 네모꼴 = **스포츠 신문 1면 / 포스터**. 다크 밴드 위 40px 크림으로 얹으면 MAXIM식 대비가 그대로 나온다.
- **도입 비용이 사실상 0이다.** `next/font/google` 한 줄. 다운로드·변환·서브셋팅·`public/fonts` 관리 전부 없음.
- **전송량이 후보 중 최소다.** Google이 88개 unicode-range 청크로 쪼개 놓아서, "오늘의 경기" 같은 짧은 문구는 해당 글자가 든 청크 몇 개(≈5.3 KB × 5~15)만 받는다. 166 KB 통짜를 받는 self-host 후보들보다 실전송이 적다.
- 라틴/숫자는 이미 `--font-cond`(Barlow Condensed)가 맡고 있다. Black Han Sans의 약한 라틴은 **애초에 안 쓰는 영역**이라 리스크가 아니다.

**얻는 것** — 헤드라인이 "굵은 본문"에서 "제목"으로 바뀐다. 지금 SUIT 700은 Pretendard와 골격이 비슷해 다크 밴드에서 크기만 커 보이지 성격이 안 바뀐다. Black Han Sans는 골격 자체가 달라서 크기를 안 키워도 위계가 선다.

**잃는 것**
- **굵기가 400 하나뿐이다.** 디스플레이를 "Black/Bold 두 단계"로 운영하는 시스템은 불가능 → 위계는 전적으로 크기·색·자간이 만들어야 한다(`type-accent.md`의 원칙과 일치하므로 실질 손실은 작음).
- **흔하다.** 배민 한나체 계열은 한국 웹에서 과포화다. "힙"이 아니라 "익숙"으로 읽힐 수 있다. 이건 Barlow Condensed 라틴 키커와의 조합, 버건디 다크 존, 자간 설계로 상쇄하는 수밖에 없다.
- 소문자 라틴이 약하다 → **한글 전용 슬롯으로 못 박아야 한다.**

---

### 🥈 2순위 — **Paperlogy Black (900)** (self-host)

**왜** — "시스템으로 키울 생각"이면 이쪽이다. 100~900 **9웨이트**라 디스플레이 Black / 서브헤드 ExtraBold / 캡션 Medium까지 한 패밀리로 내려갈 수 있다. OFL이라 서브셋·변환·재배포 전부 명확히 합법이고, 이미 `SUIT-700.woff2`를 `pyftsubset`으로 만든 파이프라인이 그대로 재사용된다. 2024년 폰트라 아직 안 흔하다.

**얻는 것** — 폰트 하나로 타입 시스템 전체를 통일할 여지. 라이선스 리스크 0.

**잃는 것** — 성격이 **중립적이다.** Gmarket Sans 파생이라 골격이 깔끔·현대적이지만 "각"이 약하다. 힙함을 폰트가 만들어주지 않으므로 크기 대비·다크 존·자간이 전부 일을 해야 한다. 그리고 Black 풀 woff2가 166 KB → **서브셋팅 필수**(KS X 1001 2,668자 기준 50~60 KB 예상).

---

### 🥉 3순위 — **어그로체 (SB Aggro) Bold** (self-host)

**왜** — 순수 톤 매치만 보면 **1등이다.** 각진 모서리, 짧고 굵은 획, 스포츠·스트리트 그 자체. 승부예측 서비스의 다크 밴드에 얹으면 가장 "센" 결과가 나온다.

**순위를 내린 이유 (2가지, 둘 다 실무적)**
1. **공식 웹폰트가 없다.** sandbox.co.kr은 TTF/OTF zip만 준다 → 직접 woff2 변환. 공식 페이지가 "자유롭게 수정, 재배포 가능"이라 변환 자체는 허용 범위지만, **라이선스 PDF 전문을 파싱하지 못해 조항 원문은 미확인**이다. 배포 전 `aggro-font@sandbox.co.kr` 확인 권장.
2. **어조가 매거진이 아니라 예능이다.** 유튜브 썸네일/자막 문맥이 강하게 붙어 있다. brown breath·무신사의 "조용한 힙"과는 결이 다르다. 톤을 의도적으로 더 공격적으로 밀 거라면 1순위로 올려도 된다 — 그건 폰트 문제가 아니라 브랜드 결정이다.

**보너스** — 매거진/세리프 쪽으로 방향을 틀 가능성이 조금이라도 있으면 **MaruBuri**(OFL, NAVER)를 같이 목업해볼 것. brown breath 톤에 가장 가까운 무료 한글은 이것뿐이다.

---

## 3. 1순위 적용 코드 (그대로 붙이면 됨)

### 3-1. `app/layout.tsx`

```ts
import { Nanum_Brush_Script, Barlow_Condensed, Black_Han_Sans } from "next/font/google"

// 한글 디스플레이 (--font-display): 다크 밴드 헤드라인 / 섹션 헤드 / 푸터 브랜드.
// subsets: ["korean"] 필수 — 이걸 빼면 한글 글리프를 아예 안 받아온다(아래 4절 참조).
// Google이 88개 unicode-range 청크로 분할 배포 → 화면에 실제 쓰인 글자의 청크(≈5.3 KB)만 전송.
// preload: false — 한글 서브셋은 청크가 88개라 preload 시 링크 태그가 폭발한다.
//                  헤딩 전용이라 LCP 경로에서 빼도 무방 (SUIT와 동일 정책).
// display: "swap" — 폴백으로 먼저 그린 뒤 교체. 400 단일 굵기라 폴백 메트릭 차이가 커서
//                   "optional"로 두면 첫 방문에 아예 안 뜨는 경우가 잦다.
const blackHanSans = Black_Han_Sans({
  weight: "400",
  subsets: ["korean"],
  variable: "--font-display",
  display: "swap",
  preload: false,
})
```

그리고 `<html>`(또는 `<body>`)의 className에 기존 폰트 변수들과 나란히 추가:

```tsx
<html
  lang="ko"
  className={`${pretendard.variable} ${suit.variable} ${barlowCondensed.variable} ${blackHanSans.variable} ${nanumBrush.variable}`}
>
```

### 3-2. `app/a-tokens.css` (또는 `globals.css`의 `@theme`)

```css
:root {
  /* 역할 변수 — type-accent.md 계약. 실제 파일명은 여기서만 안다. */
  --font-display: var(--font-display-raw, "Black Han Sans"), var(--font-suit), var(--font-pretendard), sans-serif;
}

@layer components {
  /* 다크 밴드 헤드라인 — "오늘의 메인 이벤트" / "오늘의 경기" */
  .gn-display {
    font-family: var(--font-display);
    font-weight: 400;          /* Black Han Sans는 400이 곧 Black이다. 700 지정 금지(가짜 볼드) */
    font-size: clamp(28px, 5vw, 44px);
    line-height: 1.12;
    letter-spacing: -0.02em;   /* 한글 강조는 자간을 '당긴다' — 벌리지 않는다 */
    color: var(--gn-bg-100, #f5efe7);
    -webkit-font-smoothing: antialiased;
  }

  /* 라이트 존 섹션 헤드 — 한 단계 작고 조용하게 */
  .gn-display--section {
    font-size: clamp(22px, 3.2vw, 30px);
    color: var(--gn-ink-1, #16141a);
    letter-spacing: -0.015em;
  }
}
```

> ⚠️ **`font-weight: bold`를 절대 얹지 말 것.** 400 단일 굵기라 브라우저가 합성 볼드(synthetic bold)를 만들어 획이 뭉갠다. 굵기를 더 원하면 폰트가 아니라 **크기**를 키운다.

### 3-3. 검증 (머지 전 필수 2단계)

```bash
# 1) 빌드 산출물에 한글 unicode-range 청크가 실제로 들어갔는지
pnpm build
grep -o "U+AC00" .next/static/css/app/layout.css | head -1   # 출력이 있어야 정상

# 2) 렌더 확인 — 폴백이 아닌 실제 적용인지
pnpm exec playwright test e2e/home.spec.ts --project=chromium
```

브라우저에서 최종 확인:
```js
// devtools console — 실제 적용 폰트가 무엇인지
getComputedStyle(document.querySelector('.gn-display')).fontFamily
// document.fonts.check 로 로드 여부
document.fonts.check('400 40px "Black Han Sans"')  // true 여야 함
```

### 3-4. 2순위(Paperlogy)를 고를 경우의 self-host 절차

```bash
# 1) 공식 zip (OFL — 서브셋/변환/재배포 전부 허용)
curl -L -o paperlogy.zip \
  "https://github.com/Freesentation/paperlogy/raw/refs/heads/main/Paperlogy-1.001.zip"

# 2) Black(900)만 KS X 1001 한글로 서브셋 → woff2 (SUIT-700 만들 때와 동일 파이프라인)
pip install fonttools brotli
pyftsubset Paperlogy-9Black.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+AC00-D7A3,U+3000-303F,U+FF00-FFEF" \
  --layout-features='*' --flavor=woff2 \
  --output-file=public/fonts/Paperlogy-900.woff2
```

```ts
const paperlogy = localFont({
  src: "../public/fonts/Paperlogy-900.woff2",
  display: "swap",
  variable: "--font-display",
  weight: "900",
  preload: false,
})
```

> 미러 [`fonts-archive/Paperlogy`](https://github.com/fonts-archive/Paperlogy)가 woff2와 청크 서브셋(`subsets/Paperlogy-9Black.subset.N.woff2`, 청크당 ≈2.7 KB)을 jsDelivr로 이미 서빙한다. 급하면 그걸 써도 되지만 **외부 CDN 의존 + CSP `font-src`에 `cdn.jsdelivr.net` 추가**가 따라오므로(운영 CSP·Report-Only 둘 다 갱신 필요) self-host를 권한다.

---

## 4. ⚠️ 반복 금지 — `subsets` 함정의 실제 원인

`app/layout.tsx:54`의 경고는 원인을 한 칸 잘못 짚고 있다. 정확히는 이렇다.

- google/fonts의 `ofl/nanumbrushscript/METADATA.pb`를 직접 확인한 결과 **`subsets: korean`은 존재한다.** 폰트가 한글을 안 주는 게 아니다.
- 실제 원인은 호출부의 `subsets: ["latin"]`이다. `next/font/google`은 **선언한 서브셋의 unicode-range 청크만** 내려받아 self-host한다. `latin`만 선언하면 한글 청크는 빌드 산출물에 아예 없고, 브라우저는 조용히 폴백 산세리프로 렌더한다. 에러도 경고도 안 난다.

**그래서 규칙은 "이 폰트는 위험하다"가 아니라 아래 3줄이다.**

1. 한글을 쓸 폰트는 **반드시 `subsets: ["korean"]`을 선언**한다.
2. 선언 전에 `https://raw.githubusercontent.com/google/fonts/main/ofl/<fontdir>/METADATA.pb`를 열어 `subsets`에 `korean`이 있는지 눈으로 확인한다. (확인 완료: Black Han Sans ✅ / Gasoek One ✅ / Nanum Brush Script ✅)
3. 빌드 후 **3-3의 `grep "U+AC00"`을 통과해야 머지**한다. 눈으로 "한글 나오네"는 폴백과 구분이 안 된다.

`--font-brush`는 현재 라틴 전용 장식으로 잠겨 있으므로(`type-accent.md` 규칙) 지금 설정 그대로 두는 게 맞다. 다만 주석 문구는 "next/font가 latin만 제공"이 아니라 **"우리가 latin만 선언했다"**로 정정할 것.

---

## 5. 붓글씨 계열이 왜 안 되는가 — 그리고 그 자리를 무엇이 메우는가

이미 결론이 난 사안이라 설득은 생략한다. 다만 **붓글씨가 하던 일이 뭐였는지**는 짚고 넘어가야 대체가 성립한다.

붓글씨가 맡던 역할은 "여기가 사람이 만든 브랜드다"라는 **온기 신호** 하나였다. 문제는 그 신호가 한글 획의 불규칙성으로 전달된다는 점이고, 불규칙성은 **크기를 키울수록 통제 불능**이 된다. 28~50px 다크 밴드에서 붓글씨는 온기가 아니라 노이즈가 되고, 배경 대비가 강할수록 획 끝의 갈필이 지저분하게 읽힌다. 게다가 다크 존·버건디·콘덴스드 라틴이라는 나머지 시스템은 전부 "차갑고 정확한" 축인데 붓글씨만 반대 축이라, 한 화면에 같이 놓이면 둘 다 약해진다.

**대체는 폰트 교체가 아니라 역할 재배치다.**

- **온기 신호** → 폰트가 아니라 **색**이 맡는다. 크림(#f5efe7)이 다크(#16141a) 위에 넓게 깔리는 것만으로 인쇄물의 종이 느낌이 난다. 붓글씨보다 조용하고 훨씬 안정적이다.
- **"사람 손" 느낌** → **크기 대비**가 맡는다. 키커 12px과 헤드라인 44px의 3.7배 격차는 자동 생성 UI가 만들지 못하는 리듬이고, 그게 곧 "누가 편집했다"는 신호다(`type-accent.md` 규칙 1).
- **브랜드 각인** → **골격이 다른 디스플레이 폰트**가 맡는다. Black Han Sans의 꽉 찬 네모꼴은 Pretendard 본문과 명백히 다른 종(種)이라, 붓글씨가 하던 "여기가 브랜드다"를 노이즈 없이 대신한다.
- 기존 `--font-brush`(Nanum Brush Script)는 **라틴 전용 장식으로 잠긴 채 유지**한다. 로고·푸터 등 최대 2곳. 한글 헤드라인에는 어떤 경우에도 올리지 않는다.

---

## 6. 근거 URL

- Wanted Sans — https://github.com/wanteddev/wanted-sans (OFL 명시) / 웹폰트 문서 `packages/wanted-sans/documentation/webfonts/README.md`
- Paperlogy 공식 — https://freesentation.blog/paperlogyfont (OFL 명시, TTF/OTF만 배포) / 미러 https://github.com/fonts-archive/Paperlogy
- Freesentation 공식 — https://freesentation.blog/freesentation (OFL, 9웨이트 + VF)
- 어그로체 공식 — https://sandbox.co.kr/font / 라이선스 PDF https://sandbox.co.kr/assets/images/pc/aggro/SB_Aggro_Font_license.pdf (**전문 파싱 실패 — 미확인**) / 눈누 라이선스 표 https://noonnu.cc/font_page/738
- Black Han Sans — https://raw.githubusercontent.com/google/fonts/main/ofl/blackhansans/METADATA.pb (OFL, `subsets: korean`) / 원저작 https://github.com/zesstype/Black-Han-Sans
- Gasoek One — https://raw.githubusercontent.com/google/fonts/main/ofl/gasoekone/METADATA.pb (OFL, `subsets: korean`)
- Nanum Brush Script — https://raw.githubusercontent.com/google/fonts/main/ofl/nanumbrushscript/METADATA.pb (`subsets: korean` **존재함**)
- Gmarket Sans — https://corp.gmarket.com/fonts/
- 여기어때 잘난체 — https://www.goodchoice.kr/font/mobile
- LINE Seed — https://seed.line.me/index_kr.html (OFL 1.1)
- MaruBuri — https://github.com/fonts-archive/MaruBuri (NAVER, OFL 1.1)
- 티몬체 — https://noonnu.cc/font_page/72 (포맷 변형 금지 → 웹폰트 불가)
- 토스 Moneygraphy — https://toss.im/moneygraphy-font (수정·재배포 금지)
- 카페24 폰트 — https://fonts.cafe24.com/
- 양진체 — https://typedia.kr/font/yangjin/

**용량 실측 방법** — 각 CDN에 HTTP GET 후 `size_download` 측정(2026-07-28). Google Fonts 청크 수는 Chrome UA로 `fonts.googleapis.com/css2` 응답의 `@font-face` 개수를 센 값(88개).

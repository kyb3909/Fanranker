# 타이포 액센트 시스템 — "포인트를 주는 법"

> 시안 A(매치데이) 채택 후속. **폰트 파일 선정이 아니라, 고른 폰트로 무엇을 하는가**를 정한다.
> 폰트는 역할 변수로만 참조한다 — `--font-display`(한글 디스플레이) / `--font-cond`(라틴·숫자 콘덴스드) /
> `--font-sans`(본문) / `--font-brush`(브랜드 붓글씨, 잠금). 실제 파일은 다른 트랙에서 확정된다.
>
> 톤 기준: 무신사 / brown breath / MAXIM. **저채도 · 대비 · 여백 · 대문자 한 곳의 긴장.**
> 힙함은 폰트가 만드는 게 아니라 **크기 차이와 자간과 절제**가 만든다.

---

## 0. 원칙 세 줄

1. **포인트는 "다른 폰트"가 아니라 "다른 크기"다.** 한 화면에서 제일 큰 것과 제일 작은 것의 비율이 4배 이상 벌어져야 매거진처럼 읽힌다. 폰트를 바꿔서 포인트를 주면 화면이 시끄러워지고, 크기를 벌려서 포인트를 주면 화면이 조용해진다.
2. **라틴은 벌리고, 한글은 조인다.** 자간을 넓히는 연출(`letter-spacing: .2em`)은 **라틴 대문자 전용**이다. 한글에 넓은 자간을 주면 낱자가 분해되어 읽힌다. 한글 강조는 반대로 **웨이트를 올리고 자간을 당긴다**.
3. **강조는 화면당 예산제다.** 헤드라인 강조 1회, 큰 숫자 1개, 라임(LIVE) 1곳, 붓글씨 최대 2곳. 예산을 넘기면 전부 무효가 된다.

### 폰트 역할 변수

| 변수 | 역할 | 쓰는 곳 |
|---|---|---|
| `--font-cond` | 라틴 콘덴스드 + 숫자 | 키커, 카운트다운, 스코어, 시각, 리그 코드, 플레이트 |
| `--font-display` | 한글 디스플레이 | 섹션 헤드, 히어로 헤드라인 |
| `--font-sans` | 본문 | 그 외 전부 |
| `--font-brush` | 브랜드 붓글씨 | **잠금** — 로고 / 섹션 헤드 2곳 / 푸터. 그 이상 금지 |

---

## 규칙 1 — `.gn-kicker` : 키커 / 아이브로우

**언제** — 섹션이나 블록의 정체를 라틴 대문자 한 단어로 선언할 때. `MATCHDAY`, `TOP STORY`, `EXPLORE`, `TODAY'S PICK`, `LIVE`, `HOME / DRAW / AWAY`, 레일의 `스포츠 / 라이프` 그룹 라벨.

**어떻게 보이는가**

- 크기로 겨루지 않는다. **11–13px에 고정**하고, 존재감은 전부 자간(`.2em`)이 만든다.
- 짝을 이루는 헤드라인보다 **최소 2.4배 작아야** 한다. 키커가 커지는 순간 헤드라인이 죽는다.
- 자간을 벌리면 마지막 글자 뒤에 자간만큼의 빈 공간이 남는다 → `margin-right: -.2em`으로 회수한다. 이걸 안 하면 baseline 정렬한 락업에서 간격이 어긋나 보인다.
- 색은 존이 정한다. 다크 = `--gn-bg-100`(연분홍, 크림보다 한 단계 물러남) / 라이트 = 회색 `--gn-ink-3` 기본, 버건디는 클릭 가능한 키커에만.
- **한글 금지 슬롯이다.** 한글 보조어("킥오프 90분 전")가 붙어야 하면 별도 `.gn-kicker-ko`로 자간 0·본문 폰트·700에서 옆에 붙인다.

```css
@layer components {
  .gn-kicker {
    font-family: var(--font-cond), var(--font-sans), sans-serif;
    font-size: 12px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    margin-right: -0.2em; /* 마지막 글자 뒤 자간 회수 */
    color: var(--gn-ink-3, #8d8794);
    font-variant-numeric: tabular-nums;
  }
  /* 다크 존 리드 키커 — 히어로/밴드 상단 */
  .gn-kicker--lead {
    font-size: 13px;
    color: var(--gn-bg-100);
  }
  /* 라이트 존 조용한 라벨 — 레일 그룹, 광고 슬롯 */
  .gn-kicker--quiet {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    margin-right: -0.18em;
  }
  /* 행동이 붙은 키커 — 클릭 가능한 섹션 헤드 */
  .gn-kicker--act {
    color: var(--wc-burgundy, #961e37);
  }
  /* LIVE — 라임은 사이트 전체에서 이 조합 1곳 */
  .gn-kicker--live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--gn-live);
    letter-spacing: 0.14em;
    margin-right: -0.14em;
  }
  /* 한글 보조어 — 키커 옆에 붙되 자간은 0 */
  .gn-kicker-ko {
    font-family: var(--font-sans), sans-serif;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: var(--gn-cream-dim, #8d8794);
  }
}
```

---

## 규칙 2 — `.gn-hl` : 헤드라인 안의 핵심어 강조 (한글 이탤릭 대체)

**언제** — 15자가 넘는 한글 제목에서 사람이 실제로 스캔하는 단어(선수명·구단명·금액·동사)를 하나만 살릴 때. 히어로 헤드라인, 피드 카드 제목, 위젯 질문.

**문제** — 한글에는 이탤릭이 없다. 가짜 이탤릭(skew)은 자소를 무너뜨리고, 밑줄은 링크 시그널과 충돌한다. 그래서 **3단 사다리**로 대체한다. 위로 갈수록 강하고, **한 헤드라인에 하나만** 쓴다.

**어떻게 보이는가**

- **L1 웨이트 점프** (기본값, 90%의 경우) — 주변 700 → 강조어 900. 한글은 굵어지면 글자가 벌어져 보이므로 **자간을 −0.04em 당겨서** 덩어리로 뭉친다. 색은 건드리지 않는다. 이게 가장 스트리트하다.
- **L2 색** — 버건디. **라이트 존 전용.** 다크 존에서 버건디는 크림 대비가 안 나와 오히려 흐려진다. 다크에서는 L1 또는 L3만.
- **L3 하이라이트 면** — 형광펜 대체물. 글자를 관통하는 연한 버건디 틴트 밴드. 밑줄이 아니라 **면**이므로 한쪽 액센트 보더 금지 규칙과 충돌하지 않는다. 줄바꿈에서 끊기지 않게 `box-decoration-break: clone` 필수.
- **강조어는 최대 6자.** 두 군데 강조하면 강조가 0개가 된다.

```css
@layer components {
  /* L1 — 웨이트 점프 (기본) */
  .gn-hl {
    font-weight: 900;
    letter-spacing: -0.04em; /* 굵어진 만큼 당겨서 덩어리로 */
  }
  /* L2 — 색 (라이트 존 전용) */
  .gn-hl--ink {
    color: var(--wc-burgundy, #961e37);
  }
  /* L3 — 하이라이트 면 (형광펜 대체) */
  .gn-hl--mark {
    background-image: linear-gradient(
      180deg,
      transparent 56%,
      var(--gn-bg-100) 56%,
      var(--gn-bg-100) 96%,
      transparent 96%
    );
    padding-inline: 0.1em;
    margin-inline: -0.1em;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  /* 다크 존에서는 틴트를 반투명 버건디로 — 연분홍 면은 다크에서 너무 튄다 */
  .gn-on-dark .gn-hl--mark {
    background-image: linear-gradient(
      180deg,
      transparent 56%,
      rgba(150, 30, 55, 0.62) 56%,
      rgba(150, 30, 55, 0.62) 96%,
      transparent 96%
    );
  }
  /* 헤드라인 컨테이너 — 한글 큰 글자는 항상 음수 자간 + keep-all */
  .gn-head {
    font-family: var(--font-display), var(--font-sans), sans-serif;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.26;
    word-break: keep-all;
    text-wrap: balance;
  }
}
```

---

## 규칙 3 — `.gn-stat` : 큰 숫자가 주인공이 되는 순간

**언제** — 카운트다운, 스코어, 적중률, 참여자 수, 경기 수. **숫자가 문장의 목적어가 아니라 주어일 때만** 쓴다. 본문 안에 섞인 숫자는 여기 해당 없음(→ 규칙 7).

**어떻게 보이는가 — 종속 비율 고정**

값을 1로 두고 나머지가 전부 `em`으로 매달린다. `.gn-stat`의 크기 하나만 바꾸면 세트 전체가 비례로 움직인다.

| 파트 | 비율 | 웨이트 상한 | 이유 |
|---|---|---|---|
| 값 `__v` | **1** | 800 | 주인공 |
| 구분자 `__sep` (`:` `-`) | 0.45 | 600 | 콜론이 굵으면 숫자를 밀어낸다 |
| 단위 `__u` (초/점/%/경기) | 0.42 | **600 고정** | 단위가 값과 같은 무게면 숫자가 안 튄다 |
| 라벨 `__k` (키커) | 0.3 | 800 | 자간으로만 존재 |

- **정렬은 baseline.** center 정렬하면 단위가 값 가운데에 떠서 인포그래픽처럼 보인다 — 매거진 톤이 아니다.
- **`tabular-nums` 필수.** 초 단위로 갱신되는 카운트다운에서 프로포셔널 숫자를 쓰면 1초마다 폭이 흔들려 싸구려로 보인다. 이미 겪은 문제다.
- 승패 대비는 **색이 아니라 불투명도**로 — 승자 1.0 / 패자 0.55. 색을 쓰면 버건디 예산을 갉아먹는다.

```css
@layer components {
  .gn-stat {
    --gn-stat-size: 34px;
    display: inline-flex;
    align-items: baseline;
    gap: 0.18em;
    font-family: var(--font-cond), var(--font-sans), sans-serif;
    font-size: var(--gn-stat-size);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
    line-height: 1;
  }
  .gn-stat--xl { --gn-stat-size: 40px; }
  .gn-stat--lg { --gn-stat-size: 28px; }
  .gn-stat--sm { --gn-stat-size: 20px; }

  .gn-stat__v {
    font-size: 1em;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .gn-stat__sep {
    font-size: 0.45em;
    font-weight: 600;
    letter-spacing: 0;
    opacity: 0.72;
    margin-inline: -0.02em;
  }
  .gn-stat__u {
    font-size: 0.42em;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .gn-stat__k {
    font-size: 0.3em;
    font-weight: 800;
    letter-spacing: 0.2em;
    margin-right: -0.2em;
    text-transform: uppercase;
    opacity: 0.8;
  }
  /* 승패 — 색 대신 농도 */
  .gn-stat--win  { opacity: 1; }
  .gn-stat--lose { opacity: 0.55; }

  @media (max-width: 768px) {
    .gn-stat     { --gn-stat-size: 28px; }
    .gn-stat--xl { --gn-stat-size: 32px; }
  }
}
```

---

## 규칙 4 — `.gn-on-dark` : 다크 존 광학 보정

**언제** — 다크 3존(메인 이벤트 밴드 / 픽 타일 / 푸터) 안의 모든 텍스트 컨테이너에.

**문제 (실제로 겪은 것)** — 밝은 글자가 어두운 배경 위에 놓이면 광 번짐(halation)으로 획이 **가늘어 보이고** 글자 사이가 **메워져 보인다.** 붓글씨 로고가 다크 푸터에서 뭉개져 `text-shadow: 0.5px 0 currentColor`로 획을 보강해야 했던 게 그 증상이다. 라이트 존에서 완벽했던 타이포를 그대로 다크에 옮기면 반드시 뭉개진다.

**보정 4종 — 기계적으로 적용한다**

| # | 보정 | 값 | 이유 |
|---|---|---|---|
| 1 | 웨이트 +100 | 본문 400→500, 라벨 600→700 | 얇아 보이는 걸 되돌림 |
| 2 | 자간 +0.005em | 컨테이너에 한 번 | 메워져 보이는 걸 되돌림 |
| 3 | 획 보강 | `text-shadow: .5px 0 currentColor` | **blur 0.** 그림자가 아니라 서브픽셀 획 두께 보정이다. 붓글씨·얇은 디스플레이에만 |
| 4 | 순백 금지 | `#fff` → `--gn-cream` / 부속은 `--gn-cream-dim` | 순백은 halation이 가장 심하고 눈이 부시다 |

**구현은 토큰 릴레이로.** 자손 선택자로 후려치면(`.gn-on-dark p { … }`) 예외 처리가 지옥이 된다. 대신 컨테이너가 변수를 갈아끼우고 `.gn-body` / `.gn-label`이 그 변수를 읽는다.

```css
@layer components {
  .gn-on-dark {
    --gn-w-body: 500;   /* 라이트에선 400 */
    --gn-w-label: 700;  /* 라이트에선 600 */
    letter-spacing: 0.005em;
    color: var(--gn-cream);
  }
  .gn-body  { font-weight: var(--gn-w-body, 400); }
  .gn-label { font-weight: var(--gn-w-label, 600); }
  .gn-dim   { color: var(--gn-cream-dim, #8d8794); }

  /* 얇은 획 보강 — 붓글씨/얇은 디스플레이 전용. blur 없음 */
  .gn-stroke-fix { text-shadow: 0.5px 0 currentColor; }

  /* 라이트 존에서 큰 헤드라인은 반대로 당긴다 */
  .gn-on-light .gn-head { letter-spacing: -0.028em; }
}
```

> 다크 존에서는 **L2(버건디 색 강조)를 쓰지 않는다.** 버건디 `#961e37`은 `--gn-night` 위에서 대비가 3:1 아래로 떨어져, 강조가 아니라 "흐린 글자"로 읽힌다. 다크의 강조는 L1(웨이트) 또는 L3(반투명 버건디 면).

---

## 규칙 5 — `.gn-plate` : 세로 플레이트 (금지된 액센트 보더의 합법 대체물)

**언제** — 히어로/배너의 좌측에 블록 정체를 고정 표기할 때. `TOP STORY`, `MATCHDAY`, `LIVE NOW`. 캐러셀이 넘어가도 유지되는 고정 장식.

**왜 이게 액센트 보더 대신인가** — 이건 3px짜리 장식선이 아니라 **74–118px 폭의 면**이다. 콘텐츠를 실제로 밀어내고(`padding-left`), 그 안에 라벨이 들어가고, 사선(`skewX(-8deg)`)으로 스포츠 포스터 문법을 가져온다. 위계를 "선"이 아니라 "면적"으로 만든다는 점에서 금지 패턴과 근본이 다르다.

**어떻게 보이는가**

- 버건디 세로 그라데이션, `skewX(-8deg)`, 컨테이너 밖으로 왼쪽 −32~−36px 물려서 화면 끝까지 흐르게.
- 라벨은 `rotate(90deg)` + 자간 `.34em`. **회전 텍스트는 라틴 대문자만.** 한글은 세로 회전 시 자소 균형이 무너진다.
- 라벨은 플레이트의 skew를 상쇄(`skewX(8deg)`)해서 글자 자체는 기울지 않게 한다 — 기울어진 면 위의 곧은 글자가 포스터 문법이다.
- 모바일에서 면은 유지, 라벨만 죽인다(면이 사라지면 레이아웃 정체성이 사라짐).

```css
@layer components {
  .gn-plate {
    position: absolute;
    inset-block: 0;
    left: -36px;
    width: 118px;
    opacity: 0.92;
    background: linear-gradient(180deg, var(--wc-burgundy, #961e37), var(--gn-bg-700));
    transform: skewX(-8deg);
    pointer-events: none;
  }
  .gn-plate__label {
    position: absolute;
    top: 24px;
    left: 54px;
    transform: skewX(8deg) rotate(90deg);
    transform-origin: left top;
    white-space: nowrap;
    font-family: var(--font-cond), var(--font-sans), sans-serif;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--gn-cream);
    opacity: 0.9;
  }
  @media (max-width: 768px) {
    .gn-plate { left: -32px; width: 74px; }
    .gn-plate__label { top: 20px; left: 42px; font-size: 15px; }
  }
}
```

---

## 규칙 6 — `.gn-lockup` : 섹션 헤드 락업 (라틴 키커 + 한글 디스플레이 + 숫자 메타)

**언제** — 모든 주요 섹션의 머리. 지금 사이트에서 `MATCHDAY / 오늘의 메인 이벤트 / 7.27 SUN`, `오늘의 경기 / 4 MATCHES`가 이 형태다.

**어떻게 보이는가**

- **한 줄, baseline 정렬.** 순서 고정: `[라틴 키커] [한글 디스플레이] ……… [숫자 메타 →우측]`.
- 세 요소가 서로 다른 폰트·크기·색을 갖되 **바닥선 하나로 묶인다.** 이 바닥선이 매거진 헤드의 핵심이고, 여기가 어긋나면 아무리 좋은 폰트를 써도 아마추어처럼 보인다.
- 회전은 **브랜드 붓글씨에만, −1.5°~−1° 이내.** 그 외 요소 회전 전면 금지.
- **모바일 생존 순서: 키커 > 한글 제목 > 숫자 메타.** 좁아지면 메타부터 죽인다(메타는 대체 정보가 어딘가에 또 있다).

```css
@layer components {
  .gn-lockup {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 16px;
  }
  .gn-lockup__title {
    font-family: var(--font-display), var(--font-sans), sans-serif;
    font-size: 32px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.03em;
  }
  /* 브랜드 붓글씨를 쓰는 헤드에만 — 회전은 여기까지가 전부 */
  .gn-lockup__title--brush {
    font-family: var(--font-brush), cursive;
    font-weight: 400;
    letter-spacing: 0;
    transform: rotate(-1.2deg);
  }
  .gn-lockup__meta {
    margin-left: auto;
    font-family: var(--font-cond), var(--font-sans), sans-serif;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.1em;
    font-variant-numeric: tabular-nums;
    color: var(--gn-cream-dim, #8d8794);
  }
  @media (max-width: 768px) {
    .gn-lockup__title { font-size: 26px; }
    .gn-lockup__meta { display: none; }
  }
}
```

---

## 규칙 7 — `.gn-inline-num` : 문장 속 숫자 스왑

**언제** — CTA·본문·칩처럼 **문장이 주인공이고 숫자가 그 안에 낀** 경우. `오늘 13경기 픽 걸러 가기`, `댓글 4 · 추천 12`, `[4] 월드컵 이벤트 예측 내역이`.

**왜 별도 규칙인가** — 이걸 `.gn-stat`으로 처리하면 CTA 버튼 안에서 숫자가 혼자 거대해져 문장이 깨진다. 반대로 아무것도 안 하면 본문 숫자가 밋밋해서 "13경기"가 안 읽힌다. 정답은 **폰트만 바꾸고 크기는 거의 그대로.**

**어떻게 보이는가**

- 콘덴스드로 스왑 + `tabular-nums` + `font-size: 1.06em`. **콘덴스드는 같은 pt에서 시각적으로 작아 보이므로** 6%를 보정해야 본문과 같은 크기로 읽힌다. 이 보정을 빼먹으면 숫자만 쪼그라들어 보인다.
- 웨이트는 주변 문장보다 딱 한 단계 위(700 → 800). 두 단계 올리면 숫자가 문장을 이탈한다.
- 색은 건드리지 않는다. 문장 속 숫자에 버건디를 칠하면 링크처럼 보인다.

```css
@layer components {
  .gn-inline-num {
    font-family: var(--font-cond), var(--font-sans), sans-serif;
    font-size: 1.06em; /* 콘덴스드 시각 축소 보정 */
    font-weight: 800;
    letter-spacing: 0.01em;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
  }
  /* 문장형 CTA 자체 */
  .gn-cta-copy {
    font-family: var(--font-sans), sans-serif;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.02em;
    word-break: keep-all;
  }
}
```

---

## Before → After (현재 사이트 실제 문구)

### ① 섹션 헤드 — "오늘의 메인 이벤트"

**Before** — 키커·제목·날짜가 각자 인라인 스타일로 크기와 자간을 들고 있다. 바닥선이 우연히 맞는다.

```html
<span class="gn-num" style="letter-spacing:.2em">Matchday</span>
<h2 style="font-family:var(--font-brush); font-size:40px">오늘의 메인 이벤트</h2>
<span class="gn-num" style="letter-spacing:.1em">7.27 SUN</span>
```

**After** — 락업이 바닥선과 비율을 보장한다. 키커는 12px에서 절대 자라지 않고, 한글 보조어("킥오프 90분 전")는 자간 0으로 분리된다.

```html
<div class="gn-lockup gn-on-dark">
  <span class="gn-kicker gn-kicker--lead">Matchday</span>
  <span class="gn-kicker-ko">킥오프 90분 전</span>
  <h2 class="gn-lockup__title gn-lockup__title--brush gn-stroke-fix">오늘의 메인 이벤트</h2>
  <span class="gn-lockup__meta">7.27 SUN</span>
</div>
```

> 달라지는 것: 붓글씨가 다크에서 획 보강을 받고(`gn-stroke-fix`), 키커는 화면 폭이 변해도 자라지 않고, 모바일에서 `7.27 SUN`이 자동으로 빠진다.

---

### ② 카운트다운 — "다음 킥오프까지 07:54:57"

**Before** — 라벨 12.5px, 숫자 34px. 콜론이 숫자와 같은 굵기라 `07:54:57`이 7덩어리로 흩어져 읽힌다.

```html
<span class="text-[12.5px] font-bold">다음 킥오프까지</span>
<span class="gn-num text-[34px] font-extrabold">07:54:57</span>
```

**After** — 라벨을 키커로 강등해 숫자를 띄우고, 콜론을 0.45배로 눌러 `07 54 57` 세 덩어리로 읽히게 만든다. 시각적 사이즈 점프가 12→40px, **3.3배**.

```html
<div class="gn-on-dark">
  <span class="gn-kicker">Next Kickoff</span>
  <span class="gn-stat gn-stat--xl">
    <b class="gn-stat__v">07</b><i class="gn-stat__sep">:</i><b
      class="gn-stat__v">54</b><i class="gn-stat__sep">:</i><b class="gn-stat__v">57</b>
  </span>
</div>
```

> 한글 라벨을 남기고 싶으면 `.gn-kicker` 대신 `.gn-kicker-ko`로 "다음 킥오프까지"를 쓴다 — 자간이 0이 되어 낱자 분해를 피한다.

---

### ③ 경기 수 — "13 MATCHES"

**Before** — 통째로 13px 콘덴스드. 숫자 13과 단어 MATCHES가 같은 크기여서 "몇 경기인지"가 눈에 안 들어온다.

```html
<span class="gn-num text-[13px] font-semibold uppercase">13 matches</span>
```

**After** — 숫자를 값으로, MATCHES를 단위로 종속시킨다. 전체 폭은 오히려 비슷한데 **13이 먼저 읽힌다.**

```html
<span class="gn-stat gn-stat--lg gn-on-dark">
  <b class="gn-stat__v">13</b><span class="gn-stat__u">MATCHES</span>
</span>
```

---

### ④ CTA — "오늘 13경기 픽 걸러 가기"

**Before** — 전부 15px 본문 웨이트 800. 숫자가 문장에 파묻혀 "13"이 안 보인다.

```html
<span class="text-[15px] font-extrabold">오늘 13경기 픽 걸러 가기</span>
```

**After** — 숫자만 콘덴스드로 스왑(크기 유지), 핵심 동사구에 L1 웨이트 점프. **색은 안 쓴다** — 크림 배경 위 다크 텍스트 버튼이라 색을 더하면 버튼이 시끄러워진다.

```html
<span class="gn-cta-copy">
  오늘 <span class="gn-inline-num">13</span>경기 <span class="gn-hl">픽 걸러</span> 가기
</span>
```

---

### ⑤ 헤드라인 강조 — "아스날, 레알 마드리드 윙어 비니시우스 주니어 영입 탐색"

**Before** — 31px / 900 / 균일. 27자가 전부 같은 무게라 스캔이 안 되고, 두 줄이 벽처럼 보인다.

```html
<h3 class="text-[31px] font-black">아스날, 레알 마드리드 윙어 비니시우스 주니어 영입 탐색</h3>
```

**After (다크 존 — 히어로)** — 다크에서는 버건디 색 강조가 안 먹으므로 L3 반투명 면. 강조는 `영입 탐색` **4자 하나뿐.**

```html
<h3 class="gn-head gn-on-dark text-[31px]">
  아스날, 레알 마드리드 윙어 비니시우스 주니어 <span class="gn-hl gn-hl--mark">영입 탐색</span>
</h3>
```

**After (라이트 존 — 피드 카드)** — 선수명을 L1 웨이트로만. 카드가 수십 장 쌓이는 피드에서는 면(L3)을 쓰면 화면이 얼룩덜룩해진다. **피드는 L1 전용.**

```html
<h3 class="gn-head text-[17px]">
  아스날, 레알 마드리드 윙어 <span class="gn-hl">비니시우스</span> 영입 탐색
</h3>
```

---

### ⑥ 푸터 슬로건 — "그깟 공놀이에 진심인 팬들의 놀이터"

**Before** — 14px, `--gn-cream-dim` 단색. 다크 위 얇은 획이 halation으로 뭉개져 실제보다 흐리게 읽힌다.

```html
<p class="mt-3.5 text-[14px]" style="color:var(--gn-cream-dim)">그깟 공놀이에 진심인 팬들의 놀이터</p>
```

**After** — 컨테이너 광학 보정(웨이트 +100, 자간 +0.005em) + 브랜드 단어 하나만 L1. 슬로건은 문장 전체가 브랜드이므로 면(L3)까지 가면 과하다.

```html
<div class="gn-on-dark">
  <p class="gn-body gn-dim mt-3.5 text-[14px]">
    그깟 공놀이에 <span class="gn-hl">진심인</span> 팬들의 놀이터
  </p>
</div>
```

> 바로 위 붓글씨 로고 `그깟 공놀이`에는 `.gn-stroke-fix`가 이미 붙어 있어야 한다. 붓글씨는 획이 가장 얇아 다크 halation에 제일 취약하다.

---

## 🚫 금지 목록

### 절대 금지 (브랜드 파괴)

| # | 금지 | 이유 |
|---|---|---|
| 1 | **한쪽 면 색깔 액센트 보더** (`border-left: 3px solid …` 류) | 운영자 영구 금지 규칙. 위계는 배경 틴트 / 칩 / 웨이트 / 전체 테두리 / `.gn-plate` 면으로만 |
| 2 | **그라데이션 텍스트** (`background-clip: text`) | 저채도 스트리트 톤이 즉시 붕괴한다. 한글 받침에서 색이 끊기고, 서브픽셀 안티에일리어싱이 깨져 흐려 보인다 |
| 3 | **아웃라인/스트로크 텍스트** (`-webkit-text-stroke`) | 한글은 획 밀도가 높아 자소 내부가 메워진다. 라틴 한두 단어라도 금지 — 예외를 열면 반드시 한글에 번진다 |
| 4 | **한글 이탤릭 / skew 가짜 이탤릭** | 자소가 무너진다. 한글 강조는 규칙 2의 L1/L2/L3만 |
| 5 | **blur 있는 텍스트 그림자** | 다크 존 halation과 겹쳐 획이 뭉개진다. 유일 허용 = `text-shadow: .5px 0 currentColor` (blur 0, 획 보강 목적) |

### 조건부 금지 (예산 초과)

| # | 금지 | 이유 |
|---|---|---|
| 6 | **한글 `letter-spacing > 0.05em`** | 낱자가 분해되어 읽힌다. 자간 확장은 라틴 대문자 전용 |
| 7 | **대문자 블록 화면당 3개 초과** | 무신사 톤은 "대문자 한 곳의 긴장"이지 도배가 아니다. 4개째부터 촌스러워진다 |
| 8 | **라임 `--gn-live`를 LIVE 외 강조에 사용** | 라임은 "지금 경기 중" 의미를 독점한다. 화면당 1곳. 다른 데 쓰는 순간 LIVE 신호가 죽는다 |
| 9 | **밑줄(`text-decoration: underline`)로 강조** | 링크 시그널과 충돌한다. 강조는 `.gn-hl--mark` 면으로 |
| 10 | **붓글씨(`--font-brush`)를 본문·라벨·버튼에 사용** | 브랜드 잠금. 로고 / 섹션 헤드 2곳 / 푸터가 전부. 4곳째부터 붓글씨는 브랜드가 아니라 배경이 된다 |
| 11 | **`rotate()` 남발** | 붓글씨 락업 −1.5°~−1° 만. 카드·칩·버튼·썸네일 회전 금지 (`.gn-plate`의 skew는 면이지 텍스트가 아니므로 별개) |
| 12 | **한 블록에 웨이트 3종 이상** | 400/600/700/900 중 최대 2종. 3종이면 위계가 아니라 소음이다 |
| 13 | **갱신되는 숫자에 `tabular-nums` 누락** | 카운트다운·스코어가 1초마다 폭이 흔들린다. 이미 겪은 문제 |
| 14 | **다크 존에서 버건디 텍스트 강조(L2)** | `#961e37` on `#16141a` = 대비 3:1 미만. 강조가 아니라 "흐린 글자"로 읽힌다 |
| 15 | **키커를 14px 이상으로 키우기** | 키커가 헤드라인과 경쟁하는 순간 매거진 문법이 무너진다. 상한 13px |

---

## 부록 A — Tailwind 충돌 방지 (필수)

**전부 `@layer components` 안에 둔다.** 레이어 밖 CSS는 특이도와 무관하게 Tailwind의 `@layer utilities`를 이긴다 — `.gn-thumb`가 `absolute inset-0`을 잡아먹어 레이아웃이 깨진 사고가 이미 있었다.

레이어 안에 두면 자동으로 이렇게 동작한다:

- `text-[40px]`가 `.gn-lockup__title`의 `font-size`를 **이긴다** → 페이지별 예외를 유틸로 처리 가능
- `font-bold`가 `.gn-hl`의 `font-weight: 900`을 **이긴다** → 실수로 겹쳐 쓰면 강조가 사라지므로, `.gn-hl`에는 웨이트 유틸을 같이 붙이지 말 것
- `.gn-stat`의 크기는 유틸 대신 **`--gn-stat-size` 변수**로 바꾸는 걸 권장 — 변수를 바꾸면 단위·라벨까지 비례로 따라오지만, `text-[…]`로 덮으면 값만 커지고 종속 비율이 깨진다

배치 위치: `app/a-tokens.css`의 기존 `@layer components` 블록 안. 새 레이어를 열지 말 것.

## 부록 B — 검수 체크리스트 (화면 하나당)

- [ ] 가장 큰 글자 ÷ 가장 작은 글자 ≥ 4배인가
- [ ] 키커가 13px 이하이고 짝 헤드라인의 1/2.4 이하인가
- [ ] 헤드라인 강조가 **하나**이고 6자 이하인가
- [ ] 큰 숫자(`.gn-stat`)가 화면에 **하나**인가
- [ ] 대문자 블록이 3개 이하인가
- [ ] 라임이 LIVE **한 곳**에만 있는가
- [ ] 붓글씨가 4곳 미만인가
- [ ] 다크 존 텍스트에 `.gn-on-dark`가 걸려 있고, 얇은 획에 `.gn-stroke-fix`가 있는가
- [ ] 갱신되는 숫자에 `tabular-nums`가 있는가
- [ ] 한쪽 면 액센트 보더가 **하나도 없는가**

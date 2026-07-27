# 본문 · UI · 숫자 타입 레이어 설계

> 범위: 본문(Pretendard) / UI / 숫자·스코어(Barlow Condensed) 레이어와 "디스플레이와 어떻게 물리는가".
> **디스플레이·헤드라인 한글 폰트 선정은 이 문서의 범위가 아니다** — 별도 담당. 여기서는 디스플레이 레이어에
> **인터페이스(예산·변수명·역할 경계)** 만 정의한다.
>
> 작성 2026-07-27 · 모든 수치는 폰트 바이너리를 직접 파싱해서 얻은 실측값이다. 추측은 "미확인"으로 표기.

---

## 0. 먼저: 지금 프로덕션은 한글 웹폰트가 없다 🚨

가장 중요한 발견부터. **결론 5개보다 이게 먼저다.**

`public/fonts/PretendardVariable.woff2` (291,680 B) 는 **Pretendard Std Variable 원본과 바이트 단위로 동일**하다.

```
local    public/fonts/PretendardVariable.woff2   291,680 B   sha256 64a2b7110454edf0…
official pretendard-std@1.3.9
         dist/web/variable/woff2/
         PretendardStdVariable.woff2             291,680 B   sha256 64a2b7110454edf0…   ← 동일
```

그리고 이 파일의 cmap 을 파싱하면:

| 파일 | 총 코드포인트 | **한글 음절 (AC00–D7A3)** | 자모 | ASCII |
| --- | ---: | ---: | ---: | ---: |
| `public/fonts/PretendardVariable.woff2` (현행) | 2,640 | **0 / 11,172** | 0 | 95/95 |
| `public/fonts/SUIT-700.woff2` (제목) | 2,800 | 2,668 / 11,172 | 0 | 95/95 |
| 공식 `PretendardVariable.woff2` (2,009 KB) | 14,336 | 11,172 / 11,172 | 53 | 95/95 |

현행 파일이 실제로 담고 있는 것: Latin, Greek, Cyrillic, 화살표, 원문자(①②), 통화기호, PUA 아이콘.
**한글은 단 한 글자도 없다.**

`layout.tsx:27-29` 의 주석은 사실과 다르다:

```ts
// 본문/UI 한글 폰트: Pretendard Std Variable (KS X 1001 subset, ~286 KB).
// 한국어 웹 텍스트 ~98% 커버, 누락 글리프는 시스템 폰트 폴백.   ← ❌ 0% 커버
```

`Pretendard Std` 는 "KS X 1001 로 서브셋된 Pretendard" 가 아니라 **라틴 환경용 별도 패밀리**다
(공식 README: *"Pretendard Std: Optimized for Latin-based environments"*). 2 MB 를 피하려다
한글이 통째로 빠진 파일을 집은 것으로 보인다.

**실제 결과**: 사이트의 모든 한글 본문은 지금 `--font-sans` 폴백 체인으로 렌더된다 —
macOS/iOS `Apple SD Gothic Neo`, Windows `Malgun Gothic`, Android `Noto Sans KR`.
즉 **285 KB 를 내려받아 숫자·영문·기호에만 쓰고 있고, 한글 타이포그래피는 플랫폼마다 제각각**이다.
"본문 가독성 설계" 의 전제 자체가 성립하지 않는 상태.

> 이건 §5 의 로딩 사고와 **같은 계열의 사고**다. 파일명(`PretendardVariable.woff2`)과 주석이
> 실제 내용물과 달랐고, 아무도 바이너리를 열어보지 않았다. 체크리스트 1번 항목이 여기서 나온다.

---

## 1. 본문: 유지 vs 교체 → **Pretendard 유지, 단 "진짜" Pretendard 로 교체**

### 결론

> **Pretendard 계열을 유지한다. 다만 현행 Pretendard **Std**(한글 0자)를 버리고,
> 정품 Pretendard Variable v1.3.9 를 KS X 1001(2,668자) + ASCII 로 서브셋 + wght 축을 400–800 으로
> 클립한 355 KB 파일을 self-host 한다.** Wanted Sans / Freesentation 은 채택하지 않는다.

### 근거 — 대안 비교

라이선스는 셋 다 동일하게 **SIL OFL 1.1** (단독 판매·라이선스 변경만 금지). 라이선스로는 못 가린다.
그래서 가독성·용량·엔지니어링 리스크로 갈랐다.

| 후보 | 라이선스 | 웹폰트 배포 형태 | 실측 용량 | tnum | 판정 |
| --- | --- | --- | ---: | :---: | --- |
| **Pretendard Variable 1.3.9** | OFL 1.1 | 단일 2,009 KB / 92분할 다이나믹 서브셋(2.82 MB) / 자체 서브셋 가능 | **355 KB** (자체 서브셋, 후술) | ✅ | **채택** |
| Wanted Sans Variable 1.0.3 | OFL 1.1 | complete 1,259 KB / split 92청크 (median ~27 KB) | ~1,259 KB 또는 청크 다수 | **❌ 없음** | 기각 |
| Freesentation | OFL 1.1 | 정적 웨이트 위주 | 미확인 | 미확인 | 기각 |
| Pretendard Std (현행) | OFL 1.1 | 285 KB | 285 KB | ✅ | **한글 0자 — 즉시 폐기** |

**Wanted Sans 를 기각한 결정타** — 폰트 바이너리를 파싱한 결과:

```
WantedSansVariable.split.0.woff2
  GSUB features: aalt cv03 cv21 salt ss03 ss06 ss07
  tnum: false   pnum: false
```

`tnum` 이 **없다**. 다만 기본 숫자 폭이 이미 균일(1770/2048 전부 동일)해서 결과적으로는 tabular 로 동작한다.
문제는 그 반대 — **비례숫자(pnum)가 없어서** 본문 안 숫자가 항상 표 폭으로 벌어진다.
"2026년 7월 27일" 같은 문장에서 숫자만 뜬다. 본문 폰트로는 감점.
용량도 complete 1.26 MB, split 은 92요청. Pretendard 자체 서브셋 355 KB 대비 이점이 없다.

**Freesentation** 은 노노/공식 페이지 기준 OFL 이고 라틴은 Roboto 기반 Heebo, 한글은 본고딕 계열을 재조합한
서체다. 파워포인트 특화로 만들어졌고 **웹폰트용 가변/서브셋 배포 파이프라인이 확인되지 않는다(미확인)**.
본고딕 계열이라 Pretendard 대비 본문 가독성 이득이 없고, 스포츠 커뮤니티 톤에도 중립적이다. 교체 명분 없음.

**Pretendard 를 유지하는 이유** (교체 리스크 대비 이득이 없다):

- v1.3.9 가 최신 — 현행 파일도 1.309 라 버전 업그레이드 자체는 불필요했다. 문제는 *변종 선택*이었다.
- `tnum` / `pnum` / `zero` / `frac` / `numr` / `dnom` / `case` / `ss01–ss16` / `cv01–cv13` 전부 보유.
  실측 GSUB 44개 feature — 후보 중 압도적 1위.
- 숫자 폭 실측: 기본 비례(spread 29.7%) → `tnum` 적용 시 spread **0%**. 본문·표 양쪽 다 커버한다.
- cap-height 707/1000, x-height 530/1000 → §3 의 콘덴스드 숫자 폰트와 metric 궁합이 이미 좋다(후술).
- 팀 전체가 이미 이 서체 기준으로 자간·행간을 잡아놨다. 바꾸면 전 화면 재조정.

### 서브셋 사양 — 실측 빌드 결과

`pretendard@1.3.9` 정품 Variable(2,009 KB, 한글 11,172자 전부)에서 fontTools 로 직접 빌드한 실측값:

| 빌드 | 대상 코드포인트 | wght 축 | 실측 용량 |
| --- | ---: | --- | ---: |
| 전체 11,172자 + ASCII | 11,276 | 45–920 | 1,694.6 KB |
| KS X 1001 2,668자 + Std 라틴 전체 | 5,308 | 45–920 | 746.8 KB |
| KS X 1001 2,668자 + ASCII + 문장부호 | 2,782 | 45–920 | 501.8 KB |
| ↑ 동일 + **wght 400–700 클립** | 2,782 | 400–700 | 353.7 KB |
| ↑ 동일 + **wght 400–800 클립** ← **채택** | 2,782 | **400–800** | **355.0 KB** |
| 정적 인스턴스 wght=400 | 2,782 | 400 고정 | 194.2 KB |
| 정적 인스턴스 wght=600 | 2,782 | 600 고정 | 219.9 KB |
| 정적 인스턴스 wght=700 | 2,782 | 700 고정 | 223.1 KB |

**wght 400–800 가변 1개(355 KB) < 정적 2웨이트(400+700 = 417 KB)**.
가변 축 클리핑이 `gvar` 델타를 잘라내서, 축을 45–920 → 400–800 으로 줄이는 것만으로 **147 KB(-29%)** 가 빠진다.
웨이트 3개 이상 쓰는 순간 가변이 무조건 이긴다. 400 미만(Thin/Light)은 이 사이트에서 안 쓰므로 잘라도 무손실.

**꼬리(rare 8,504자) 처리** — UGC 닉네임에 KS X 1001 밖 음절이 나오면 시스템 폰트로 튄다.
전량 포함은 +872 KB 라 불가. 대안으로 8분할 lazy 청크를 실측해봤다:

```
tail-0: 1,063자 → 136.6 KB    tail-4: 1,063자 → 133.3 KB
tail-1: 1,063자 → 120.1 KB    tail-5: 1,063자 → 132.1 KB
tail-2: 1,063자 → 119.5 KB    tail-6: 1,063자 → 132.0 KB
tail-3: 1,063자 → 114.0 KB    tail-7: 1,063자 → 136.0 KB
```

→ **Phase 1 에서는 넣지 않는다.** 희귀 음절은 폴백(Apple SD Gothic Neo / Malgun Gothic)으로 두고,
"닉네임에서 서체가 튄다"는 실사용 신고가 실제로 들어오면 그때 `unicode-range` 로 tail-N 만 붙인다.
붙일 때도 `preload` 금지 / `display: swap`.

---

## 2. 제목 레이어: SUIT 700 단일 웨이트 → **일반 `--font-title` 역할에서 은퇴**

### 결론

> **SUIT-700 을 범용 `--font-title` 자리에서 내린다. 제목 위계는 Pretendard 의 wght 500/600/700/800
> 대비로 만든다.** 별도 서체는 **진짜 디스플레이 슬롯**(히어로 밴드·스코어보드·섹션 커버)에만 쓰고,
> 그 자리는 디스플레이 담당이 고른 폰트가 가져간다.

### 근거

**(a) 한 웨이트로는 위계를 못 만든다 — 지적하신 그대로다.**
`--font-title` 이 항상 700 하나뿐이라 h1/h2/h3 가 전부 같은 굵기다. 크기 차이만 남는데,
한글은 라틴과 달리 대소문자 대비가 없어서 **크기만으로 만드는 위계가 특히 약하다**.
지금 제목 위계의 실질적 대비는 "SUIT 700 vs Pretendard 400" 단 한 단계다.

**(b) `display: "optional"` 때문에 첫 방문에서는 아예 안 뜬다 — 이건 살아있는 버그다.**

```ts
const suit = localFont({
  src: "../public/fonts/SUIT-700.woff2",
  display: "optional",   // ← block 100ms, swap 0ms
  preload: false,        // ← 프리로드도 안 함
})
```

`optional` = block period ~100 ms + **swap period 0 ms**. 게다가 `preload: false` 라
브라우저는 CSS 파싱 후 실제 레이아웃 시점에야 173 KB 를 요청한다. 100 ms 안에 도착할 리 없다.
→ **첫 방문자는 제목이 Pretendard(현재는 그마저도 시스템 폴백)로 렌더되고, 재방문(캐시)에서만 SUIT 가 보인다.**
같은 화면이 방문마다 다른 서체로 뜬다. 이건 §5 의 Nanum 사고와 **정확히 동일한 함정**이다.

**(c) 파일 자체의 name 테이블도 오염돼 있다.**

```
SUIT-700.woff2  family="SUIT Variable Thin"  subfamily="Regular"  wght 실제 700
```

가변 원본을 700 으로 인스턴싱하면서 이름을 안 갱신했다. CSS 에서 `weight: "700"` 을 명시하니 지금은 동작하지만,
`local()` 폴백이나 OS 폰트 매칭에서 오작동할 여지가 있다.

**(d) 비용 대비 효과** — 169 KB 를 써서 얻는 게 "제목만 살짝 다른 산세리프"다.
같은 169 KB 면 §1 의 Pretendard 한글 서브셋(355 KB)의 절반을 산다. 우선순위가 명백히 뒤다.

### 그래서 제목은 이렇게

```
h1  Pretendard 800 / -0.03em     ← 크기 + 굵기 + 자간, 3축 동시 대비
h2  Pretendard 700 / -0.025em
h3  Pretendard 600 / -0.02em
h4  Pretendard 600 / -0.015em
본문 Pretendard 400 / -0.01em
```

400 → 800 은 한글에서 충분히 큰 대비다. 이미 `--font-sans` 를 wght 400–800 가변으로 사기 때문에 **추가 비용 0 KB**.

**디스플레이 레이어와의 경계 (담당자에게 넘기는 인터페이스)**

| 변수 | 소유 | 용도 | 예산 |
| --- | --- | --- | ---: |
| `--font-sans` | 본문 담당 (이 문서) | 본문·UI·제목 전부 | 355 KB |
| `--font-cond` | 본문 담당 (이 문서) | 숫자·스코어 | 22 KB |
| `--font-display` | **디스플레이 담당** | 히어로 밴드 / 스코어보드 타이틀 / 섹션 커버 **한정** | **≤ 120 KB** |

`--font-display` 규칙 3가지만 지켜주면 된다:
1. `preload: false` + **`display: "swap"`** (`optional` 절대 금지 — §5)
2. 한글 글리프가 실제로 들어있는지 cmap 으로 검증 (§5 체크리스트 1번)
3. 화면당 1–2회 이하 사용. 카드 제목·리스트 제목에는 쓰지 않는다.

> `--font-display` 는 현재 `"GmarketSansBold"` 로 점유돼 있다. §5 에서 정리한다.

---

## 3. 숫자/스코어 레이어: **Barlow Condensed 유지 — 단 700 한 웨이트만**

### 결론

> **Barlow Condensed 를 유지한다.** 다만 600/700/800 3웨이트(65.6 KB) → **700 1웨이트(21.9 KB)** 로 줄이고,
> `.gn-num` 의 `letter-spacing: 0.02em` 과 중복 `font-feature-settings` 를 제거한다.
> **Oswald 는 후보에서 탈락**(tnum 없음 + 행간 폭발). Archivo Narrow 가 유일한 실질적 대안이나 교체 이득 부족.

### tabular-nums 실측 — 태그 존재만 보지 않고 치환 후 폭까지 확인했다

`GSUB` 에서 `tnum` feature 를 찾아 SingleSubst 룩업을 직접 해석하고, 치환된 글리프의 `hmtx` advance 를 읽었다.
단위는 1000 em 정규화.

| 폰트 | tnum | 기본 숫자 폭 (0–9) | 기본 spread | **tnum 적용 후** | 적용 후 spread |
| --- | :---: | --- | ---: | --- | ---: |
| **Barlow Condensed** | ✅ 10 subs | 456,294,451,446,508,450,451,422,446,446 | **42.1%** | 520 × 10 | **0%** |
| **Oswald** | ❌ **없음** | 517,378,478,477,483,476,503,386,499,502 | **26.9%** | 변화 없음 | **26.9%** ❌ |
| Archivo Narrow | ✅ 20 subs | 456 × 10 (기본부터 균일) | 0% | 456 × 10 | 0% |
| Roboto Condensed | ✅ 12 subs | 494 × 10 (기본부터 균일) | 0% | 494 × 10 | 0% |
| Bebas Neue | ✅ 10 subs | 400 × 10 | 0% | 400 × 10 | 0% |
| Pretendard (참고) | ✅ 16 subs | 596,438,587,617,624,597,613,552,606,613 | 29.7% | 614 × 10 | 0% |
| SUIT-700 (참고) | ✅ 12 subs | 644,418,576,591,619,602,602,565,594,602 | 35.1% | 618 × 10 | 0% |

**Oswald 는 카운트다운에 쓰면 안 된다.** `tnum` GSUB feature 자체가 없어서
`font-variant-numeric: tabular-nums` 를 걸어도 브라우저가 무시한다. 숫자 폭 편차 26.9% —
`1`(378) 과 `0`(517) 이 37% 차이 나므로 `00:59 → 01:00` 에서 눈에 띄게 폭이 튄다. 고칠 방법이 없다. **탈락.**

**Barlow Condensed 는 tnum 이 제대로 동작한다.** 다만 발견한 반직관적 사실:

> **tnum 을 켜면 Barlow Condensed 숫자는 오히려 넓어진다.** 기본 평균 ~456 → tabular 520 (+14%).
> 콘덴스드 후보 중 **tabular 모드에서 가장 넓다**: Bebas 400 < Archivo Narrow 456 < Roboto Condensed 494 < **Barlow Condensed 520**.

즉 `.gn-num` 이 지금 "생각만큼 안 좁다". 여기에 `letter-spacing: 0.02em` 까지 더해져 있다.
→ **`.gn-num` 에서 letter-spacing 을 뺀다.** tabular 는 이미 글리프 안쪽에 사이드베어링을 갖고 있어서
추가 자간은 순수 낭비다. (자간이 균일하므로 흔들림 자체를 유발하진 않는다 — 폭만 커진다.)

### 그럼에도 Barlow Condensed 를 유지하는 이유: metric 궁합

한글 옆에 숫자를 섞어 쓰는 사이트에서 콘덴스드 폰트 선택의 진짜 기준은 "얼마나 좁은가"가 아니라
**"본문 폰트와 줄에서 싸우지 않는가"** 다. 1000 em 정규화 실측:

| 폰트 | cap-height | x-height | hhea 라인박스 (asc−desc) | Pretendard 대비 cap 오차 |
| --- | ---: | ---: | ---: | ---: |
| **Pretendard (본문 기준)** | **707** | **530** | **1.193 em** | — |
| **Barlow Condensed** | **700** | **517** | **1.200 em** | **−1.0%** ✅ |
| Roboto Condensed | 711 | 528 | 1.172 em | +0.6% ✅ |
| Bebas Neue | 700 | 700(=cap, 대문자 전용) | 1.200 em | −1.0% |
| Archivo Narrow | 686 | 526 | 1.347 em | −3.0% |
| Oswald | **810** | 578 | **1.482 em** ❌ | **+14.6%** ❌ |

**Barlow Condensed 는 cap 오차 −1.0%, 라인박스 오차 +0.6%.** 한 줄에 섞어도 크기 보정도 행간 보정도 필요 없다.
Oswald 는 cap 이 14.6% 크고 라인박스가 1.482 em 이라, 카드 안에 하나만 넣어도 그 줄의 높이가 24% 튄다.
(Archivo Narrow 도 라인박스 1.347 em 이라 `line-height` 를 숫자별로 고정해야 한다.)

### 대안 검토 요약

| 후보 | tnum | Pretendard metric 궁합 | 용량(latin) | 판정 |
| --- | :---: | --- | ---: | --- |
| **Barlow Condensed 700** | ✅ | cap −1.0% / 라인박스 +0.6% | **21.9 KB** | **유지** |
| Roboto Condensed (variable) | ✅ | cap +0.6% / 라인박스 −1.8% | 51.4 KB (400–700 가변) | 대안 1순위. 21.9 KB → 51.4 KB 를 낼 가치는 없음 |
| Archivo Narrow | ✅ | cap −3.0% / **라인박스 +12.9%** | 18.7 KB | 행간 보정 필요 → 기각 |
| Bebas Neue | ✅ | 대문자·숫자 전용 (소문자 없음) | 13.8 KB | `.gn-num` 이 `uppercase` 라벨(LIVE/VS)에도 쓰여서 부적합 |
| **Oswald** | **❌** | cap +14.6% / 라인박스 +24% | 21.5 KB | **탈락 (2중 결격)** |
| DIN 계열 | — | — | — | Google Fonts 무료 배포판 없음. 유료 라이선스 필요 → **미확인**, 후보 제외 |

### 웨이트 축소

`.gn-num` 실사용 웨이트 조사: `font-semibold`(600) 5회 / `font-extrabold`(800) 2회 / `font-bold`(700) 2회.
전부 "숫자 강조" 목적이고 세 굵기를 **의도적으로 구분해서 쓰는 곳이 없다**.
→ **700 하나로 통일**. 3웨이트 65.6 KB → 1웨이트 21.9 KB, **−43.7 KB**.

---

## 4. 위계 규칙 — 어떤 문자가 어떤 폰트를 타는가

### 4.1 역할 규칙표

| 역할 | 폰트 | 웨이트 | 쓰이는 곳 | CSS 변수 |
| --- | --- | --- | --- | --- |
| 본문 / UI / 제목 (한글·영문·기본 숫자) | Pretendard Variable (KSX1001 서브셋) | 400–800 가변 | 게시글 본문, 카드 제목, 버튼, 폼, 내비, 메타 | `--font-sans` |
| 제목 강조 | ↑ 동일 파일 | 600 / 700 / 800 | h1–h4, 섹션 헤더 | `--font-sans` + `.gn-title` |
| **숫자·스코어·시각·카운트다운·배당** | Barlow Condensed | 700 | 스코어보드, 매치데이 밴드, 타이머, 배당, 랭킹 순위 | `--font-cond` (`.gn-num`) |
| 표/리스트 안 정렬 숫자 (한글 문맥 유지) | Pretendard | 상속 | 정산 표, 리더보드 포인트, 잔액 | `--font-sans` + `.gn-tnum` |
| 로고 워드마크 | (현재 이미지 `/logo-brush.webp`) | — | 헤더 | — |
| **디스플레이 / 히어로** | **디스플레이 담당 지정** | 담당 지정 | 히어로 밴드, 스코어보드 타이틀 | `--font-display` |

**핵심 원칙 — 콘덴스드는 "숫자 슬롯"에만, "숫자가 들어간 문장"에는 안 쓴다.**

```
✅ .gn-num  →  3 : 1        (독립 스코어 슬롯)
✅ .gn-num  →  08:10        (독립 시각 슬롯)
✅ .gn-num  →  LIVE  VS     (대문자 라벨)
❌ .gn-num  →  08:10 뉴욕 메츠 vs 애틀랜타 브레이브스   ← 한 줄에 한글이 섞임
```

마지막 케이스는 **`.gn-num` 을 줄 전체에 걸지 말고, 숫자 부분만 `<span>` 으로 감싼다.**
`.gn-num` 의 `font-family` 는 `var(--font-cond), var(--font-pretendard), sans-serif` 라 한글은
어차피 Pretendard 로 폴백되지만, **폴백 경유는 렌더러가 글리프 단위로 폰트를 스위칭한다는 뜻**이고
그러면 폰트별 `letter-spacing` / `font-feature-settings` 가 한글에도 적용되는 부작용이 생긴다.
명시적으로 나누는 편이 안전하고 의도가 드러난다.

### 4.2 한글 + 숫자가 한 줄에 섞일 때 — 구체 CSS

`08:10 뉴욕 메츠 vs 애틀랜타 브레이브스` 기준.

```tsx
<div className="gn-line">
  <span className="gn-num">08:10</span>
  <span>뉴욕 메츠</span>
  <span className="gn-vs">vs</span>
  <span>애틀랜타 브레이브스</span>
</div>
```

```css
@layer components {
  /* 혼합 줄의 컨테이너: 행간을 한글 기준으로 '못 박아' 폰트 스위칭이 라인박스를 못 건드리게 한다.
     Barlow Condensed 라인박스 1.200em vs Pretendard 1.193em — 0.6% 차이라 원래도 거의 안 튀지만,
     디스플레이 폰트가 나중에 이 줄에 끼어들 수 있으므로 방어적으로 고정한다. */
  .gn-line {
    display: flex;
    align-items: baseline;   /* ← center 아님. 서로 다른 폰트는 baseline 으로 정렬해야 한다 */
    gap: 0.4em;
    line-height: 1.5;        /* 명시 고정: 폰트 교체가 줄 높이를 바꾸지 못하게 */
    font-variant-numeric: tabular-nums;  /* 한글 문맥의 Pretendard 숫자도 표 폭으로 */
  }

  .gn-num {
    font-family: var(--font-cond), var(--font-pretendard), sans-serif;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    /* letter-spacing 제거: tabular 글리프가 이미 사이드베어링을 갖고 있음 (기본 456 → tabular 520) */
    /* font-feature-settings 제거: font-variant-numeric 과 중복 + 향후 feature 추가 시 재기술 강요 */
    letter-spacing: 0;
    /* cap-height 실측 700 vs Pretendard 707 → 보정 불필요.
       그래도 브라우저 폴백(Arial 등)이 잡히는 순간을 대비해 progressive enhancement 로 못 박는다.
       Baseline(Chrome 127+ / Safari 17+ / Firefox 118+). 미지원 브라우저는 무시하고 넘어감. */
    font-size-adjust: cap-height 0.707;
  }

  /* 한글 문맥을 유지한 채 숫자만 정렬하고 싶을 때 — 폰트를 바꾸지 않는다 */
  .gn-tnum {
    font-variant-numeric: tabular-nums;
    font-feature-settings: normal;  /* 상위에서 내려온 feature 초기화 */
  }

  /* 'vs' 같은 연결어는 숫자도 제목도 아니다 — 본문 폰트로, 시각적으로만 후퇴 */
  .gn-vs {
    font-family: var(--font-pretendard), sans-serif;
    font-weight: 500;
    font-size: 0.85em;
    color: var(--muted-foreground);
    text-transform: lowercase;
  }
}
```

**왜 `align-items: baseline` 인가** — 서로 다른 cap-height 를 가진 두 폰트를 `center` 로 맞추면
숫자가 한글보다 위/아래로 떠 보인다. baseline 정렬은 두 폰트가 같은 기준선에 앉게 하므로
cap-height 가 달라도 "글자가 떠 있는" 인상이 안 생긴다. Barlow Condensed 는 cap 오차 −1.0% 라
baseline 정렬만으로 보정이 끝난다.

**왜 `font-size-adjust` 를 크기 보정의 주 수단으로 쓰지 않는가** — 2024년에야 Baseline 에 들어온 기능이고
(Chrome 127 / Safari 17 / Firefox 118), 한국 모바일 웹뷰에는 아직 구형이 남아 있다.
**주 수단은 "cap-height 가 이미 맞는 폰트를 고르는 것"** 이고 `font-size-adjust` 는 폴백 상황용 보험이다.
Oswald 를 골랐다면 `font-size: 0.873em` 하드코딩이 강제됐을 텐데, 그건 보정이 아니라 부채다.

### 4.3 카운트다운 — tabular 만으로는 부족하다

`tabular-nums` 는 **자릿수가 같을 때만** 폭을 고정한다. `9:59 → 10:00` 은 문자 수 자체가 늘어난다.

```css
.gn-countdown {
  font-family: var(--font-cond), var(--font-pretendard), sans-serif;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  /* Barlow Condensed tabular digit = 0.520em. "00:00" = 4숫자 + 콜론.
     콜론 폭이 폰트마다 달라 ch 대신 명시 min-width 를 준다. */
  min-width: 4.6em;
  display: inline-block;
  text-align: center;
  font-variant-ligatures: none;  /* 콜론 주변 합자 방지 */
}
```

> `1ch` = "0" 글리프의 advance. Barlow Condensed 는 `tnum` 이 켜져야 0 이 520 이 되고, 꺼져 있으면 456 이다.
> `ch` 단위는 **`tnum` 적용 전 폭**을 참조할 수 있어 신뢰할 수 없다 → `em` 기반 `min-width` 를 쓴다.

---

## 5. 성능 예산 + 로딩 사고 방지

### 5.1 현행 실측 payload

| 폰트 | 파일 수 | 실측 바이트 | preload | display | 크리티컬 패스 | 실효 |
| --- | ---: | ---: | :---: | --- | :---: | --- |
| Pretendard **Std** Variable | 1 | 291,680 (285 KB) | ✅ | swap | ✅ | **한글 0자 — 라틴·기호 전용** |
| SUIT-700 | 1 | 173,052 (169 KB) | ❌ | **optional** | ❌ | 첫 방문 미적용 |
| Barlow Condensed 600/700/800 | 3 | 67,216 (65.6 KB) | ❌ | swap | ❌ | 700만 실사용 |
| **GmarketSansBold** (jsDelivr) | 1 | **373,644 (365 KB)** | ❌ | swap | ⚠️ | **글리프 4개용** |
| Nanum Brush Script | 93 (self-host) | 0 fetched | ❌ | swap | ❌ | **코드에서 미사용** |
| **합계 (최악)** | | **905,592 B ≈ 884 KB** | | | | |

**GmarketSans 365 KB / 글리프 4개** — 이게 두 번째로 큰 낭비다.

```css
@font-face {
  font-family: "GmarketSansBold";
  src: url("https://cdn.jsdelivr.net/gh/fonts-archive/GmarketSans/GmarketSansBold.woff2") ...
  unicode-range: U+ACF5, U+B180, U+C774, U+D310;   /* 공, 놀, 이, 판 */
}
```

**`unicode-range` 는 파일 크기를 줄이지 않는다.** 다운로드 *여부*만 게이트한다.
페이지에 `공`·`놀`·`이`·`판` 중 하나라도 있으면 **365 KB 전체**를 서드파티 CDN 에서 받는다.
`이` 는 한국어에서 가장 흔한 음절 중 하나라 사실상 상시 발동한다.

게다가 지금 이 폰트는 **로고에도 안 쓰인다** — 헤더 로고는 `/logo-brush.webp` 이미지다.
실사용처는 `components/betting/prediction-slip-card.tsx` 와 `components/my-predictions/prediction-slip-card.tsx`
두 곳의 `font-[family-name:var(--font-display)]` 인데, 거기 들어가는 텍스트에 `공놀이판` 이 없으므로
**`unicode-range` 때문에 어차피 적용되지 않는다.** 즉 365 KB 를 받아놓고 아무 데도 안 쓴다.

같은 4글자를 fontTools 로 서브셋하면:

```
GmarketSansBold  full         : 373,644 bytes
GmarketSansBold  4-glyph subset:     712 bytes    (-99.8%)
```

Gmarket Sans 는 SIL OFL 이라 서브셋·재배포 가능하다 (OFL 의 Reserved Font Name 조항에 따라
파생 파일명은 원본과 구분되게 지을 것 — 예: `gn-wordmark.woff2`).

**Nanum Brush Script** 는 `--font-brush` 변수만 선언되고 **어느 컴포넌트에서도 참조되지 않는다**.
next/font 는 Google CSS 응답에 있는 @font-face 를 **전부** self-host 하므로 빌드 산출물에 93개 파일이 들어간다.
런타임 fetch 는 0 이지만 CSS 파싱 비용과 빌드 산출물 오염이 있다. **삭제.**

### 5.2 목표 예산

> **본문 + 숫자 레이어 상한 400 KB** (그중 preload 355 KB)
> **디스플레이 레이어 별도 예산 ≤ 120 KB** (preload 0)
> **전체 폰트 상한 500 KB** — 현행 최악 884 KB 대비 **−43%**

| 폰트 | 파일 | 바이트 | preload | display | 근거 |
| --- | --- | ---: | :---: | --- | --- |
| **Pretendard Var (KSX1001, wght 400–800)** | 1 | **363,520 (355 KB)** | ✅ | **swap** | 본문. LCP 텍스트를 담당하므로 preload 필수. `optional` 은 첫 방문자가 영구히 시스템 폰트를 보게 됨. `block` 은 3초 투명 텍스트 → 더 나쁨. `adjustFontFallback` 메트릭 오버라이드로 swap 리플로우를 억제 |
| **Barlow Condensed 700** | 1 | **22,444 (21.9 KB)** | ❌ | **swap** | 숫자 슬롯 한정. LCP 후보 아님 → preload 불필요. cap 오차 −1.0% 라 swap 리플로우가 사실상 없음 |
| 워드마크 4글자 서브셋 (선택) | 1 | **712** | ✅ | **swap** | 0.7 KB 라 preload 비용 무시 가능. `block` 도 방어 가능하나(≤5 KB 프리로드 파일 한정) `swap` 이 더 안전 |
| `--font-display` (디스플레이 담당) | ? | **≤ 122,880 (120 KB)** | ❌ | **swap** | 화면당 1–2회. `optional` 금지 |
| **합계** | | **≤ 512 KB** | | | |

**제거**: Pretendard Std 285 KB / SUIT 169 KB / Barlow 600·800 43.7 KB / GmarketSans 365 KB / Nanum Brush 전체.

**`display` 값 근거 요약**

| 값 | block | swap | 판단 |
| --- | --- | --- | --- |
| `block` | ~3 s (투명) | 무한 | **본문 금지** (FOIT 3초). ≤5 KB + preload 인 워드마크급에만 방어 가능 |
| `swap` | ~100 ms | 무한 | **기본값으로 채택.** 반드시 적용됨. 리플로우는 폴백 메트릭 오버라이드로 억제 |
| `optional` | ~100 ms | **0 ms** | **preload 없는 폰트에 절대 금지.** 100 ms 안에 못 오면 그 페이지뷰에서 영구 미적용 |

### 5.3 재현 가능한 서브셋 빌드

```bash
pip install "fonttools[woff]" brotli
curl -LO https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2
python scripts/build-pretendard-subset.py   # 아래 내용
```

```python
# scripts/build-pretendard-subset.py
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.varLib import instancer
import os

SRC = "PretendardVariable.woff2"          # 2,009 KB, 한글 11,172자
OUT = "public/fonts/Pretendard-ko-400-800.woff2"

# KS X 1001 완성형 한글 2,350자 + 상용 확장 = 2,668자.
# (현행 SUIT-700.woff2 가 정확히 이 집합을 담고 있으므로 거기서 추출해 동기화한다.
#  SUIT 제거 후에는 이 목록을 scripts/charset-ksx1001.txt 로 고정해 둘 것.)
suit = TTFont("public/fonts/SUIT-700.woff2")
hangul = {c for t in suit["cmap"].tables for c in t.cmap if 0xAC00 <= c <= 0xD7A3}

PUNCT = {0x2018,0x2019,0x201C,0x201D,0x2013,0x2014,0x2026,0x00B7,0x20A9,0x20BF,
         0x2022,0x00D7,0x00B0,0x2190,0x2192,0x25B2,0x25BC,0x2605,0x2606,0x00A0,0x203B,0x2103}
TARGET = set(range(0x20, 0x7F)) | hangul | PUNCT      # 2,782 cps

f = TTFont(SRC)
o = Options()
o.layout_features = ["*"]      # ★ tnum/pnum/kern/liga 보존. 기본값은 일부 feature 를 버린다
o.name_IDs = ["*"]
o.notdef_outline = True
s = Subsetter(options=o); s.populate(unicodes=TARGET); s.subset(f)
f.save("_tmp.ttf")

# wght 축을 400–800 으로 클립 → gvar 델타 절감 (502 KB → 355 KB)
g = instancer.instantiateVariableFont(TTFont("_tmp.ttf"), {"wght": (400, 800)}, inplace=False)
g.flavor = "woff2"
g.save(OUT)
os.remove("_tmp.ttf")
print(OUT, os.path.getsize(OUT), "bytes")   # 실측: 363,520
```

### 5.4 적용 코드

**`app/layout.tsx`**

```ts
import localFont from "next/font/local"
import { Barlow_Condensed } from "next/font/google"

// 본문/UI/제목 한글 폰트.
// ⚠️ Pretendard "Std" 는 라틴 전용 별개 패밀리다 — 한글 0자. 절대 쓰지 말 것.
//    이 파일은 정품 Pretendard Variable 1.3.9 를 scripts/build-pretendard-subset.py 로
//    KS X 1001(2,668자) + ASCII 로 서브셋 + wght 400–800 클립한 것. 실측 363,520 B.
//    검증: pnpm exec tsx scripts/verify-fonts.ts (한글 음절 수 assert)
const pretendard = localFont({
  src: "../public/fonts/Pretendard-ko-400-800.woff2",
  display: "swap",          // ★ optional 금지 — 첫 방문에서 본문이 영구 폴백된다
  variable: "--font-pretendard",
  weight: "400 800",
  adjustFontFallback: "Arial",
})

// 숫자·스코어·시각용 콘덴스드 라틴. 700 단일 웨이트.
// tnum 실측 확인: 기본 spread 42.1% → tabular 적용 시 0% (전 숫자 520/1000em).
// cap-height 700 vs Pretendard 707 (−1.0%) → 혼합 줄에서 크기 보정 불필요.
const barlowCondensed = Barlow_Condensed({
  weight: "700",
  subsets: ["latin"],       // ⚠️ 다운로드 필터가 아니라 preload 필터다 (§5.5-2)
  variable: "--font-cond",
  display: "swap",
  preload: false,
})

// ❌ 제거: suit (display:"optional" + preload:false → 첫 방문 미적용, 단일 웨이트로 위계 불가)
// ❌ 제거: nanumBrush (--font-brush 를 참조하는 컴포넌트가 하나도 없음)

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${pretendard.variable} ${barlowCondensed.variable}`}>
      …
    </html>
  )
}
```

**`app/globals.css`**

```css
/* ❌ 제거: GmarketSansBold @font-face (jsDelivr 365 KB / 글리프 4개, 실사용처 없음).
   워드마크를 텍스트로 되살릴 경우에만 self-host 4글자 서브셋(712 B)으로 대체할 것. */

@theme inline {
  --font-sans:
    var(--font-pretendard), "Apple SD Gothic Neo", "Malgun Gothic",
    -apple-system, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

  /* 숫자·스코어 콘덴스드. 한글은 Pretendard 로 폴백된다. */
  --font-cond: var(--font-cond-raw), var(--font-pretendard), sans-serif;

  /* 제목은 별도 폰트를 쓰지 않는다 — Pretendard 400↔800 웨이트 대비로 만든다.
     기존 --font-title 참조처 호환을 위해 별칭만 남긴다. */
  --font-title: var(--font-sans);

  /* 히어로/스코어보드 전용 디스플레이. 소유: 디스플레이 담당.
     계약: preload 없음 / display:swap / 한글 글리프 cmap 검증 필수 / 예산 ≤120 KB. */
  --font-display: var(--font-sans);   /* ← 담당자 픽이 들어올 때까지 본문으로 축퇴 */

  /* ── 타입 스케일 (§6) ── */
  --text-micro:   11px;  --lh-micro:   16px;
  --text-caption: 12px;  --lh-caption: 18px;
  --text-ui:      13px;  --lh-ui:      20px;
  --text-body:    15px;  --lh-body:    26px;
  --text-lead:    17px;  --lh-lead:    28px;
  --text-h4:      17px;  --lh-h4:      24px;
  --text-h3:      19px;  --lh-h3:      27px;
  --text-h2:      23px;  --lh-h2:      31px;
  --text-h1:      28px;  --lh-h1:      36px;
}

@layer base {
  body {
    @apply bg-background text-foreground;
    font-size: var(--text-body);
    line-height: 1.7;            /* 1.6 → 1.7. 한글 음절 블록은 라틴보다 넓은 행간을 요구한다 */
    letter-spacing: -0.01em;
    font-variant-numeric: proportional-nums;  /* 본문 숫자는 비례. tabular 는 명시 슬롯에서만 */
  }
  h1 { font-size: var(--text-h1); line-height: var(--lh-h1); font-weight: 800; letter-spacing: -0.03em; }
  h2 { font-size: var(--text-h2); line-height: var(--lh-h2); font-weight: 700; letter-spacing: -0.025em; }
  h3 { font-size: var(--text-h3); line-height: var(--lh-h3); font-weight: 600; letter-spacing: -0.02em; }
  h4 { font-size: var(--text-h4); line-height: var(--lh-h4); font-weight: 600; letter-spacing: -0.015em; }
}
```

**유틸 클래스 (`app/a-tokens.css` 의 `.gn-num` 교체)**

```css
@layer components {
  /* 콘덴스드 + tabular — 스코어·시각·카운트다운·배당 "슬롯" 전용.
     한글이 섞이는 줄 전체에 걸지 말 것 (§4.1). */
  .gn-num {
    font-family: var(--font-cond);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;                    /* 0.02em 제거 — tabular 글리프가 이미 520/1000em */
    font-size-adjust: cap-height 0.707;   /* 폴백 대비 보험. 미지원 브라우저는 무시 */
  }

  /* 한글 문맥을 유지한 채 숫자만 정렬 — 폰트 교체 없음 (정산표, 리더보드, 잔액) */
  .gn-tnum { font-variant-numeric: tabular-nums; }

  /* 서로 다른 폰트가 섞이는 줄 */
  .gn-line {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
    line-height: 1.5;
  }

  /* 카운트다운 — 자릿수 변화(9:59→10:00)까지 흡수 */
  .gn-countdown {
    font-family: var(--font-cond);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-variant-ligatures: none;
    display: inline-block;
    min-width: 4.6em;
    text-align: center;
  }
}
```

> `--font-cond-raw` 는 `next/font` 가 주입하는 원시 변수명이다. `layout.tsx` 의
> `variable: "--font-cond"` 를 `"--font-cond-raw"` 로 바꾸고, `@theme` 에서 폴백 체인을 조립한다.
> (지금처럼 `.gn-num` 안에서 매번 체인을 다시 쓰면 폴백이 컴포넌트마다 갈린다.)

### 5.5 로딩 사고 방지 체크리스트

Nanum 사고와 Pretendard Std 사고의 **공통 원인은 "파일명·주석·옵션 이름을 믿고 바이너리를 안 열어본 것"** 이다.

- [ ] **1. 웹폰트를 추가·교체하면 cmap 을 파싱해 한글 음절 수를 센다.** 파일명·주석·패키지 설명은 증거가 아니다.
      `Pretendard Std` 는 이름에 "Std" 만 붙어 있고 한글이 0자였다. 아래 스니펫으로 CI 게이트를 건다.

- [ ] **2. `next/font/google` 의 `subsets` 는 다운로드 필터가 아니다 — preload 필터다.**
      `next/dist/compiled/@next/font/dist/google/loader.js` 에서 확인:
      `findFontFilesInCss(css, preload ? subsets : undefined)` — `subsets` 는 `preloadFontFile` 플래그를
      정하는 데만 쓰이고, **Google CSS 응답의 @font-face 는 전부 self-host 된다.**
      실제로 Nanum Brush/Pen Script 의 CSS 응답은 @font-face 93개이고 그중 **85개가 한글 unicode-range** 다
      (Google 이 전부 `/* latin */` 으로 라벨링해서 `font-data.json` 에 `subsets: ["latin"]` 으로 기록될 뿐).
      → **`subsets:["latin"]` 이 한글을 잘라낸 게 아니다.** `layout.tsx:54-55` 의 주석은 틀렸다.

- [ ] **3. `display: "optional"` + `preload: false` 조합 금지.**
      `optional` = block ~100 ms + **swap 0 ms**. 프리로드가 없으면 요청은 레이아웃 이후에 시작되므로
      100 ms 창을 구조적으로 못 맞춘다 → **첫 방문에서 영구 미적용**. 재방문(캐시)에서만 보인다.
      ← Nanum 사고의 진짜 원인이자, **현재 SUIT-700 이 그대로 갖고 있는 버그**.

- [ ] **4. `unicode-range` 로 쪼개진 폰트(한글 다이나믹 서브셋)에는 `optional` 절대 금지.**
      청크 요청은 정의상 "해당 코드포인트가 레이아웃에 등장한 뒤"에 시작된다. optional 과 상호 배타적이다.

- [ ] **5. `unicode-range` 는 파일 크기를 줄이지 않는다. 다운로드 여부만 게이트한다.**
      GmarketSans = 글리프 4개를 위해 365 KB. 글리프 수를 줄이려면 **반드시 실제 서브셋 파일을 만들어야** 한다.

- [ ] **6. `pyftsubset` / fontTools 서브셋 시 `--layout-features='*'` 를 명시한다.**
      기본값은 일부 GSUB feature 를 드롭한다. `tnum` 이 사라지면 `tabular-nums` 가 조용히 무시되고,
      카운트다운이 초마다 흔들리는데 CSS 만 봐선 원인을 못 찾는다.

- [ ] **7. `tabular-nums` 를 쓰기 전에 그 폰트에 `tnum` GSUB feature 가 실제로 있는지 확인한다.**
      태그 존재만으로 부족 — **치환 후 advance 폭이 균일한지**까지 본다.
      Oswald 는 tnum 자체가 없어서 `font-variant-numeric` 이 no-op 이다 (spread 26.9% 유지).

- [ ] **8. 폰트 변수를 선언했으면 참조처가 있는지 확인한다.**
      `--font-brush` 는 어느 컴포넌트도 안 쓰는데 93개 파일이 빌드에 들어간다.
      `grep -r "var(--font-<name>)" app components` 가 0건이면 선언을 지운다.

- [ ] **9. 배포 후 "실제로 어떤 폰트로 렌더됐는지"를 눈이 아니라 API 로 확인한다.**
      ```js
      // DevTools Console — 폴백으로 떨어졌는지 판별
      document.fonts.check('400 15px "Pretendard-ko"')           // false 면 미로딩
      ;[...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`)
      ```
      DevTools → Rendering → **"Font rendering / Show font fallbacks"** 로 글리프 단위 실제 폰트를 본다.
      `getComputedStyle(el).fontFamily` 는 **선언된 체인**을 돌려줄 뿐 실제 렌더 폰트가 아니다 — 사고를 못 잡는다.

- [ ] **10. 한글이 섞인 실제 문자열로 육안 확인한다.**
      확인 문자열: `공놀이판 08:10 뉴욕 메츠 vs 애틀랜타 브레이브스 1,234볼 · 3:1`
      (한글 + 콜론 시각 + 쉼표 숫자 + 스코어를 한 줄에 모두 포함)

- [ ] **11. CI 게이트를 건다.** 아래를 `__tests__/fonts.test.ts` 로 고정.
      ```ts
      // 한글 커버리지와 총 바이트를 테스트로 못 박는다.
      // Pretendard Std 사고(한글 0자)와 예산 초과를 둘 다 막는다.
      it("본문 폰트가 KS X 1001 한글을 담고 있다", () => {
        const cps = readCmapCodepoints("public/fonts/Pretendard-ko-400-800.woff2")
        const hangul = [...cps].filter(c => c >= 0xac00 && c <= 0xd7a3)
        expect(hangul.length).toBeGreaterThanOrEqual(2350)   // 현행 Std 는 0 → 즉시 실패
      })
      it("폰트 총 payload 가 예산 안에 있다", () => {
        const total = sum(glob("public/fonts/*.woff2").map(size))
        expect(total).toBeLessThanOrEqual(400 * 1024)
      })
      ```

- [ ] **12. `adjustFontFallback` 이 실제 폴백과 맞는지 본다.**
      현행은 `adjustFontFallback: "Arial"` — 라틴 메트릭 기준이라 **한글 폴백(Apple SD Gothic Neo / Malgun Gothic)
      에는 의미가 없다.** 한글 본문이 실제로 웹폰트를 타게 된 뒤 CLS 를 재측정하고,
      필요하면 `@font-face { size-adjust: … }` 를 직접 손으로 잡는다.

---

## 6. 타입 스케일 제안

### 현행 실측

- **게시글 본문**: `components/editor/tiptap-content.tsx` → `prose prose-sm` = **14 px / line-height 1.714**
  (`globals.css` 에서 `.tiptap.ProseMirror p { line-height: 1.75 }` 로 덮음)
  → **브리프의 "본문 15px" 은 실제와 다르다. 지금은 14 px 이다.**
- **전역 body**: `font-size` 미지정(= 16 px 상속) / `line-height: 1.6` / `letter-spacing: -0.01em`
- **UI 클래스 빈도** (`app/` + `components/` 기준):

  | 클래스 | px | 사용 횟수 |
  | --- | ---: | ---: |
  | `text-sm` | 14 | 549 |
  | `text-xs` | 12 | 406 |
  | `text-[11px]` | 11 | **142** |
  | `text-[10px]` | 10 | **117** |
  | `text-[13px]` | 13 | 99 |
  | `text-lg` | 18 | 89 |
  | `text-[12px]` | 12 | 85 |
  | `text-[14px]` | 14 | 43 |
  | `text-base` | 16 | 39 |
  | `text-[15px]` | 15 | 10 |

**진단 두 가지**
1. **10 px 이 117회.** 한글은 한 음절 안에 2–3개 자모가 들어가므로 라틴보다 최소 크기가 높다.
   1× DPR 화면(윈도우 데스크톱 다수)에서 10 px 한글은 획이 붙어 뭉갠다. **10 px 은 전면 폐지 대상.**
2. **`text-sm`(14) + `text-xs`(12) + 임의 px 이 뒤섞여** 사실상 스케일이 없다.
   14 와 13, 12 와 11 이 근거 없이 공존한다.

### 제안 스케일

기준 배수 ≈ 1.15–1.25 (한글은 라틴보다 촘촘한 스케일이 잘 맞는다 — 크기 차가 작아도 음절 블록 면적 차가 크다).

| 토큰 | px | line-height | letter-spacing | 용도 | 현행 대응 |
| --- | ---: | ---: | ---: | --- | --- |
| `--text-micro` | **11** | 16 (1.45) | 0 | 타임스탬프, 조회수, 뱃지 | `text-[10px]`(117회) + `text-[11px]`(142회) 통합 → **10 px 폐지** |
| `--text-caption` | **12** | 18 (1.50) | −0.005em | 메타, 칩, 라벨 | `text-xs`(406) / `text-[12px]`(85) |
| `--text-ui` | **13** | 20 (1.54) | −0.01em | 컴팩트 UI, 리스트 서브텍스트 | `text-[13px]`(99) |
| `--text-body` | **15** | 26 (1.73) | −0.01em | **본문 · 기본 UI** | `text-sm`(549) 14→15, `prose-sm` 14→15 |
| `--text-lead` | **17** | 28 (1.65) | −0.015em | 리드문, 카드 제목 | `text-base`(39) 16→17 |
| `--text-h4` | **17** | 24 (1.41) | −0.015em | 카드 헤더 | `text-lg`(89) 일부 |
| `--text-h3` | **19** | 27 (1.42) | −0.02em | 소제목 | `text-lg`(89) 18→19 |
| `--text-h2` | **23** | 31 (1.35) | −0.025em | 섹션 제목 | `text-xl`(31) / `text-2xl`(59) |
| `--text-h1` | **28** | 36 (1.29) | −0.03em | 페이지 제목 | `text-2xl`/`text-3xl` |
| `--text-display` | 34–44 | 1.05–1.10 | −0.035em | 스코어, 히어로 | `.gn-num text-[34px]` 등 — **디스플레이 담당 영역** |

**변경 요약**
- **본문 14 → 15 px.** 한글 본문에서 14 px 은 장문 가독성 한계선이다. 15 px 이 국내 콘텐츠 서비스 표준에 가깝다.
- **행간 1.6 → 1.7 (본문 1.73).** 한글은 어센더/디센더 리듬이 없어 눈이 줄을 놓치기 쉽다.
  라틴 권장(1.5–1.6)을 그대로 쓰면 답답하다. 게시글 본문 1.75 는 이미 맞게 잡혀 있었다 — 전역 body 만 뒤처져 있다.
- **10 px 전면 폐지 → 11 px 하한.**
- **자간 규칙**: 한글은 음절 블록이 이미 조밀해서 라틴만큼 조이면 안 된다.
  **크기가 커질수록 조이되 −0.03em 을 넘지 않는다.** (라틴 전용 디스플레이 슬롯은 예외로 −0.04em 까지 허용.)
- `text-sm`(549회)이 곧 본문이므로, Tailwind 의 `--text-sm` 자체를 15 px 로 재정의하면
  **549곳을 안 고치고 한 번에 이동**한다. 다만 `text-sm` 이 진짜 "작은 글씨"로 쓰인 곳이 섞여 있으니
  마이그레이션은 `--text-sm: 15px` 선반영 → 시각 회귀(`pnpm audit:diff`) 확인 순서로 간다.

---

## 부록 A. 실측 원자료

**tnum 치환 검증** (GSUB SingleSubst 직접 해석, 1000 em 정규화)

```
Barlow_Condensed  | tnum lookup: 10 subs
   default: 456,294,451,446,508,450,451,422,446,446   spread 42.1%
   tnum   : 520 × 10                                   spread 0%
Oswald            | tnum lookup: ABSENT
   default: 517,378,478,477,483,476,503,386,499,502   spread 26.9%
   tnum   : (변화 없음)                                spread 26.9%
Archivo_Narrow    | tnum lookup: 20 subs   →  456 × 10   spread 0%
Roboto_Condensed  | tnum lookup: 12 subs   →  494 × 10   spread 0%
Bebas_Neue        | tnum lookup: 10 subs   →  400 × 10   spread 0%
Pretendard        | tnum lookup: 16 subs
   default: 596,438,587,617,624,597,613,552,606,613   spread 29.7%
   tnum   : 614 × 10                                   spread 0%
SUIT-700          | tnum lookup: 12 subs
   default: 644,418,576,591,619,602,602,565,594,602   spread 35.1%
   tnum   : 618 × 10                                   spread 0%
```

**GSUB feature 목록**

```
Pretendard Std Var : aalt calt case ccmp clig cv01–cv13 dlig dnom frac fwid locl numr ordn
                     pnum pwid salt sinf ss01–ss16 subs sups tnum zero   (44개)
SUIT-700           : aalt pnum sinf ss01 ss17 subs sups tnum
Barlow Condensed   : ccmp dnom frac liga locl numr pnum tnum
Oswald             : ccmp frac liga locl                       ← tnum/pnum 없음
Archivo Narrow     : ccmp dnom frac liga locl numr pnum tnum
Roboto Condensed   : ccmp dnom frac liga lnum locl numr pnum tnum
Bebas Neue         : ccmp dnom frac locl numr pnum tnum
Wanted Sans Var    : aalt cv03 cv21 salt ss03 ss06 ss07        ← tnum/pnum 둘 다 없음
```

**수직 메트릭** (1000 em 정규화)

| 폰트 | x-height | cap-height | typo asc/desc | hhea 라인박스 | latin woff2 |
| --- | ---: | ---: | --- | ---: | ---: |
| Pretendard Std Var 1.309 | 530 | 707 | 952 / −241 | 1.193 em | 285 KB |
| SUIT-700 (2.040) | 461 | 722 | 988 / −260 | 1.248 em | 169 KB |
| Barlow Condensed 1.408 | 517 | 700 | 1000 / −200 | 1.200 em | 21.9 KB |
| Archivo Narrow 3.002 | 526 | 686 | 1035 / −312 | 1.347 em | 18.3 KB |
| Roboto Condensed 3.008 | 528 | 711 | 750 / −250 (+50 gap) | 1.172 em | 50.2 KB |
| Bebas Neue 2.000 | 700 | 700 | 900 / −300 | 1.200 em | 13.5 KB |
| Oswald 4.103 | 578 | **810** | 1193 / −289 | **1.482 em** | 21.0 KB |

**라이선스 확인**

| 폰트 | 라이선스 | 서브셋/재배포 | 확인처 |
| --- | --- | --- | --- |
| Pretendard 1.3.9 | SIL OFL 1.1 | 가능 (단독 판매만 금지) | github.com/orioncactus/pretendard |
| SUIT | SIL OFL 1.1 | 가능 | github.com/sun-typeface/SUIT |
| Wanted Sans 1.0.3 | SIL OFL 1.1 | 가능 | github.com/wanteddev/wanted-sans |
| Freesentation | SIL OFL 1.1 | 가능 | noonnu.cc / freesentation.blog |
| Gmarket Sans | SIL OFL 1.1 | 가능 (RFN 조항상 파생 파일명 구분 필요) | corp.gmarket.com/fonts |
| Barlow Condensed / Oswald / Archivo Narrow / Roboto Condensed / Bebas Neue | SIL OFL 1.1 (Google Fonts) | 가능 | fonts.google.com |
| DIN 계열 | **상용 유료** — 무료 웹 배포판 없음 | — | **미확인 (후보 제외)** |

**미확인 항목** (추측하지 않고 남긴다)
- Freesentation 의 가변 폰트 / 웹 서브셋 배포 여부, 파일 용량, OpenType feature 구성.
- 실제 사용자 네트워크 분포(3G/LTE/5G 비율) — `display` 값 선택은 사양 근거로만 판단했고 RUM 데이터로 검증되지 않았다.
- `font-size-adjust` 두 값 문법의 국내 인앱 웹뷰(카카오톡/네이버앱) 실지원 — Baseline 진입(2024)만 확인.

## 부록 B. 실행 순서

1. **P0 — 한글 본문 복구.** `scripts/build-pretendard-subset.py` 로 355 KB 빌드 → `layout.tsx` 교체.
   (이것만으로 사이트의 한글 타이포그래피가 처음으로 통제된다.)
2. **P0 — GmarketSans @font-face 삭제.** 365 KB 즉시 절감. 실사용처가 없어 회귀 위험 0.
3. **P1 — Nanum Brush 선언 삭제**, **Barlow Condensed 700 단일화**, **`.gn-num` letter-spacing 제거**.
4. **P1 — SUIT 은퇴**, `--font-title` → `--font-sans` 별칭. 제목은 웨이트 대비로 전환.
5. **P2 — 타입 스케일 이관.** `--text-sm: 15px` 선반영 → `pnpm audit:diff` 로 시각 회귀 확인 → 10 px 제거.
6. **P2 — CI 게이트**(체크리스트 11번) 추가.
7. 디스플레이 담당의 픽이 확정되면 `--font-display` 를 §2 의 계약(≤120 KB / swap / preload 없음 / cmap 검증)대로 연결.

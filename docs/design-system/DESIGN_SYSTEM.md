# gongnori.fan 디자인 시스템

> **이 문서 하나만 읽고도 기존 제품과 같은 디자인 언어로 새 화면을 만들 수 있어야 한다.**
> 그게 안 되면 이 문서의 결함이다 — 고쳐서 커밋할 것.

작성 2026-08-25 · 기준 = **그날 검수를 마친 프로덕션 UI**
관련: [TOKENS.md](./TOKENS.md) · [TYPOGRAPHY.md](./TYPOGRAPHY.md) · [COMPONENTS.md](./COMPONENTS.md) · [RESPONSIVE.md](./RESPONSIVE.md)

---

## 0. 이 시스템은 새로 만든 게 아니다

**현재 UI에서 이미 잘 작동하는 패턴을 추출해 규칙으로 굳힌 것**이다. 새 디자인을
발명하지 않았다. 그래서 이 문서와 화면이 어긋나면 **대체로 화면이 맞고 문서가 틀렸다** —
문서를 고쳐라. 반대로 화면 쪽이 명백한 사고(예: 브랜드 색이 두 값)라면 화면을 고친다.

### 왜 필요했나 — 2026-08-25 감사 실측

| 지표 | 실측 | 판정 |
|---|---:|---|
| 유저 지면 TSX 안 raw hex | **677회 / 185종** | 🔴 심각 |
| 브랜드 와인색 값 | **2종** (`#961e37`, `#8b1e3f`) | 🔴 수정함 |
| 거의 같은 검정 | **10종** | 🔴 |
| 폰트 크기 종류 | **30종** (0.5px 사다리 포함) | 🔴 수정함 → 8종 |
| 타입 스케일 토큰(`--wc-fs-*`) 사용 | **0회** | 🔴 정의만 하고 전부 우회 |
| `rounded-md` vs `rounded-lg` | **둘 다 8px** | 🔴 구분이 허구 |
| raw `<button>` | **256개** | 🟠 |
| 임의 spacing | 104곳 | 🟢 양호 |
| 임의 breakpoint(TSX) | **0곳** | 🟢 양호 |
| radius 명명 클래스 비율 | 98% | 🟢 양호 |

핵심 진단: **토큰이 없어서 생긴 문제가 아니다.** 토큰은 171개나 있었다.
문제는 **컴포넌트가 토큰을 안 거치고 값을 직접 썼다**는 것이다. 그래서 이 시스템의
1번 규칙은 "토큰을 더 만들자"가 아니라 **"있는 토큰을 쓰라"** 다.

---

## 1. 디자인 원칙

1. **종이 위의 잉크.** 기본 지면은 흰 종이(`--wc-paper`)에 웜 그레이 잉크(`--wc-ink`).
   회색이 아니라 **따뜻한** 중성색이다 — 순수 무채색(`#111`, `#888`)을 쓰지 않는다.
2. **와인은 아껴 쓴다.** `--wc-burgundy`는 브랜드색이자 액션색이다. 넓은 면을 칠하지
   않고 **버튼·활성 상태·강조 텍스트**에만 쓴다. 넓게 칠하면 강조가 죽는다.
3. **다크는 선언 영역에만.** 어두운 면(`--gn-night` 계열)은 **페이지 밴드·푸터** 같은
   "여기서부터 이 페이지다" 를 선언하는 자리에만 쓴다.
   🚫 **베팅·픽 카드에 다크 배경 금지** (운영자 확정).
4. **위계는 배경 틴트·칩·굵기로 만든다.**
   🚫 **한쪽 면 액센트 보더 영구 금지** — `border-left: 3px solid …` 류는 어떤 경우에도
   쓰지 않는다 (운영자 확정). 위계가 필요하면 배경 틴트나 칩을 쓴다.
5. **한글이 1급 시민.** 모든 크기·자간·줄바꿈은 한글 기준으로 정한다.
   본문에 `word-break: keep-all`, 제목에 `text-wrap: balance`.
6. **빈 상태도 화면이다.** 데이터가 없을 때 빈 칸을 남기지 않는다 — 접거나 채운다.

---

## 2. 구조 — Single Source of Truth

```
디자인 토큰 (CSS 변수)
        ↓
base 컴포넌트  (components/ui/*)      ← 토큰을 실제 CSS 로 바꾸는 유일한 층
        ↓
공용 UI 컴포넌트 (components/*)
        ↓
기능 컴포넌트   (components/<feature>/*)
        ↓
페이지          (app/**/page.tsx)
```

**의존 방향은 아래로만.** 페이지가 스스로 색·크기를 발명하면 그 순간 시스템 밖이다.

| 층 | raw 값 사용 |
|---|---|
| `components/ui/**` (shadcn base) | ✅ **허용** — 토큰을 CSS 로 바꾸는 곳이 어딘가는 있어야 한다 |
| 그 외 전부 | ❌ 토큰만 |

### 토큰 스코프 (3개 — 합치지 말 것)

| 파일 | 스코프 | 역할 |
|---|---|---|
| `app/worldcup/wc-tokens.css` | `.worldcup-scope` | **주 시스템**. 앱 셸이 전역으로 감싼다 |
| `app/a-tokens.css` | `:root` | `--gn-*` — 다크 밴드·푸터 등 선언 영역 |
| `app/globals.css` | `:root` + `@theme` | Tailwind 매핑·서체·그림자 |

⚠️ `app/games/draft/draft-tokens.css`(`--draft-*`)와
`app/home-preview/preview-tokens.css`(`--gnp-*`)는 **의도적으로 분리된 스코프**다.
드래프트 게임은 자체 비주얼 언어를 갖는다 — 본 시스템으로 흡수하지 말 것.

---

## 3. 빠른 참조

새 화면을 만들 때 이 표만 보면 된다. 상세는 각 문서로.

| 무엇 | 쓸 것 | 쓰지 말 것 |
|---|---|---|
| 배경 | `var(--wc-paper)` | `#fff`, `#ffffff` |
| 카드 면 | `var(--wc-card)` + `var(--wc-line)` 보더 | raw hex |
| 본문 텍스트 | `var(--wc-ink)` | `#111`, `#1a1a1a` |
| 보조 텍스트 | `var(--wc-mute)` | `#666`, `#888` |
| 흐린 텍스트 | `var(--wc-mute-2)` | — |
| 구분선 | `var(--wc-line)` / 강한 것 `var(--wc-line-2)` | `#e8e5e0` 직접 |
| 액션·강조 | `var(--wc-burgundy)` | `#961e37` 직접, `#8b1e3f` |
| 성공 | `var(--wc-go)` | `green-600` |
| 경고 | `var(--wc-warn)` | `amber-500` |
| 오류·하락 | `var(--wc-down)` | `red-500` |
| 소프트 서피스 | `var(--wc-soft)` | `#f2efea` |
| 폰트 크기 | 12/13/14/16/20/26/31/42 | `text-[11px]`, `text-[15px]` |
| 그림자 | `var(--wc-shadow-1~3)` | 인라인 box-shadow |
| radius | `rounded` `rounded-xl` `rounded-full` | `rounded-[7px]` |
| 여백 | Tailwind 기본 스케일 | `p-[13px]` |
| breakpoint | `sm:` `lg:` | `min-[760px]:` |

---

## 4. Do / Don't

### 색

```tsx
// ✅ 토큰
<div style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }} />
<span style={{ color: "var(--wc-burgundy)" }} />

// ❌ raw 값 — 브랜드색이 두 개로 갈린 원인이 정확히 이것이었다
<span style={{ color: "#961e37" }} />
<span className="text-[#8b1e3f]" />

// ⚠️ 폴백을 쓸 거면 **토큰의 실제 값**과 같아야 한다.
//    실사고: var(--wc-burgundy, #8B1E3F) — 토큰은 #961e37 이라 폴백이 다른 색이었다.
<span style={{ color: "var(--wc-burgundy, #961e37)" }} />
```

### 타이포

```tsx
// ✅ 스케일 안
<p className="text-[14px] font-medium">본문</p>
<h2 className="text-[20px] font-bold">섹션 제목</h2>

// ❌ 스케일 밖 — 11px 과 11.5px 을 눈으로 구분할 사람은 없다
<p className="text-[11.5px]">…</p>
```

### 위계

```tsx
// ✅ 배경 틴트로 강조
<div style={{ background: "var(--wc-soft)" }}>…</div>

// 🚫 한쪽 면 액센트 보더 — 영구 금지
<div style={{ borderLeft: "3px solid var(--wc-burgundy)" }}>…</div>
```

### 컴포넌트

```tsx
// ✅ 공용 컴포넌트
import { Button } from "@/components/ui/button"
<Button variant="default" size="sm">확인</Button>

// ❌ 같은 걸 또 만들기
<button className="rounded-md bg-[#961e37] px-3 py-2 text-white">확인</button>
```

---

## 5. 가드 — 이 시스템이 다시 무너지지 않게

문서만으로는 무너진다. 실제로 무너졌었다 (토큰 171개가 있는데 raw hex 677회).
그래서 **기계가 센다**.

```bash
node scripts/check-design-tokens.mjs            # 검사
node scripts/check-design-tokens.mjs --report   # 위반 위치까지
node scripts/check-design-tokens.mjs --update   # 줄었을 때 상한 재잠금
```

**래칫 방식**이다. 전면 금지가 아니라 **현재 숫자를 상한으로 박아 두고 늘어나면 실패**시킨다.
677곳을 한 번에 고치면 regression 위험이 너무 크기 때문이다. 줄면 상한을 내려 다시 잠근다.
"새 코드가 더 나빠지지 않는다" 만 보장해도 시스템은 서서히 회복한다.

기준선 (2026-08-25): `scripts/design-token-budget.json`

| 항목 | 상한 |
|---|---:|
| raw hex 색상 | 655 |
| 스케일 밖 폰트 크기 | 51 |
| 임의 spacing | 100 |
| `!important` | 8 |

⚠️ 검사 대상은 **유저가 보는 지면만**이다. `app/admin`·`app/dev`·`components/ui`는 제외 —
내부 도구까지 조이면 실험이 막히고, 정작 유저 지면의 신호가 노이즈에 묻힌다.

---

## 6. 이 문서를 고쳐야 할 때

- 새 UI 패턴을 도입했다 → **COMPONENTS.md 에 추가하고 커밋**
- 새 토큰이 필요하다 → 먼저 기존 토큰으로 안 되는 이유를 확인. 그래도 필요하면
  `wc-tokens.css` 에 추가하고 [TOKENS.md](./TOKENS.md) 갱신
- 규칙이 현실과 안 맞는다 → 현실을 확인하고 **문서를 고쳐라.** 낡은 문서는 없는 문서보다 나쁘다

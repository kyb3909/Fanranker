# 컴포넌트

[← DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)

> **새 UI를 만들기 전에 이 문서에서 먼저 찾아라.** 있으면 쓴다. 없으면 왜 없는지 확인하고
> 만든 뒤 **이 문서에 추가한다.**

---

## base 컴포넌트 — `components/ui/*`

shadcn 패턴. **여기만 raw 값을 써도 된다** — 토큰을 실제 CSS로 바꾸는 층이기 때문이다.

| 컴포넌트 | 파일 | 사용 파일 수 |
|---|---|---:|
| Button | `ui/button.tsx` | 69 |
| Card | `ui/card.tsx` | 47 |
| Badge | `ui/badge.tsx` | 24 |
| Input | `ui/input.tsx` | 22 |
| Avatar | `ui/avatar.tsx` | 14 |
| Table | `ui/table.tsx` | 13 |
| Dialog | `ui/dialog.tsx` | 9 |
| Textarea | `ui/textarea.tsx` | 7 |
| Dropdown Menu | `ui/dropdown-menu.tsx` | 5 |
| Separator | `ui/separator.tsx` | 4 |
| Select · Tabs · Tooltip | 각 파일 | 3 |
| Skeleton | `ui/skeleton.tsx` | 2 |
| Popover · Sheet | 각 파일 | 1 |

그 외 보유: `alert` `alert-dialog` `collapsible` `label` `pagination` `sidebar` `spinner`
`toggle` `toast`/`toaster` `image-lightbox` `relative-time` `app-link`

⚠️ `app-link.tsx` — **내부 링크는 `next/link`가 아니라 이것을 쓴다.** 프로젝트 전용 래퍼다.

---

## Button

`components/ui/button.tsx` (cva). **`<button>`을 직접 만들기 전에 이걸 먼저 본다.**

### Variants

| variant | 외형 | 쓰는 곳 |
|---|---|---|
| `default` | 와인 배경 + 흰 글씨 | 주 액션 (제출·확인·참여) |
| `secondary` | 소프트 배경 | 보조 액션 |
| `outline` | 보더 + 투명 배경 | 취소·부가 |
| `ghost` | 배경 없음, hover만 | 아이콘 옆 텍스트, 툴바 |
| `destructive` | 빨강 | 삭제·탈퇴 |
| `link` | 밑줄 텍스트 | 인라인 링크형 |

### Sizes

| size | 높이 | 좌우 패딩 |
|---|---|---|
| `sm` | 32px | 12px (아이콘 포함 시 10px) |
| `default` | 36px | 16px (아이콘 포함 시 12px) |
| `lg` | 40px | 24px (아이콘 포함 시 16px) |
| `icon` / `icon-sm` / `icon-lg` | 36 / 32 / 40 정사각 | — |

### States

| 상태 | 처리 |
|---|---|
| hover | variant별 `/90`·`/80` 알파 또는 `bg-accent` |
| focus | `focus-visible:ring-[3px]` + `ring-ring/50` — **끄지 말 것** |
| disabled | `opacity-50` + `pointer-events-none` |
| loading | 별도 variant 없음 → `disabled` + `<Spinner />` 조합 |

### 공통

- radius `rounded-md`(8px), 폰트 `text-sm` + `font-medium`
- 아이콘 크기 자동 `size-4`(16px), 간격 `gap-2`
- 다른 요소로 렌더하려면 `asChild` (예: `<Button asChild><Link …/></Button>`)

```tsx
// ✅
<Button size="sm" variant="outline">취소</Button>
<Button asChild><Link href="/write">글쓰기</Link></Button>

// ❌ 같은 걸 또 만들기
<button className="rounded-md bg-[#961e37] px-3 py-2 text-white">확인</button>
```

### ⚠️ 미해결 — raw `<button>` 256개

유저 지면에 `<button>` 태그가 256개 있고, Button 컴포넌트를 import하는 파일은 43개다.

**전부 통합 대상은 아니다.** 다음은 raw `<button>`이 **맞다**:
- 필터 칩 / 탭 트리거 (`.wc-chip-tabs` 등 자체 스타일 체계)
- 아이콘 전용 토글 (좋아요·북마크·투표 화살표)
- 카드 전체가 클릭 대상인 경우

통합 대상은 **"버튼처럼 생긴 것"** 이다 — 배경·보더·패딩을 갖고 액션을 수행하는 것.
UX 의미가 다르면 합치지 않는다.

---

## 자체 공용 컴포넌트 (base 밖)

| 컴포넌트 | 파일 | 역할 |
|---|---|---|
| `PageBand` / `PageBandStat` | `components/page-band.tsx` | **페이지 상단 다크 밴드.** 제목·키커·설명·우측 스탯. 페이지 선언 |
| `SectionHeader` | `components/section-header.tsx` | 섹션 제목 + 우측 액션 |
| `BridgeRow` | `components/bridge-row.tsx` | 지면 간 이동 유도 줄 |
| `AdPlaceholder` | `components/sidebar/ad-placeholder.tsx` | 광고 슬롯 (**프로덕션에선 렌더 안 함**) |
| `MobileTabBar` | `components/mobile-tab-bar.tsx` | 하단 탭 6개 |
| `FloatingWriteButton` | `components/floating-write-button.tsx` | 글쓰기 FAB |
| `SiteFooter` | `components/site-footer.tsx` | 다크 푸터 |

### PageBand 사용 규약

```tsx
<PageBand
  kicker="Explore"        // ⚠️ 라틴 대문자만 — 한글 넣으면 자간 0.2em 때문에 깨진다
  title="운동장"
  description="한 줄 설명"
  aside={<PageBandStat value={n} label="Open Board" />}  // ⚠️ 단복수 처리할 것
/>
```

---

## 상태 컴포넌트

| 상태 | 처리 |
|---|---|
| Loading | `ui/skeleton.tsx` 또는 `ui/spinner.tsx` |
| Empty | 페이지별 구현 — **빈 칸을 남기지 않는다.** 아이콘 + 한 줄 설명 + 행동 버튼 |
| Error | `app/error.tsx` · `app/community/[slug]/error.tsx` |
| Toast | `ui/toaster.tsx` (`use-toast` 훅) |

### ⚠️ 빈 상태 규칙

빈 상태에서 **레이아웃이 무너지지 않게** 한다. `/explore`에서 인기글이 0개일 때
좌측 칼럼이 752px에서 끝나는데 우측 레일은 1407px까지 이어져 **655px의 흰 벽**이
생겼다. 2열 레이아웃에서 한쪽이 빌 수 있으면 **접거나 1열로 떨어뜨린다.**

---

## 카드 패턴

| 패턴 | 구성 |
|---|---|
| 기본 카드 | `background: var(--wc-card)` + `border: 1px solid var(--wc-line)` + `rounded-xl` |
| 떠 있는 카드 | 위 + `boxShadow: var(--wc-shadow-1)` — **보더를 따로 주지 않는다** (그림자에 내장) |
| hover | `.gn-card-lift` (그림자만 변화, 배경 유지) |

🚫 **베팅·픽 카드에 다크 배경 금지** (운영자 확정)
🚫 **한쪽 면 액센트 보더 금지** — `border-left: 3px` 류는 영구 금지

---

## 매치센터 기록·라인업 (2026-09-05)

- `MatchStatComparison`: 주요 13개는 `lib/match/stat-presentation.ts`의 순서로 표시하고 나머지는 공용 outline Button으로 펼친다. 누락 기록은 0으로 생성하지 않는다. 전체 수집 정책은 유지한다.
- `MatchLineup`: 선수 명단만 표시한다. 포메이션 피치·보기 전환·포메이션 숫자는 표시하지 않는다 (2026-09-06 사용자 요청). 모바일은 팀 선택, sm 이상은 두 팀 비교. 벤치는 별도 details로 표시한다. 저장된 라인업 데이터와 교체·득점 기록은 유지한다.
- 예상/확정 배지는 `MatchLineup`이 현재 표시 중인 명단으로 결정한다. 예상 응답은 60초 재조회하며 확정 후에도 서버 갱신의 교체·득점 기록을 반영한다. 경기 이동 시 이전 명단을 초기화한다 (2026-09-06).
- 개발 전용 `/dev/match-preview`는 가상 데이터로만 동작하며 운영 빌드에서는 404다.

## 중복 구현 현황 (Phase 2 조사 결과)

조사 결과 `PrimaryButton` / `SubmitButton` 류의 **명시적 중복 컴포넌트는 없었다.**
드리프트는 "이름이 다른 같은 컴포넌트" 형태가 아니라 **"공용을 안 쓰고 인라인으로 푼"**
형태로 나타난다. 그래서 통합 작업의 대상은 컴포넌트 이름이 아니라 **인라인 스타일**이다.

| 항목 | 실측 | 조치 |
|---|---:|---|
| raw `<button>` | 256 | 성격 분류 후 점진 수렴 |
| raw hex in TSX | 655 | 가드로 상한 잠금, 점진 감소 |
| 중복 명명 컴포넌트 | 0 | 조치 불필요 |

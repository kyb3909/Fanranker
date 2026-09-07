# 굿즈랩 개편 기획 v2 — 작품 페이지 중심 + 마플식 카탈로그

2026-09-05 · 운영자 지시 반영. 이 문서가 `app/goods-lab/` 의 **정본**이다.
직전 문서(카탈로그 확장안)의 내용은 §3·§4 에 압축해 넣었다 — 따로 읽을 필요 없다.

> **2026-09-05 검토 반영 · 단계별 구현:** 사용자와 검토한 개선안을 순서대로 구현한다.
> 아래 본문의 기존 `30명 + 승인 → 제작 확정` 설명보다 **30명은 무료 관심에 따른 제작 검토 기준**이라는 정의가 우선한다.
> 1단계는 작품 허브·관심 선택 유지·집계 정합·진행 안내, 2단계는 26품목 카탈로그·상품 상세,
> 3단계는 작가/파트너의 시안·견적·승인 연결이다. 구현 범위와 검증 기록은 [IMPLEMENTATION.md](./IMPLEMENTATION.md)를 본다.
> 시연은 DB/API 무변경이며 브라우저에 저장하는 관심 표시는 실제 사용자 투표나 주문이 아니다.

> 코덱스/에이전트에게: §5(데이터 모델) · §7(구현 순서) · §8(규약·함정)만 읽어도 구현할 수 있게 썼다.
> §9 의 결정은 **기본값이 이미 정해져 있다** — 운영자가 바꾸지 않았다면 기본값대로 간다.

---

## 0. 한 줄 결론

| | 지금 (2026-09-05 구현분) | 개편 |
|---|---|---|
| 작품을 누르면 | **모달** (576px 다이얼로그) | **작품 상세 페이지** `/goods-lab/art/[id]` — 덕템 §6 "핵심 허브" |
| 큰 그림 | 없음 (목업 3장 썸네일) | 좌측 1fr, 원화 `max-h 640` |
| 공유 | 불가 (URL 없음) | 페이지 URL + OG 목업 — 마케팅 "카톡 공유" 배선 |
| 품목 | 3 (판매 3) | **26 / 9 카테고리** (판매 9 · 2단계 12 · 확인 4 · 신호 2) |
| 카탈로그 | 없음 | `/goods-lab/shop/[id]` — 마플식 카테고리 + 그리드 |
| 상품 상세 | 없음 | `/goods-lab/shop/[id]/[itemId]` — 레드버블 PDP 비율 |
| 에디터 | `/goods-lab/design/[id]` (완성) | 그대로. 템플릿 3 → 형태 그룹 11 |
| 파트너 | `/goods-lab/partner` (완성) | 수요 보드 열 5 → 카테고리 9, 승인 카드 ③ 품목군 표기 |

**왜 3개로 보였나**: 네 전문가의 거부권을 층 구분 없이 합쳤고, "요청 가능 ≠ 판매 가능" 제안을 화면까지 좁혔다.
**진짜 병목**: 팬아트 업로드가 **512px** 만 남긴다 (`app/api/stickers/route.ts:118`). 원본 보관 없이는 지금 3개도 못 찍는다 (§4).

---

## 1. 모달 → 작품 상세 페이지 (덕템식)

### 1.1 왜 페이지인가

- **URL 이 없다.** 마케팅 관점의 유일한 유입 배선이 "카톡 공유 + OG 목업"인데 모달은 공유할 주소가 없다.
- **크게 못 보인다.** 다이얼로그 576px 안에 원화 · 목업 3장 · 품목 3줄 · 신호 · 작가 토글이 다 들어가 있다. 벽에서 작품을 눌렀는데 그림이 더 작아진다.
- **뒤로가기 · 딥링크 · 검색 노출**이 전부 어색하다. 파트너 미팅에서 "이 작품 보세요" 하고 링크를 못 준다.
- 덕템 PRD §6 이 작품 상세를 "핵심 허브 — 이미지 뷰어 + 작가 정보 + 굿즈화 요청 패널 + 캠페인 연결"로 정의했고, 실제 구현도 그렇다. 우리 모달은 그 허브를 접어 넣은 것이었다.

### 1.2 덕템 실측 (`src/app/(main)/artworks/[id]/page.tsx`)

```
max-w-5xl · grid lg:[1fr_320px] · lg 미만 세로 스택
좌  이미지 (ink-frame, max-h 520, eager) → 제목 + ♥수 + 공유 → 시리즈/팬메이드 표기 → 설명 → 태그(#, 목록 필터 링크)
우  작가 카드(아바타 · 이름 · @핸들 · 팔로워)
    「굿즈로 만들어주세요」 패널 — 요청 있는 품목만 "N명 대기 중" 목록(내림차순) + [굿즈화 요청하기] → 다이얼로그(품목 다중 선택)
    「이 작품의 캠페인」 — 카드: 진행 중 배지 · 이미지 · "제목 — 품목" · 작가 · 품목 · 가격 · 11/34개 32% 게이지 · 9명 참여 · 15일 남음
```

### 1.3 우리 매핑 — `/goods-lab/art/[pieceId]`

```
max-w-5xl · grid lg:[1fr_320px]

좌
  원화 — 상자 없이, max-h 640, 정사각/세로/가로 비율 그대로 (object-contain). LCP 대상이라 priority
  제목 · ♥ {faves} · [공유]                       ← 공유는 navigator.share → 폴백 클립보드
  [팀 칩] · by {creator}
  설명 (신규 필드 description, 2~3줄)
  태그 #… → /goods-lab?tag= (벽의 레일 필터로 연결)

우 (320)
  ① 작가·팀 카드 — 팀 컬러 칩/엠블럼 · 작가명 · "작품 N개" (시연값)
  ② 「갖고 싶어요」 패널
       요청 있는 판매 품목만 "N명 모으는 중" 목록 (demandFor 내림차순)
       목표 30명 · 달성률 (마케팅: 초과는 그대로 표시)
       [갖고 싶어요] → 품목 고르기 다이얼로그 (판매 9 다중 선택, 1인 1표/품목, 즉시 반영)
       하단 소문자: "입체로도 원해요 · N명" 토글 (신호)
  ③ 「이 작품의 진행」 — 캠페인 카드 (fanCampaigns 중 이 작품)
       배지: 모으는 중 / 구단 확인 중 / 제작 확정 D-N / 수정 중
       "제목 — 품목" · 가격 · 작가 몫 · N명/30 · 달성률 (또는 D-N)
  ④ 「이 작품으로 만들 수 있는 것」 — 카탈로그 스트립 (가로 스크롤 6~8장, 목업+이름+단계 배지) → [전체 26개 보기] → /goods-lab/shop/[id]
  ⑤ 「작가 화면」 — 품목별 "cm · dpi" 요약 + [작가 작업 화면 열기 →] → /goods-lab/design/[id]

lg 미만: 원화 → 제목/태그 → ② 갖고 싶어요 → ③ 진행 → ④ 만들 수 있는 것 → ① 작가 → ⑤
(요청 패널을 작가 카드보다 위로 — 모바일에선 첫 스크롤 안에 버튼이 있어야 한다)
```

**메타데이터** — `generateMetadata`: title `{제목} — {작가} · 굿즈랩`, description `{N}명이 갖고 싶어 해요 · 목표 30명`, `openGraph.images` = 대표 목업 1장 (`/goods-lab/og/[id]` 라우트, `ImageResponse` 로 원화+품목 실루엣 합성. 시연은 원화 그대로도 됨). ⚠️ 루트 layout 의 openGraph 가 이기는 함정 (`app/match/[gameId]/page.tsx` 주석 참조) — page 에서 `openGraph` 를 명시.

**벽(`fan-client.tsx`) 변경** — 타일 `<button onClick=open>` → `<Link href=/goods-lab/art/[id]>`. "갖고 싶어요 · N명" 버튼도 링크. `WantDialog` 는 **폐기**. 벽의 "진행 중" 밴드는 유지하되 카드 클릭 → 작품 페이지.

---

## 2. 화면 흐름 (5장 + 파트너)

```
/goods-lab                 벽 — 태그 레일 + 메이슨리 + 진행 중 밴드         (팬)
  └─ /goods-lab/art/[id]   작품 상세 — 큰 그림 · 갖고 싶어요 · 진행 · 만들 수 있는 것   (팬)  ★ 허브
       ├─ /goods-lab/shop/[id]            카탈로그 — 카테고리 9 · 그리드 26 · 단계 배지   (팬)
       │    └─ /goods-lab/shop/[id]/[item] 상품 상세 — 큰 목업 · 재질 · 크기 · dpi · 갖고 싶어요 (팬)
       └─ /goods-lab/design/[id]          에디터 — 배치 · 크기 cm · 재질 · dpi (완성)      (작가)
/goods-lab/partner         승인 큐 · 수요 보드 · 품목 정책 · 배분 · 파이프라인 (완성, §6 정합)  (파트너)
```

- 팬의 최단 경로: 벽 → 작품 → [갖고 싶어요] — **2클릭**. 모달 때와 같지만 이제 URL 이 남는다.
- 상품 상세는 **레드버블 PDP 비율**(썸네일 64 · 프리뷰 ~685 · 패널 ~575). 작가가 잡은 배치 그대로 큰 목업 + Finish(재질) 필 버튼 + Size(S/M/L cm 표기) + 가격/작가 몫 + dpi 판정 + [갖고 싶어요]. 판매가 아닌 단계면 버튼이 [원해요](신호)/[구단 확인 필요](비활성).
- 카탈로그 · 상품 상세 · 에디터는 **같은 `placementOf()` · `effectiveDpi()`** 를 읽는다.

---

## 3. 카탈로그 — 9 카테고리 26 품목

단계: `sell` 판매 · `phase2` 원본 보관 뒤 · `confirm` 구단 확인 · `signal` 신호만. 권리 층: 인쇄 소품 / 어패럴 / 입체.

| 카테고리 | 품목 | 층 | 긴 변 cm | 1200px dpi | 단계 | 형태 |
|---|---|---|---|---|---|---|
| 스티커 | 조각 스티커 | 인쇄 | 7 | 435 | sell | sheet |
| | 원형 스티커 | 인쇄 | 5 | 610 | sell | round |
| | 씰 스티커 시트 | 인쇄 | 14.8 | 206 | phase2 | sheet |
| 아크릴 | 아크릴 키링 | 인쇄 | 7 | 435 | sell | keyring |
| | 아크릴 스탠드 | 인쇄 | 10 | 305 | sell | stand |
| | 아크릴 코스터 | 인쇄 | 9 | 339 | sell | flat |
| | 아크릴 자석 | 인쇄 | 6 | 508 | phase2 (묶음 주문 조건) | flat |
| | 아크릴 블록 | 인쇄 | 8 | 381 | phase2 | flat |
| 지류·문구 | 포토카드 | 인쇄 | 8.5 | 359 | sell | card |
| | 메모지 | 인쇄 | 7.5 | 406 | sell | sheet |
| | 엽서 | 인쇄 | 15 | 203 | phase2 | card |
| | 노트 A5 | 인쇄 | 21 | 145 | phase2 | card |
| | 포스터 A4 / A3 | 인쇄 | 29.7 / 42 | 103 / 73 | phase2 (A3 벡터 한정) | poster |
| 팬굿즈 | 그립톡 | 인쇄 | 4 | 762 | sell | round |
| | 캔뱃지 | 인쇄 | 5.8 | 526 | sell | round |
| | 러버 키링 | 2D 금형 | — | — | phase2 (MOQ 200) | keyring |
| 리빙 | 머그 | 인쇄 | 20 | 152 | phase2 | wrap |
| | 텀블러 | 인쇄 | 20 | 152 | phase2 | wrap |
| 패션잡화 | 에코백 | 인쇄 △ | 25 | 122 | phase2 + confirm | bag |
| | 파우치 | 인쇄 | 18 | 169 | phase2 | bag |
| | 슬로건 타월 | 인쇄 △ | 90 | 34 | confirm (벡터 한정) | sheet |
| 스마트 | 폰케이스 | 인쇄 △ | 15 | 203 | phase2 | case |
| 의류 | 티셔츠 | 어패럴 | 29.7 | 103 | confirm | apparel |
| | 후드 | 어패럴 | — | — | confirm | apparel |
| 입체 | 레진 미니 피규어 | 입체 | — | — | signal | (목업 없음 — 원화) |
| | PVC 피규어 | 입체 | — | — | signal | (목업 없음 — 원화) |

판매 9 = 전부 10cm 이하 · 인쇄 소품 · UV 인쇄/레이저컷/버튼 프레스 → 업체 1~2곳, 승인 카드 한 장.
티셔츠 · 피규어는 **카탈로그에 보이되** 라벨이 논리를 지킨다("구단 확인 필요" / "입체로도 원해요").

---

## 4. 진짜 병목 — 원본 보관

dpi = `긴 변 px × 2.54 / 인쇄 긴 변 cm`. 300 이상 인쇄 가능, 200 미만 접수 불가.

| 보관 픽셀 | 경로 | 300dpi 가능 품목 |
|---|---|---|
| **512** | `app/api/stickers/route.ts:118` `.resize(512,512)` — **팬아트 업로드** | 그립톡 1개 |
| 1200 | `lib/images/rehost.ts:62` `maxWidth:1200` — 게시글 이미지 | 10cm 이하 11개 |
| **4000 (원본)** | 신규 | A3 포스터 · 타월 빼고 24개 |

시연의 `ART_PX = 1200` 은 게시글 프리셋 가정이다. 실서비스 0순위는 **원본 보관**(§7 S1) — 텀블러 · 머그 · 에코백이 안 되는 이유는 권리도 원가도 아니고 픽셀이다.

---

## 5. 데이터 모델 (fixtures.ts) — 코덱스가 그대로 치는 수준

### 5.1 타입 변경

```ts
export type Category = "sticker" | "acrylic" | "paper" | "fangoods" | "living" | "fashion" | "smart" | "apparel" | "solid"
export const CATEGORY_LABEL: Record<Category, string> = { sticker: "스티커", acrylic: "아크릴", paper: "지류·문구", fangoods: "팬굿즈", living: "리빙", fashion: "패션잡화", smart: "스마트", apparel: "의류", solid: "입체" }

export type Stage = "sell" | "phase2" | "confirm" | "signal"      // 기존 sell|phase2|signal 에 confirm 추가
export type RightsTier = "print" | "apparel" | "solid"
export type Template = "sheet" | "round" | "keyring" | "stand" | "flat" | "card" | "poster" | "wrap" | "bag" | "case" | "apparel"

export interface PrintArea {
  template: Template
  aspect: number          // 목업 박스 세로/가로
  x: number; y: number; w: number; h: number   // 인쇄 영역, 박스 대비 %
  cmW: number; cmH: number                       // 물리 치수
}

export interface DemoItem {
  id: string; name: string
  category: Category
  rightsTier: RightsTier
  stage: Stage
  mode: "instant" | "group"; form: "flat" | "solid"   // 기존 유지 (파트너 2×2)
  price: number; moq: number; demand: number
  officialBand: [number, number]; leadTime: string; note: string
  print?: PrintArea                                    // signal 품목은 없음
}

export interface GalleryPiece {
  // 기존 + 아래
  description: string      // 작품 페이지 설명 2~3줄
  shareText?: string
}
```

`SELL_ITEMS = itemsOfStage("sell")` 는 그대로 — 9개가 된다. `wantsOf(piece)` 는 작가가 정한 ≤3 → **≤5** 로 상한 완화 (판매 9 중).

### 5.2 형태 그룹 11 — 인쇄 영역 좌표 (박스 %)

| template | aspect | x | y | w | h | 몸체 | 쓰는 품목 |
|---|---|---|---|---|---|---|---|
| sheet | 1.00 | 10 | 10 | 80 | 80 | 흰 다이컷 여백(inset 6%) | 조각/씰 스티커 · 메모지 · 타월(가로형은 aspect 0.45, area 8/25/84/50) |
| round | 1.00 | 15 | 15 | 70 | 70 | 원형(border-radius 50%) | 원형 스티커 · 그립톡 · 캔뱃지 |
| keyring | 1.12 | 20 | 16 | 60 | 66 | 고리 구멍 top 5% | 아크릴 키링 · 러버 키링 |
| stand | 1.24 | 17 | 6 | 66 | 72 | 아치 + 받침 bar | 아크릴 스탠드 |
| flat | 1.00 | 12 | 12 | 76 | 76 | 두께감 그림자 | 코스터 · 자석 · 블록 |
| card | 1.50 | 8 | 6 | 84 | 88 | 흰 카드 라운드 | 포토카드(1.55) · 엽서 · 노트 표지 |
| poster | 1.41 | 6 | 6 | 88 | 88 | 종이 + 얇은 그림자 | 포스터 |
| wrap | 1.00 | 22 | 30 | 56 | 40 | 원통(좌우 라운드) + 손잡이(머그) | 머그 · 텀블러 |
| bag | 1.15 | 25 | 38 | 50 | 40 | 가방 실루엣 + 손잡이 | 에코백 · 파우치(1.0, 20/30/60/45) |
| case | 2.00 | 10 | 8 | 80 | 84 | 케이스 라운드 + 카메라 홀 | 폰케이스 |
| apparel | 1.10 | 30 | 28 | 40 | 36 | 티셔츠 앞판 실루엣 | 티셔츠 · 후드 |

`Mockup` 은 `ProductBody({template, body})` 를 11개로 확장하고, 인쇄 영역 좌표는 fixtures 가 든다. 캔버스는 `aspect` 로 뷰포트 높이에 묶는다(에디터 기존 로직).

### 5.3 배치 · 수요 — 그대로

`Placement {x,y,scale,rot,variant}` · `PLACEMENTS` · `placementOf()` · `effectiveDpi()` · `demandFor()` · `teamDemand()` · `cellOf()` — 변경 없음. `VARIANTS` 는 template 키 11개로 확장(기본 2개씩: 유광/무광 · 투명/화이트 · 화이트/스텐 등).

`BOARD_ITEMS` (수요 보드 열) → `BOARD_CATEGORIES: Category[]` 9개. `cellOf(teamId, category)` 는 그 카테고리 품목 합.

---

## 6. 파트너 화면 정합

- **수요 보드** — 열 = 카테고리 9. 셀 = 그 팀 작품 × 그 카테고리 품목 요청 합 + 수렴/분산. "입체" 열은 요청만(가격 없음).
- **품목 정책** — "파는 것은 셋뿐" → "판매 9 · 2단계 12 · 구단 확인 4 · 신호 2". 2×2 격자 유지. "뺀 것과 이유" → "판매를 미룬 것과 이유"(픽셀/원가/권리 층으로 묶어서).
- **승인 카드 ③** — `품목 · 소비자가` → `품목군 · 열린 품목`: "인쇄 소품 — 조각 스티커 · 아크릴 키링 · 포토카드" + 대표 가격. 승인 단위는 품목군(계약 시 화이트리스트) × 아트워크(건별) — MD 실무 2층.
- **배분표** — 판매 9 행.

---

## 7. 구현 순서

### 시연 (fixtures + 화면, DB 무변경) — 2~2.5일

| | 작업 | 산출 |
|---|---|---|
| P1 | fixtures: 카테고리 9 · 품목 26 · 형태 11 · `description` · `confirm` 단계 · `BOARD_CATEGORIES` | `fixtures.ts` |
| P2 | `Mockup`/`ProductBody` 템플릿 11 (§5.2 좌표) | `shared.tsx` |
| P3 | **작품 상세 페이지** `/goods-lab/art/[id]` (§1.3) + `generateMetadata` + 벽 타일 → Link · `want-dialog.tsx` 폐기 | `art/[pieceId]/{page,art-client}.tsx` |
| P4 | 카탈로그 `/goods-lab/shop/[id]` (좌 카테고리 · 그리드 · 단계 배지) | `shop/[pieceId]/{page,shop-client}.tsx` |
| P5 | 상품 상세 `/goods-lab/shop/[id]/[item]` (레드버블 PDP 비율) | `shop/[pieceId]/[itemId]/{page,item-client}.tsx` |
| P6 | 파트너 정합 (§6) · 에디터 스트립을 카테고리 탭으로 | `partner-client.tsx` · `design-client.tsx` |

순서 근거: P3 이 운영자 지시의 핵심이라 P1·P2 뒤 바로. P4·P5 는 P3 의 ④ 링크 목적지.

### 실서비스 — 미팅 반응 후

| | 작업 |
|---|---|
| S1 | **원본 보관** — `app/api/stickers/route.ts` 512 는 썸네일용 유지, 원본을 별도 경로 저장, `stickers.original_url` 컬럼(마이그레이션 → `gongnori-migration` 스킬), 상한 20MB · 긴 변 4000px. 스토리지 3MB × 1,000 = 3GB |
| S2 | SVG 업로드 허용(sanitize 재사용) → A3 포스터 · 타월 벡터 한정 해제 |
| S3 | 에디터 `ART_PX` → 작품별 실제 원본 픽셀. dpi 판정이 그제야 진짜가 된다 |
| S4 | 작품 단위 opt-in (`stickers.goods_ok · goods_items · creator_margin`), `sticker_votes` 재사용(품목 키), 알림 1종, 승인 카드는 `/admin` 운영자 화면부터 |

---

## 8. 규약 · 함정 (코덱스 지시서)

### 반드시 지킬 것 (CLAUDE.md 요약)
- 색은 `var(--wc-*)` 토큰만. raw hex 금지. 폰트 8단계(12/13/14/16/20/26/31/42 → text-xs/sm/base/xl). `rounded` · `rounded-xl` 둘만.
- 🚫 한쪽 면 액센트 보더. 🚫 베팅/픽 카드 다크 배경(여기 해당 없음).
- 시연은 **DB · API · 마이그레이션 무변경**. 전부 `fixtures.ts`.
- GNB · 모바일탭에 링크 넣지 않는다. 모든 신규 라우트 `robots: { index:false, follow:false }`.
- 검증: `pnpm exec tsc --noEmit` · `pnpm exec eslint app/goods-lab` · `node scripts/check-design-tokens.mjs`(래칫 — 늘면 실패, 줄면 `--update`) · 375px 에서 `scrollWidth === clientWidth`.
- **git push 금지. 커밋도 요청 시에만.**

### 이번에 밟은 함정 (재발 금지)
- **Radix Dialog 는 body 로 포털**된다 → app-shell 의 `.worldcup-scope` 밖 → `--wc-*` 전부 미정의 → 버튼 배경 · 게이지 소실. `DialogContent` 에 `worldcup-scope` 클래스를 다시 붙일 것. (작품 페이지의 "품목 고르기" 다이얼로그에 그대로 해당)
- **숫자는 `demandFor()` 한 곳에서만** 파생. 하드코딩 카운트 금지 — 같은 품목이 두 화면에서 53 vs 178 로 갈렸던 사고.
- `fixtures.ts` 에서 `HEATMAP`/파생 상수는 `BASE` **뒤에** 선언 (TDZ — tsc 가 못 잡고 페이지가 200 인데 본문이 빈다).
- 목업 `paddingBottom` 은 제품별 `aspect` — 118% 고정하면 정사각 제품이 세로를 낭비한다.
- `next/image fill` 은 부모가 `relative` + 크기 있어야 한다.
- 승인 카드 · 목업은 **모바일에서 이미지 두 장을 나란히**(세로로 쌓으면 한 화면을 먹는다).
- 팀별 수요 총합이 우연히 같아지면(아스날 114 vs 리버풀 115 반올림) 표가 "꾸민 데이터"로 보인다 — 기준값을 벌려 둘 것.
- 작가가 안 연 작품(`opened:false`)은 수요 집계에서 제외 — 팬이 요청할 수 없는 걸 세면 두 화면이 어긋난다.
- `generateMetadata` 의 `openGraph` 는 루트 layout 이 이긴다 — page 에서 명시.

### 검증 체크리스트 (P3 기준)
- [ ] 벽 타일 클릭 → `/goods-lab/art/g7` 이동, 뒤로가기 정상
- [ ] 작품 페이지 원화가 다이얼로그 때보다 크다 (lg 에서 폭 ≥ 600px)
- [ ] 「갖고 싶어요」 → 다이얼로그 → 품목 2개 선택 → 패널 카운트 즉시 +1, 진행 카드 달성률 갱신
- [ ] 「이 작품의 진행」 4상태(모으는 중/구단 확인 중/제작 확정 D-N/수정 중) 중 해당 작품 것만
- [ ] 카탈로그 스트립 → `/goods-lab/shop/g7` → 26 카드, 카테고리 필터, 단계 배지 4종
- [ ] 상품 상세 → 작가 배치 그대로 큰 목업 · dpi · [갖고 싶어요]/[원해요]/[구단 확인 필요] 분기
- [ ] OG: `curl -s localhost:3002/goods-lab/art/g7 | grep og:image`
- [ ] 375px 가로 스크롤 없음, 모바일 순서 §1.3
- [ ] `/goods-lab/partner` 수요 보드 9열, 승인 카드 ③ 품목군

---

## 9. 결정 — 기본값

| # | 결정 | 기본값 | 바꾸려면 |
|---|---|---|---|
| ① | 판매 3 → 9 | **9** | `ITEMS` 의 `stage` |
| ② | 티셔츠 · 피규어를 카탈로그에 보이나 | **보임** ("구단 확인 필요" / "입체로도 원해요" 라벨) | `stage: confirm/signal` 품목을 카탈로그 필터에서 제외 |
| ③ | 원본 보관 시점 | **실서비스 S1** (시연 범위 밖) | 미팅 전 반나절이면 "지금 3개도 못 찍는다"를 안 해도 됨 |
| ④ | 크레스트 "작품" 타일 2장 | **뺀 채** (반려 교재 g15 로 대체) | `GALLERY` 에 asset crest 복원 |
| ⑤ | 작품 설명 필드 | **추가** (2~3줄 시연 카피) | `description` 생략 시 태그만 |
| ⑥ | 작품 페이지 우측 패널 폭 | **320** (덕템 동일) | 360 이면 캠페인 카드 여유 |

---

## 부록 — 참조 실측 (2026-09-05, Playwright, 뷰포트 1440)

| | 덕템 작품 상세 | 마플 조각스티커 에디터 | 레드버블 스티커 PDP |
|---|---|---|---|
| 컨테이너 | max-w-5xl (1024) | `#maker_frame` 1345 | 1425 |
| 주 이미지 | max-h 520 | 캔버스 740×740 | 프리뷰 685×911 |
| 우측 패널 | 320 | ~460 | ~575 |
| 크기 조작 | — | 가로/세로 mm 입력 + 비율잠금 | S/M/L 인치 표기 |
| 재질 | — | 사진 썸네일 | 텍스트 필 버튼 |
| 요청/구매 | 품목별 "N명 대기 중" + 굿즈화 요청하기 | 장바구니 | Add to cart |

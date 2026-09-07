/**
 * 팬 굿즈 공동제작 — 시연용 정적 데이터 (2026-09-05 개편)
 *
 * ⚠️ 전부 **가상 데이터**다. 실제 이용자 수치가 아니다.
 *    화면 상단 배지가 이 사실을 상시 고지한다 — 지우지 말 것.
 *
 * ## 이 파일이 다시 쓰인 이유 (기획 · 피규어 제조 · MD · 마케팅 4관점 합의)
 *
 * 1. **트랙 3개를 팬에게 보이지 않는다.** 제조 방식은 내부 분류다. 팬이 고르는 건 품목이다.
 *    `Track` 문자열 3개를 `mode`(돈이 걸리는 시점) × `form`(공장 입력)으로 쪼갰다 —
 *    "입체 · 즉시" 칸은 현실에 없고, "평면 · 공동"(러버 키링) 칸이 이전 모델엔 없었다.
 *
 * 2. **품목 14 → 판매 3.** 취향이 아니라 권리 · 원가가 정했다.
 *    - 티셔츠 · 후드 ✕ 어패럴은 키트 스폰서 카테고리 독점 — 구단이 제3자에게 줄 권한이 없다
 *    - 피규어 · 흉상 ✕ 선수 초상은 구단이 아니라 선수 · 에이전트 · 선수협 권리
 *    - 자석 · 아크릴 블록 ✕ 배송비 붙이면 마진 0 / 무겁고 치핑, 스탠드와 수요가 겹친다
 *    - 남은 셋(스티커 · 아크릴 스탠드 · 아크릴 키링)은 같은 공정 · 같은 업체 · KC 대상 밖이고,
 *      업로드가 1200px 로 남는 지금 파이프라인에서 300dpi 가 나오는 크기다 (10cm 상한)
 *
 * 3. **숫자는 한 곳에서 파생된다.** 이전엔 다이얼로그가 품목 계수로 계산하고 권리 게이트는
 *    하드코딩이라 같은 품목이 두 화면에서 53 vs 178 로 갈렸다. 지금은 전부 `demandFor()` 다.
 *
 * 4. **크레스트를 "작품"으로 걸지 않는다.** 엠블럼은 저작물이 아니라 등록상표라
 *    "2차창작 승인" 논리가 안 걸린다. 대신 g15 가 그 사례를 **반려 카드로** 보여준다.
 *
 * 5. **Meshy 는 팬이 누르지 않는다.** 2D→3D 변환은 2차적저작물 작성이라 작가 허락 없이는
 *    생성 행위 자체가 침해다. 작가 동의(CONSENT_SOLID) 안에서 작품당 1회만 돈다.
 */

export type SceneKey = "warming" | "reached" | "licensing"
export const FAN_SCENE: SceneKey = "reached"
export type Wanted = Readonly<Record<string, boolean>>

export const SCENES: { key: SceneKey; label: string; caption: string }[] = [
  {
    key: "warming",
    label: "관심 모이는 중",
    caption: "팬들이 요청을 쌓는 구간. 아직 목표에 닿은 캠페인이 없다.",
  },
  {
    key: "reached",
    label: "목표 도달",
    caption: "목표를 넘긴 캠페인이 생겼다. 여기서 권리 확인이 필요해진다.",
  },
  {
    key: "licensing",
    label: "승인 · 상품 준비",
    caption:
      "승인 후 원본 · 시안 · 견적을 확인합니다. 제작과 주문은 준비가 끝난 뒤 별도로 열립니다.",
  },
]

export const SCENE_MULT: Record<SceneKey, number> = {
  warming: 1,
  reached: 1.48,
  licensing: 1.62,
}

/**
 * 목표 인원 — 운영 상수.
 *
 * ⚠️ 인쇄 3종은 MOQ 가 0 이라 **임계가 물리값이 아니다.** 이 숫자는 공장이 정한 게 아니라
 *    "승인 카드에 올릴 값어치가 있는가"를 우리가 정한 선이다. 입체가 열리는 2단계에서는
 *    다른 규칙이 붙는다 — 요청 ×3 에 후보정 착수, 목표 달성은 결제 보류된 예약만 집계.
 *    (무료 요청 → 결제 전환은 10~30%. 옛 ×1.5 공식은 67% 전제라 실측과 맞지 않는다)
 */
export const GOAL = 30

/* ────────────────── 팀 ────────────────── */

export interface DemoTeam {
  id: string
  name: string
  color: string
  /** 팀 컬러가 밝아 글자를 어둡게 깔아야 하는가 */
  darkInk: boolean
  /** public/season 에 실자산이 있는 팀만 */
  crest: string | null
  league: "EPL" | "K리그"
  /** 상품화 승인 주체가 실제로 들어올 수 있는가 */
  approver: "직접" | "지역 라이선시 경유"
}

/**
 * ⚠️ K리그가 앞이다. EPL 구단은 지역 라이선시 에이전트를 통해서만 상품화 라이선스를 주고,
 *    한국 팬 커뮤니티와 팬아트 승인 프로그램을 직접 여는 일은 첫 해엔 없다.
 *    승인 큐에 EPL 행이 서 있으면 구단 MD 가 보는 순간 비현실이 된다.
 */
export const TEAMS: DemoTeam[] = [
  {
    id: "jeonbuk",
    name: "전북",
    color: "#0B6B3A",
    darkInk: false,
    crest: null,
    league: "K리그",
    approver: "직접",
  },
  {
    id: "fcseoul",
    name: "서울",
    color: "#B4141B",
    darkInk: false,
    crest: null,
    league: "K리그",
    approver: "직접",
  },
  {
    id: "ulsan",
    name: "울산",
    color: "#0067AC",
    darkInk: false,
    crest: null,
    league: "K리그",
    approver: "직접",
  },
  {
    id: "arsenal",
    name: "아스날",
    color: "#EF0107",
    darkInk: false,
    crest: "/season/crest-arsenal.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
  {
    id: "liverpool",
    name: "리버풀",
    color: "#C8102E",
    darkInk: false,
    crest: "/season/crest-liverpool.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
  {
    id: "manutd",
    name: "맨유",
    color: "#DA291C",
    darkInk: false,
    crest: "/season/crest-manutd.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
  {
    id: "chelsea",
    name: "첼시",
    color: "#034694",
    darkInk: false,
    crest: "/season/crest-chelsea.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
  {
    id: "mancity",
    name: "맨시티",
    color: "#6CABDD",
    darkInk: true,
    crest: "/season/crest-mancity.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
  {
    id: "tottenham",
    name: "토트넘",
    color: "#132257",
    darkInk: false,
    crest: "/season/crest-tottenham.png",
    league: "EPL",
    approver: "지역 라이선시 경유",
  },
]

export function teamOf(id: string): DemoTeam {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0]
}

/* ────────────────── 품목 ────────────────── */

/** 돈이 언제 걸리느냐 */
export type Mode = "instant" | "group"
/** 공장에 들어가는 입력이 평면 파일이냐 입체 원형이냐 */
export type Form = "flat" | "solid"
/** 지금 파느냐, 다음이냐, 신호만 받느냐 */
export type Stage = "sell" | "phase2" | "signal"

export const MODE_LABEL: Record<Mode, string> = {
  instant: "즉시 · 낱개 주문",
  group: "공동 · 최소 수량",
}
export const FORM_LABEL: Record<Form, string> = {
  flat: "평면 · 인쇄 파일",
  solid: "입체 · 3D 원형",
}

export interface DemoItem {
  id: string
  name: string
  mode: Mode
  form: Form
  stage: Stage
  /** 소비자가(원) */
  price: number
  /** instant 는 0 */
  moq: number
  /** 수요 계수 — 비싼 것일수록 요청이 적다. demandFor() 가 쓴다 */
  demand: number
  /** 구단 공식 상품 가격대 — 승인 카드가 "위 / 아래"를 판단하는 근거 */
  officialBand: [number, number]
  /** 제작 리드타임 */
  leadTime: string
  note: string
  /** 인쇄 영역 — 판매 품목만. 배치 에디터와 DPI 계산이 쓴다 */
  print?: PrintArea
}

/**
 * 제품의 인쇄 가능 영역.
 *
 * `x/y/w/h` 는 제품 박스 대비 %, `cmW/cmH` 는 실제 물리 치수다.
 * 물리 치수가 있어야 **배치에서 바로 DPI 가 나온다** — 이게 이 화면의 요점이다.
 * 업로드가 1200px 로 남는 지금 파이프라인에서 10cm 가 300dpi 경계였다(피규어 제조 실측).
 */
export interface PrintArea {
  template: "sticker" | "stand" | "keyring"
  /** 목업 박스의 세로/가로 비율. 정사각 제품에 118% 를 쓰면 세로가 낭비된다 */
  aspect: number
  x: number
  y: number
  w: number
  h: number
  cmW: number
  cmH: number
}

/**
 * 판매 3 · 2단계 5 · 신호 1.
 *
 * 판매 3종은 전부 UV 인쇄 + 레이저컷 계열이라 **한 업체 · 한 공정**으로 끝난다.
 * 권리 층위도 같다("인쇄 소품") — 승인 카드 한 장으로 셋을 함께 승인할 수 있다.
 */
export const ITEMS: DemoItem[] = [
  {
    id: "sticker",
    name: "스티커",
    mode: "instant",
    form: "flat",
    stage: "sell",
    price: 3500,
    moq: 0,
    demand: 0.78,
    officialBand: [3000, 5000],
    leadTime: "1~2주",
    note: "5~8cm. 파손 없음. 가장 낮은 진입가",
    print: { template: "sticker", aspect: 1, x: 10, y: 10, w: 80, h: 80, cmW: 7, cmH: 7 },
  },
  {
    id: "acrylstand",
    name: "아크릴 스탠드",
    mode: "instant",
    form: "flat",
    stage: "sell",
    price: 16000,
    moq: 0,
    demand: 0.36,
    officialBand: [15000, 22000],
    leadTime: "2~3주",
    note: "10cm 상한 — 1200px 업로드로 300dpi 가 나오는 크기",
    print: { template: "stand", aspect: 1.24, x: 17, y: 6, w: 66, h: 72, cmW: 10, cmH: 13 },
  },
  {
    id: "acrylkeyring",
    name: "아크릴 키링",
    mode: "instant",
    form: "flat",
    stage: "sell",
    price: 7500,
    moq: 0,
    demand: 0.52,
    officialBand: [8000, 12000],
    leadTime: "2~3주",
    note: "6~7cm. 스탠드와 같은 공정 · 같은 업체",
    print: { template: "keyring", aspect: 1.12, x: 20, y: 16, w: 60, h: 66, cmW: 6.5, cmH: 7 },
  },

  // ── 2단계: 벡터(타이포) 작품 한정이거나 금형이 붙는다 ──
  {
    id: "poster",
    name: "포스터",
    mode: "instant",
    form: "flat",
    stage: "phase2",
    price: 12000,
    moq: 0,
    demand: 0.2,
    officialBand: [10000, 18000],
    leadTime: "2주",
    note: "A3 는 3,508px 필요 — 벡터 작품만",
  },
  {
    id: "towel",
    name: "슬로건 타월",
    mode: "instant",
    form: "flat",
    stage: "phase2",
    price: 18000,
    moq: 0,
    demand: 0.24,
    officialBand: [20000, 35000],
    leadTime: "3주",
    note: "공식 머플러와 경쟁 + 구단 슬로건은 상표인 경우가 많다",
  },
  {
    id: "rubberkeyring",
    name: "러버 키링",
    mode: "group",
    form: "flat",
    stage: "phase2",
    price: 9000,
    moq: 200,
    demand: 0.3,
    officialBand: [8000, 13000],
    leadTime: "4~6주",
    note: "2D 금형. 금형이 있는데 3D 는 필요 없는 유일한 칸",
  },
  {
    id: "resinfig",
    name: "레진 미니 피규어",
    mode: "group",
    form: "solid",
    stage: "phase2",
    price: 43000,
    moq: 20,
    demand: 0.18,
    officialBand: [35000, 60000],
    leadTime: "3~5주",
    note: "단색 8cm. MOQ 는 후보정비(10~30만원)를 몇 개로 나누느냐가 정한다",
  },
  {
    id: "pvcfig",
    name: "PVC 피규어",
    mode: "group",
    form: "solid",
    stage: "phase2",
    price: 52000,
    moq: 300,
    demand: 0.14,
    officialBand: [45000, 70000],
    leadTime: "4~6개월",
    note: "MOQ 100 은 금형비만 개당 7만원. 300 이 한계선, 500 이 성립",
  },

  // ── 신호만: 팔지 않고 "원한다"만 센다 ──
  {
    id: "solid",
    name: "입체로도 원해요",
    mode: "group",
    form: "solid",
    stage: "signal",
    price: 0,
    moq: 0,
    demand: 0.28,
    officialBand: [0, 0],
    leadTime: "—",
    note: "팔지 않는다. 이 숫자가 구단 미팅에 들고 갈 자료가 된다",
  },
]

export function itemOf(id: string): DemoItem {
  return ITEMS.find((i) => i.id === id) ?? ITEMS[0]
}

export function itemsOfStage(s: Stage): DemoItem[] {
  return ITEMS.filter((i) => i.stage === s)
}

/** 지금 파는 것 — 팬 화면의 품목 목록은 여기서만 나온다 */
export const SELL_ITEMS = itemsOfStage("sell")

/** 신호 품목 — 팬 화면에서 버튼 하나로만 나타난다 */
export const SIGNAL_ITEM = itemOf("solid")

/** 2×2 격자 — 파트너 화면에서 트랙 모델을 설명한다 */
export function itemsAt(mode: Mode, form: Form): DemoItem[] {
  return ITEMS.filter((i) => i.mode === mode && i.form === form && i.stage !== "signal")
}

export function won(n: number): string {
  return n.toLocaleString("ko-KR") + "원"
}

/* ────────────────── 가격 배분 (4자) ────────────────── */

/**
 * ⚠️ 주체는 3이 아니라 **4**다 — 제작 대행사가 빠지면 표가 안 맞는다.
 *    덕템식 "플랫폼 = 작가 마진의 10%" 는 적자다. 작가 마진 5,000원이면 500원인데
 *    PG 수수료만 소비자가의 3.3~3.5%(16,000원에서 550원)다. 플랫폼 몫은 소비자가 기준.
 *
 *    남는 잔액은 반품 · 불량 충당이다. POD 는 원가율이 높아 이 여유가 얇다.
 */
const SPLIT_RATE = { maker: 0.5, creator: 0.22, rights: 0.075, platform: 0.125 } as const

export interface Split {
  maker: number
  creator: number
  rights: number
  platform: number
  reserve: number
}

/** 100원 단위로 끊고, 나머지를 충당분으로 남긴다 */
export function splitOf(price: number): Split {
  const r = (k: keyof typeof SPLIT_RATE) => Math.round((price * SPLIT_RATE[k]) / 100) * 100
  const maker = r("maker")
  const creator = r("creator")
  const rights = r("rights")
  const platform = r("platform")
  return { maker, creator, rights, platform, reserve: price - maker - creator - rights - platform }
}

export const SPLIT_LABELS: { key: keyof Split; label: string; hint: string }[] = [
  { key: "maker", label: "제작 · 배송", hint: "POD 대행사. 원가율이 여기 다 있다" },
  { key: "creator", label: "작가", hint: "소비자 화면에 유일하게 보이는 몫" },
  { key: "rights", label: "권리자", hint: "구단 로열티 — 승인 카드에만" },
  { key: "platform", label: "플랫폼", hint: "PG 3.5% + 정산 · CS · 개발" },
  { key: "reserve", label: "반품 충당", hint: "불량 교환 · 반품" },
]

/** 로열티율 — 승인 카드에만 보인다. 소비자 화면엔 "작가에게 N원" 한 줄만 */
export const ROYALTY_RATE = SPLIT_RATE.rights

/* ────────────────── 배치 · 인쇄 품질 ────────────────── */

/**
 * 그림을 인쇄 영역 안 어디에 얹을 것인가.
 *
 * `x/y` 는 인쇄 영역 중심에서의 이동(영역 폭 대비 %), `scale` 은 영역을 1.0 으로 본 배율,
 * `rot` 은 도(°). 마플 · 레드버블 에디터가 저장하는 값과 같은 모양이다 — 실제 POD 발주에
 * 그대로 넘길 수 있는 형태로 잡아 두었다.
 */
export interface Placement {
  x: number
  y: number
  scale: number
  rot: number
  /** 제품 변형(투명 · 화이트 · 유광 …). 구단은 "어떤 아크릴인지"까지 보고 승인한다 */
  variant?: string
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, rot: 0 }

/**
 * 제품 변형 — 마플 · 레드버블의 색상 · 재질 선택에 해당한다.
 *
 * 배치와 같이 저장한다. 투명 아크릴과 화이트 아크릴은 인쇄 결과가 전혀 다른 물건이라,
 * 승인 카드가 그걸 모르면 "그 그림이 얹힌 물건"에 승인한다는 말이 성립하지 않는다.
 */
export interface ProductVariant {
  id: string
  label: string
  /** 제품 몸체 배경 토큰 */
  body: string
  note: string
}

export const VARIANTS: Record<PrintArea["template"], ProductVariant[]> = {
  sticker: [
    { id: "gloss", label: "유광", body: "var(--wc-paper)", note: "발색이 진하고 물에 강합니다" },
    {
      id: "matte",
      label: "무광",
      body: "var(--wc-soft)",
      note: "빛 반사가 적어 사진이 잘 나옵니다",
    },
  ],
  stand: [
    {
      id: "clear",
      label: "투명",
      body: "var(--wc-soft)",
      note: "배경이 비칩니다 — 여백이 많은 그림에 맞습니다",
    },
    {
      id: "white",
      label: "화이트",
      body: "var(--wc-paper)",
      note: "색이 또렷합니다 — 어두운 그림에 맞습니다",
    },
  ],
  keyring: [
    { id: "clear", label: "투명", body: "var(--wc-soft)", note: "배경이 비칩니다" },
    { id: "white", label: "화이트", body: "var(--wc-paper)", note: "색이 또렷합니다" },
  ],
}

export function variantOf(template: PrintArea["template"], id?: string): ProductVariant {
  const list = VARIANTS[template]
  return list.find((v) => v.id === id) ?? list[0]
}

/** 업로드가 남기는 긴 변 픽셀 — 지금 파이프라인은 1200px WebP 한 장만 남긴다 */
export const ART_PX = 1200

/** 인쇄 업체 표준 300dpi. 그 아래는 경고, 200 아래는 접수 불가 */
export const DPI_WARN = 300
export const DPI_FAIL = 200

/**
 * 배치에서 바로 나오는 유효 해상도.
 *
 * 확대하면(scale↑) 같은 픽셀로 더 넓은 면을 덮으므로 dpi 가 떨어진다.
 * ⚠️ 이 숫자가 반려 사유 ⑧(인쇄 품질 미달)과 같은 값을 봐야 한다 — 작가가 에디터에서
 *    "300 아래"를 보고도 올렸는데 승인 카드가 다른 기준으로 판단하면 아무도 안 믿는다.
 */
export function effectiveDpi(item: DemoItem, p: Placement): number {
  if (!item.print) return 0
  const printedCm = item.print.cmW * Math.max(0.01, p.scale)
  return Math.round((ART_PX * 2.54) / printedCm)
}

export function dpiVerdict(dpi: number): "ok" | "warn" | "fail" {
  if (dpi >= DPI_WARN) return "ok"
  return dpi >= DPI_FAIL ? "warn" : "fail"
}

/**
 * 작가가 정해 둔 배치 (시연값). 키는 `작품:품목`.
 *
 * 여기 없는 조합은 DEFAULT_PLACEMENT — 영역에 꽉 맞춘 상태다.
 * 팬 화면 · 승인 카드가 **같은 값**을 읽는다. 권리자가 본 물건과 팬이 본 물건이 달라지면
 * 승인의 의미가 없어진다.
 */
export const PLACEMENTS: Record<string, Placement> = {
  "g7:acrylstand": { x: 0, y: -4, scale: 0.86, rot: 0 },
  "g7:sticker": { x: 0, y: 0, scale: 0.92, rot: 0 },
  "g14:sticker": { x: 0, y: 2, scale: 1.04, rot: 0 },
  "g14:acrylkeyring": { x: 0, y: 0, scale: 0.9, rot: -6 },
  "g11:acrylkeyring": { x: 0, y: -2, scale: 0.88, rot: 0 },
  "g15:sticker": { x: 0, y: 0, scale: 1.12, rot: 0 },
  "g1:acrylstand": { x: 2, y: -6, scale: 1.18, rot: 0 },
}

export function placementOf(pieceId: string, itemId: string): Placement {
  return PLACEMENTS[`${pieceId}:${itemId}`] ?? DEFAULT_PLACEMENT
}

/* ────────────────── 갤러리 ────────────────── */

/** 타일 그래픽 종류 — art-tile.tsx 가 SVG 로 그린다 */
export type ArtKind = "asset" | "stripes" | "number" | "slogan" | "grid" | "arc" | "diag" | "scarf"

/** 구단 자산 체크 5항 — 작가가 자가 체크, 운영자가 1차 검수 */
export interface AssetCheck {
  emblem: boolean
  mascot: boolean
  portrait: boolean
  slogan: boolean
  kit: boolean
}

export const ASSET_LABELS: { key: keyof AssetCheck; label: string }[] = [
  { key: "emblem", label: "엠블럼 · 워드마크" },
  { key: "mascot", label: "마스코트" },
  { key: "portrait", label: "선수 초상" },
  { key: "slogan", label: "등록 슬로건" },
  { key: "kit", label: "키트 디자인" },
]

const CLEAN: AssetCheck = {
  emblem: false,
  mascot: false,
  portrait: false,
  slogan: false,
  kit: false,
}

export interface GalleryPiece {
  id: string
  title: string
  description: string
  teamId: string
  creator: string
  kind: ArtKind
  /** kind === "asset" 일 때만 — 사이트가 이미 쓰는 자산 경로 */
  image?: string
  /** slogan / number 종류에서 쓰는 문구 */
  word?: string
  tags: string[]
  /** 기준 요청 수. 품목 계수 · 시나리오 배수가 여기에 곱해진다 */
  requests: number
  faves: number
  /** 세로 / 가로 비율. 메이슨리 타일 높이를 이걸로 정한다 */
  aspect: number
  /** 작가가 "굿즈로 열기"를 눌렀는가 — 안 눌렀으면 승인 카드로 못 간다 */
  opened: boolean
  /** 작가가 정한 희망 품목 (≤3). 안 정했으면 판매 3종 전부 */
  wants?: string[]
  assets: AssetCheck
}

/**
 * ⚠️ 외부에서 팬아트를 받아오지 않는다. 이 시연물은 권리자에게 보여지고,
 *    "무단 2차창작을 승인 절차 안으로 들여온다"가 제안의 논리다 — 화면이 무단 팬아트로
 *    채워져 있으면 그 자리에서 논리가 무너진다.
 *    그래서 (a) 사이트가 이미 쓰는 자산과 (b) 코드로 그리는 원본 SVG 디자인만 쓴다.
 *
 * ⚠️ 크레스트를 "작품"으로 걸지 않는다 (이전 g3 · g4 제거). 상표를 팬아트 자리에 두면
 *    권리 담당자가 "이쪽은 상표와 저작권을 구분 못 한다"고 읽는다. 대신 g15 가
 *    **그 사례를 반려 카드로** 보여준다 — 지운 것이 교재가 됐다.
 */
const GALLERY_BASE: Omit<GalleryPiece, "description">[] = [
  {
    id: "g1",
    title: "북런던의 아침",
    teamId: "arsenal",
    creator: "구너민수",
    kind: "asset",
    image: "/season/player-gooner.webp",
    tags: ["아스날", "팬아트", "일러스트"],
    requests: 62,
    faves: 418,
    aspect: 1.18,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g2",
    title: "안필드의 밤",
    teamId: "liverpool",
    creator: "콥지원",
    kind: "asset",
    image: "/season/player-kop.webp",
    tags: ["리버풀", "팬아트", "일러스트"],
    requests: 47,
    faves: 522,
    aspect: 0.78,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g3",
    title: "하이버리의 격자",
    teamId: "arsenal",
    creator: "라인워크",
    kind: "grid",
    tags: ["아스날", "픽셀아트", "미니멀"],
    requests: 52,
    faves: 261,
    aspect: 1.0,
    opened: true,
    wants: ["sticker", "acrylkeyring"],
    assets: CLEAN,
  },
  {
    id: "g4",
    title: "혼자 걷지 않아",
    teamId: "liverpool",
    creator: "라인워크",
    kind: "slogan",
    word: "혼자 걷지 않아",
    tags: ["리버풀", "슬로건", "타이포"],
    requests: 76,
    faves: 344,
    aspect: 1.0,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g5",
    title: "스탬퍼드 블루",
    teamId: "chelsea",
    creator: "블루하늘",
    kind: "asset",
    image: "/season/player-blues.webp",
    tags: ["첼시", "팬아트", "일러스트"],
    requests: 31,
    faves: 187,
    aspect: 1.32,
    opened: false,
    assets: CLEAN,
  },
  {
    id: "g6",
    title: "올드 트래퍼드 레드",
    teamId: "manutd",
    creator: "레드데블",
    kind: "asset",
    image: "/season/player-devils.webp",
    tags: ["맨유", "팬아트", "일러스트"],
    requests: 38,
    faves: 209,
    aspect: 0.86,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g7",
    title: "12번째 선수",
    teamId: "jeonbuk",
    creator: "초록불",
    kind: "number",
    word: "12",
    tags: ["전북", "K리그", "타이포"],
    requests: 34,
    faves: 96,
    aspect: 0.72,
    opened: true,
    wants: ["acrylstand", "sticker"],
    assets: CLEAN,
  },
  {
    id: "g8",
    title: "상암의 저녁",
    teamId: "fcseoul",
    creator: "서울사람",
    kind: "stripes",
    tags: ["서울", "K리그", "포스터"],
    requests: 27,
    faves: 74,
    aspect: 1.24,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g9",
    title: "끝까지 간다",
    teamId: "mancity",
    creator: "블루문",
    kind: "slogan",
    word: "끝까지 간다",
    tags: ["맨시티", "슬로건", "타이포"],
    requests: 24,
    faves: 118,
    aspect: 0.9,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g10",
    title: "화이트 하트 그리드",
    teamId: "tottenham",
    creator: "픽셀런던",
    kind: "grid",
    tags: ["토트넘", "픽셀아트", "미니멀"],
    requests: 29,
    faves: 133,
    aspect: 1.0,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g11",
    title: "문수의 파랑",
    teamId: "ulsan",
    creator: "울산맏이",
    kind: "arc",
    tags: ["울산", "K리그", "미니멀"],
    requests: 22,
    faves: 61,
    aspect: 1.45,
    opened: true,
    wants: ["acrylkeyring", "sticker"],
    assets: CLEAN,
  },
  {
    id: "g12",
    title: "우리가 간다",
    teamId: "chelsea",
    creator: "블루하늘",
    kind: "slogan",
    word: "우리가 간다",
    tags: ["첼시", "슬로건", "타이포"],
    requests: 54,
    faves: 176,
    aspect: 0.8,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g13",
    title: "붉은 대각선",
    teamId: "manutd",
    creator: "맨체스터붉은",
    kind: "diag",
    tags: ["맨유", "미니멀", "포스터"],
    requests: 46,
    faves: 152,
    aspect: 1.28,
    opened: true,
    assets: CLEAN,
  },
  {
    id: "g14",
    title: "초록 머플러",
    teamId: "jeonbuk",
    creator: "초록불",
    kind: "scarf",
    tags: ["전북", "K리그", "미니멀"],
    requests: 41,
    faves: 108,
    aspect: 0.74,
    opened: true,
    wants: ["sticker", "acrylkeyring"],
    assets: CLEAN,
  },
  // ⚠️ 반려 교재. 구단 엠블럼을 따라 그린 라인아트다 — 저작물이 아니라 등록상표라
  //    "2차창작"으로 승인받을 수 있는 물건이 아니다. 자산 체크 emblem 이 켜져 있고,
  //    승인 카드는 이걸 권리자에게 넘기기 전에 잡아낸다 (반려 사유 ①).
  {
    id: "g15",
    title: "크레스트 라인아트",
    teamId: "fcseoul",
    creator: "라인워크",
    kind: "arc",
    tags: ["서울", "K리그", "미니멀"],
    requests: 38,
    faves: 91,
    aspect: 1.06,
    opened: true,
    wants: ["sticker"],
    assets: { ...CLEAN, emblem: true },
  },
]

const DESCRIPTIONS: Record<string, string> = {
  g1: "경기장으로 향하는 아침의 설렘을 담았습니다. 일상에서도 북런던의 응원을 가까이 두고 싶어 그린 작품입니다.",
  g2: "경기가 끝나도 오래 남는 안필드의 분위기를 그렸습니다. 함께 응원했던 밤을 작은 굿즈로 간직해 보세요.",
  g3: "하이버리의 기억을 작은 격자로 쌓았습니다. 단순한 선과 반복되는 모양 속에 우리 팀의 리듬을 담았습니다.",
  g4: "함께 부를 때 더 큰 힘이 되는 말을 담았습니다. 곁에 두고 싶은 응원의 문장입니다.",
  g5: "스탬퍼드의 파란 풍경에서 시작한 그림입니다. 지금은 작품을 감상할 수 있도록 전시하고 있습니다.",
  g6: "올드 트래퍼드를 향한 마음을 붉은빛으로 그렸습니다. 경기가 없는 날에도 응원을 이어가고 싶은 팬을 위한 작품입니다.",
  g7: "그라운드 밖에서도 우리는 12번째 선수입니다. 초록빛 응원을 등번호처럼 담아, 책상 위와 일상에서 함께할 수 있게 그렸습니다.",
  g8: "상암의 저녁, 관중석을 채우는 색과 소리를 줄무늬로 옮겼습니다. 함께했던 경기의 장면을 떠올려 보세요.",
  g9: "마지막 휘슬까지 놓지 않는 응원을 담았습니다. 짧은 문장과 하늘빛으로 끝까지 함께하는 마음을 표현했습니다.",
  g10: "경기장의 기억을 차분한 격자 무늬로 정리했습니다. 작은 물건에도 자연스럽게 어울리는 패턴입니다.",
  g11: "문수의 파란 물결을 겹겹이 이어지는 곡선으로 그렸습니다. 관중석에서 번져 나가는 응원을 표현했습니다.",
  g12: "경기장으로 함께 향하는 순간의 에너지를 담았습니다. 친구와 나누고 싶은 짧고 힘 있는 응원입니다.",
  g13: "앞으로 나아가는 팀의 움직임을 붉은 대각선으로 그렸습니다. 선명한 색과 간결한 형태에 응원의 마음을 실었습니다.",
  g14: "높이 펼친 초록 머플러에서 시작한 패턴입니다. 경기장의 온기를 일상에서도 곁에 둘 수 있도록 그렸습니다.",
  g15: "구단을 떠올리며 선으로 구성한 시안입니다. 현재 상품화 검토가 보류되어 수정이 필요한 부분을 확인하고 있습니다.",
}

export const GALLERY: GalleryPiece[] = GALLERY_BASE.map((piece) => ({
  ...piece,
  description: DESCRIPTIONS[piece.id],
}))

/** URL 입력에는 fallback을 쓰지 않는다. 없는 작품은 라우트에서 404 처리한다. */
export function findPiece(id: string): GalleryPiece | undefined {
  return GALLERY.find((piece) => piece.id === id)
}

export function pieceOf(id: string): GalleryPiece {
  return GALLERY.find((g) => g.id === id) ?? GALLERY[0]
}

/** 작가가 연 품목 — 안 정했으면 판매 3종 전부 */
export function wantsOf(piece: GalleryPiece): DemoItem[] {
  if (!piece.wants) return SELL_ITEMS
  return SELL_ITEMS.filter((item) => piece.wants?.includes(item.id))
}

/** 시연 1단계: 기존 작가 허용 품목과 입체 관심을 받는다. 카탈로그 확장은 별도 단계. */
export function interestItemsOf(piece: GalleryPiece): DemoItem[] {
  return piece.opened ? [...wantsOf(piece), SIGNAL_ITEM] : []
}

export function canRequest(pieceId: string, itemId: string): boolean {
  const piece = findPiece(pieceId)
  return !!piece && interestItemsOf(piece).some((item) => item.id === itemId)
}

/** 브라우저에 남은 오래된 값/잘못된 값은 현재 작가 허용 범위로 정규화한다. */
export function parseWanted(raw: string | null): Wanted {
  try {
    const value: unknown = JSON.parse(raw ?? "{}")
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(([key, on]) => {
        const parts = key.split(":")
        return on === true && parts.length === 2 && canRequest(parts[0], parts[1])
      })
    )
  } catch {
    return {}
  }
}

/** 상단 태그 레일 — DeviantArt 는 관련 태그를 페이지 맨 위에 띄운다 */
export const TAGS: string[] = [
  "전체",
  "팬아트",
  "슬로건",
  "타이포",
  "일러스트",
  "미니멀",
  "픽셀아트",
  "포스터",
  // 팀 태그는 작품에 붙은 것과 어긋나면 안 된다 — 레일에 없는 태그로 필터하면
  // 어떤 칩도 선택 표시가 안 돼서 "지금 뭘로 걸렀는지" 화면이 말해주지 못한다
  "K리그",
  "전북",
  "서울",
  "울산",
  "아스날",
  "리버풀",
  "맨유",
  "첼시",
  "맨시티",
  "토트넘",
]

/* ────────────────── 수요 — 단일 출처 ────────────────── */

/**
 * 작품 × 품목 × 시나리오 → 요청 수.
 *
 * ⚠️⚠️ 화면에 뜨는 모든 요청 수는 여기서 나온다. 이전 버전은 다이얼로그가 품목 계수로
 *      계산하고 권리 게이트는 별도 하드코딩이라 같은 맨유 PVC 가 한쪽에서 53, 다른 쪽에서
 *      178 로 나왔다. 표를 읽을 줄 아는 사람이 미팅에서 즉시 잡아낸다.
 */
export function demandFor(
  pieceId: string,
  itemId: string,
  scene: SceneKey,
  wanted: Wanted = {}
): number {
  if (!canRequest(pieceId, itemId)) return 0
  const p = pieceOf(pieceId)
  const i = itemOf(itemId)
  return (
    Math.round(p.requests * i.demand * SCENE_MULT[scene]) + (wanted[`${pieceId}:${itemId}`] ? 1 : 0)
  )
}

/**
 * 팀 × 품목 — 그 팀 작품들의 요청을 합친 것. 수요 보드가 쓴다.
 *
 * ⚠️ 작가가 열지 않은 작품(`opened: false`)은 팬 화면에서 요청 버튼 자체가 없다.
 *    그런 작품의 요청이 보드에 잡히면 두 화면이 어긋난다 — 세지 않는다.
 */
export function teamDemand(
  teamId: string,
  itemId: string,
  scene: SceneKey,
  wanted: Wanted = {}
): number {
  return GALLERY.filter((g) => g.teamId === teamId && g.opened).reduce(
    (sum, g) => sum + demandFor(g.id, itemId, scene, wanted),
    0
  )
}

/** 작품 타일에 뜨는 총 요청 — 그 작품이 열어둔 품목들의 합 */
export function pieceDemand(piece: GalleryPiece, scene: SceneKey, wanted: Wanted = {}): number {
  return interestItemsOf(piece).reduce((s, i) => s + demandFor(piece.id, i.id, scene, wanted), 0)
}

/**
 * 희망 가격대. 팀마다 지불 의사와 수렴도가 다르다는 게 이 표의 요지다 —
 * K리그는 표본이 작아도 좁게 모인다("작아도 확실한 수요"). 흩어져 있으면 수량을 채워도
 * 팔리지 않는다. 견적을 낼 수 있느냐는 요청 수가 아니라 수렴도가 정한다.
 */
const TEAM_PRICE: Record<string, { idx: number; tight: string[] }> = {
  jeonbuk: { idx: 0.9, tight: ["sticker", "acrylstand", "acrylkeyring", "solid"] },
  fcseoul: { idx: 0.9, tight: ["sticker", "acrylstand", "solid"] },
  ulsan: { idx: 0.88, tight: ["sticker", "acrylkeyring", "solid"] },
  arsenal: { idx: 1.0, tight: ["sticker", "acrylstand", "acrylkeyring"] },
  liverpool: { idx: 1.0, tight: ["sticker", "acrylkeyring"] },
  manutd: { idx: 0.98, tight: ["sticker", "acrylstand"] },
  chelsea: { idx: 0.98, tight: ["sticker"] },
  mancity: { idx: 0.96, tight: ["acrylkeyring"] },
  tottenham: { idx: 0.98, tight: ["sticker"] },
}

export interface DemandCell {
  requests: number
  medianPrice: number
  /** 가격 기대가 좁게 모였는가 — 생산 가능 여부의 진짜 신호 */
  tight: boolean
}

export function cellOf(
  teamId: string,
  itemId: string,
  scene: SceneKey,
  wanted: Wanted = {}
): DemandCell {
  const tp = TEAM_PRICE[teamId] ?? { idx: 1, tight: [] }
  const item = itemOf(itemId)
  return {
    requests: teamDemand(teamId, itemId, scene, wanted),
    medianPrice: Math.round((item.price * tp.idx) / 500) * 500,
    tight: tp.tight.includes(itemId),
  }
}

/** 수요 보드 열 — 판매 3 + 2단계 1 + 신호 1 */
export const BOARD_ITEMS: string[] = ["sticker", "acrylstand", "acrylkeyring", "poster", "solid"]

/* ────────────────── 캠페인 · 상태 기계 ────────────────── */

/**
 * 두 축이 따로 돈다.
 *   작품 축 : draft → open (작가 동의) → demand_met (목표 N)
 *   권리 축 : review → approved | revision | rejected
 *   합류    : open ∧ demand_met ∧ approved → ready ("제작 확정")
 *
 * ⚠️ 승인은 목표 달성을 기다리지 않는다. 구단 실무는 캠페인 시작 전에 일괄 승인이고,
 *    목표 뒤에 승인을 기다리면 팬이 기다린다. 두 축이 독립이라 순서가 없다.
 */
export type RightsState = "review" | "approved" | "revision" | "rejected"

export interface Campaign {
  id: string
  pieceId: string
  itemId: string
  /** 수량 상한 */
  cap: number
  /** 판매 기간(일) */
  windowDays: number
  /** 제작 확정 뒤 남은 날 */
  dday: number
  /** 시나리오별 권리 상태 */
  rights: Record<SceneKey, RightsState>
  /** 반려 · 수정 사유 번호 (REJECT_REASONS 의 1-based index) */
  reasonNo?: number
  /** 권리자가 남긴 한 줄 */
  reasonNote?: string
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: "c1",
    pieceId: "g7",
    itemId: "acrylstand",
    cap: 300,
    windowDays: 21,
    dday: 12,
    rights: { warming: "review", reached: "review", licensing: "approved" },
  },
  {
    id: "c2",
    pieceId: "g14",
    itemId: "sticker",
    cap: 500,
    windowDays: 21,
    dday: 9,
    rights: { warming: "review", reached: "approved", licensing: "approved" },
  },
  {
    id: "c3",
    pieceId: "g11",
    itemId: "acrylkeyring",
    cap: 300,
    windowDays: 21,
    dday: 7,
    rights: { warming: "review", reached: "revision", licensing: "approved" },
    reasonNo: 5,
    reasonNote: "구단 파랑이 실제 팬톤보다 밝습니다. 브랜드 가이드 값으로 맞추면 승인합니다.",
  },
  {
    // ⚠️ 반려 교재 — 자산 체크에서 엠블럼이 걸린다. 권리자에게 가기 전에 멈춘다
    id: "c4",
    pieceId: "g15",
    itemId: "sticker",
    cap: 500,
    windowDays: 21,
    dday: 0,
    rights: { warming: "review", reached: "rejected", licensing: "rejected" },
    reasonNo: 1,
    reasonNote:
      "엠블럼은 등록상표라 2차창작 승인 대상이 아닙니다. 상표 요소를 빼면 재심사 가능합니다.",
  },
  {
    // ⚠️ EPL — 승인 주체가 없다. 지역 라이선시를 거쳐야 해서 이 카드는 계속 "확인 중"이다.
    //    감추지 않고 보여준다. 이게 파트너에게 하는 말의 절반이다
    id: "c5",
    pieceId: "g1",
    itemId: "acrylstand",
    cap: 300,
    windowDays: 21,
    dday: 0,
    rights: { warming: "review", reached: "review", licensing: "review" },
  },
]

/** 승인 큐 — K리그만. EPL 은 승인 주체가 없어 큐에 못 선다 */
export const APPROVAL_QUEUE = CAMPAIGNS.filter(
  (c) => teamOf(pieceOf(c.pieceId).teamId).league === "K리그"
)

/** 승인 주체가 없어 큐 밖에 남는 것 — 감추지 않고 별도로 보여준다 */
export const BLOCKED_QUEUE = CAMPAIGNS.filter(
  (c) => teamOf(pieceOf(c.pieceId).teamId).league !== "K리그"
)

/** 보류된 결과도 작품 허브에서 확인할 수 있도록 남긴다. */
export function fanCampaigns(_scene: SceneKey): Campaign[] {
  return CAMPAIGNS.filter((c) => canRequest(c.pieceId, c.itemId))
}

export type FanState = "collecting" | "checking" | "preparing" | "revising" | "paused"

/** 팬에게 보이는 상태 — 운영자 말(임계 · 승인 대기)이 새면 안 된다 */
export function fanStateOf(c: Campaign, scene: SceneKey, wanted: Wanted = {}): FanState {
  const met = demandFor(c.pieceId, c.itemId, scene, wanted) >= GOAL
  const r = c.rights[scene]
  if (r === "rejected") return "paused"
  if (r === "revision") return "revising"
  if (r === "approved" && met) return "preparing"
  if (r === "approved") return "collecting"
  return met ? "checking" : "collecting"
}

export const FAN_STATE_LABEL: Record<FanState, string> = {
  collecting: "모으는 중",
  checking: "구단 확인 중",
  preparing: "상품 준비 중",
  revising: "수정 중",
  paused: "제작 검토 보류",
}

export const FAN_NEXT_STEP: Record<FanState, string> = {
  collecting: "품목별 관심 30명이 모이면 운영자가 제작 검토를 시작합니다.",
  checking: "운영자가 구단 확인을 진행합니다. 승인 후 원본과 제작 조건을 검토합니다.",
  preparing: "구단 확인을 마쳤습니다. 작가와 제작자가 원본 · 시안 · 견적을 확인할 차례입니다.",
  revising: "작가가 요청된 부분을 수정한 뒤 다시 검토합니다.",
  paused: "현재 시안의 제작 검토가 보류되었습니다. 아래 사유를 확인해 주세요.",
}

/* ────────────────── 작가 동의 · 승인 · 반려 ────────────────── */

/**
 * 전시는 건드리지 않는다 — 약관 제9조 2항이 이미 "서비스 내 노출 · 편집"을 덮는다.
 * 상품화만 **작품 단위 opt-in** 이다. 팬아트는 작품마다 초상 · 엠블럼 포함 여부가 달라서
 * 계정 단위(마플샵)나 업로드 단위(Redbubble) 토글로는 부족하다.
 */
export const CONSENT_LINES: string[] = [
  "비독점 상품화 허락 — 플랫폼과 지정 제작사가 이 작품으로 굿즈를 만들 수 있습니다",
  "기간 — 캠페인 종료 + 재고 소진까지",
  "작가 몫 — 소비자가의 22%. 품목별 금액이 아래에 그대로 표시됩니다",
  "권리자 승인 조건부이며, 언제든 철회할 수 있습니다 (이미 진행 중인 주문은 제외)",
]

/** 2단계에 붙는 다섯 번째 줄 — 여기 동의해야 Meshy 가 돈다 */
export const CONSENT_SOLID =
  "입체화 · 3D 변환 허락 — 3D 파일은 작가 소유, 플랫폼은 캠페인 한정 사용권"

/** 구단 MD 실무 순서 */
export const REJECT_REASONS: string[] = [
  "등록 상표 무단 사용 (엠블럼 · 워드마크)",
  "선수 초상 — 별도 초상권 필요",
  "마스코트 · 캐릭터 IP 사용",
  "키트 디자인 복제 (스폰서 독점 카테고리)",
  "브랜드 가이드 위반 (컬러 왜곡 · 변형 · 조롱)",
  "부적절 내용 (라이벌 비하 · 정치 · 폭력 · 성적)",
  "공식 상품과 직접 경쟁 (동일 품목 · 가격대)",
  "인쇄 품질 미달 (해상도 · 색공간)",
  "스폰서 · 파트너 충돌 (경쟁 브랜드 노출)",
  "기타 — 자유 기술 (수정 요청 동반 필수)",
]

/** 판매 채널 — 첫 버전은 고정값이다 */
export const SALES_CHANNEL = "gongnori.fan 내 한정"

/** 자산 체크에 걸린 항목. 하나라도 있으면 권리자에게 넘기기 전에 멈춘다 */
export function assetFlags(a: AssetCheck): string[] {
  return ASSET_LABELS.filter((l) => a[l.key]).map((l) => l.label)
}

/* ────────────────── 제조 파이프라인 (파트너 화면) ────────────────── */

export interface PipelineStep {
  no: string
  title: string
  fan: string
  inside: string
  cost: string
}

/**
 * 팬에게 보이는 것은 네 장면뿐이다. 후보정 · 파팅 · 도색 마스터 · 색분해 · T1/T2 는
 * 관리자 화면의 상태값으로만 존재한다 — 팬 화면에 나오면 아무도 안 읽는다.
 */
export const PIPELINE: PipelineStep[] = [
  {
    no: "1",
    title: "입체 스케치",
    fan: "작가 지면에만. 「최종 제품과 다릅니다」 라벨 필수",
    inside: "Meshy 자동 생성 30초~2분. 실측 306만 삼각형 · 재질 0 · UV 0 — 시안이 아니라 스케치다",
    cost: "크레딧",
  },
  {
    no: "2",
    title: "확정 시안",
    fan: "턴테이블 + 전 · 측 · 후 · 3/4 네 컷 + 치수",
    inside: "모델러 후보정 — 리메시 · 워터타이트 · 최소 두께(레진 1.5~2mm) · 받침 · 치수 확정",
    cost: "10~30만원 · 3~7일",
  },
  {
    no: "3",
    title: "시제품 사진",
    fan: "실물 사진 1장. 팬은 렌더보다 이걸 훨씬 믿는다",
    inside: "테스트 출력 1~2개 → 세척 · 경화 · 서포트 제거 → 촬영",
    cost: "3~5일",
  },
  {
    no: "4",
    title: "제작 · 발송",
    fan: "제작 중 · 발송 완료",
    inside: "레진 배치 20개 1~2주 / 러버 4~6주 / PVC 는 금형 4~8주 + T1 · T2 + 양산 + 해운",
    cost: "품목별",
  },
]

/** 치수 · 사양 표기 항목 — 입체는 이게 없으면 "6cm 인지 12cm 인지" 를 아무도 모른다 */
export const SPEC_FIELDS: string[] = [
  "전고 cm (±0.5)",
  "폭 × 깊이",
  "무게 g 범위",
  "재질 (레진 · PVC · 러버)",
  "마감 (단색 · 도색)",
  "받침 유무",
  "스케일 비교 실루엣",
  "원작자 + 원형 · 후보정 크레딧",
]

/* ────────────────── 카탈로그 · 파트너 요약 (2026-09-08 보강) ────────────────── */

/**
 * 품목 하나에 모인 요청 — 모든 작품을 합친다.
 *
 * ⚠️ `demandFor` 를 거쳐야 한다. 여기서 계수를 다시 곱하면 같은 품목이 화면마다 다른
 *    숫자로 나온다 — 이 파일이 처음에 고쳤던 바로 그 사고다.
 */
export function itemDemand(itemId: string, scene: SceneKey, wanted: Wanted = {}): number {
  return GALLERY.filter((g) => g.opened).reduce(
    (sum, g) => sum + demandFor(g.id, itemId, scene, wanted),
    0
  )
}

/** 이 품목으로 요청을 받고 있는 작품들 — 상품 상세에서 "어느 그림이 이걸 원하나" */
export function piecesWanting(itemId: string): GalleryPiece[] {
  return GALLERY.filter((g) => canRequest(g.id, itemId))
}

/** 품목 정책 한 줄 — 파는지, 왜 아직 안 파는지 */
export const STAGE_POLICY: Record<Stage, { label: string; short: string; why: string }> = {
  sell: {
    label: "지금 팝니다",
    short: "판매",
    why: "UV 인쇄 + 레이저컷 한 공정. 권리 층위도 '인쇄 소품' 하나라 함께 승인할 수 있습니다.",
  },
  phase2: {
    label: "아직 안 팝니다",
    short: "검토",
    why: "금형이 붙거나(러버·PVC) 해상도·상표가 걸립니다. 요청은 받되 판매는 열지 않습니다.",
  },
  signal: {
    label: "팔지 않고 세기만 합니다",
    short: "신호",
    why: "상품이 아니라 구단 미팅에 들고 갈 수요 자료입니다.",
  },
}

/** 요청을 받을 수 있는 품목인가 — 신호 포함, 2단계는 아직 아니다 */
export function acceptsInterest(item: DemoItem): boolean {
  return item.stage === "sell" || item.stage === "signal"
}

export interface PartnerRollup {
  /** 승인 가능한 범위(작가가 연 작품 × 작가가 연 품목)의 총 요청 건수 */
  requests: number
  /** 제작 검토 기준(30)을 넘긴 작품×품목 조합 수 */
  readyCombos: number
  /** 권리자 판단을 기다리는 캠페인 */
  awaitingApproval: number
  /** 승인 주체가 없어 큐에 서지도 못하는 캠페인 (EPL) */
  blocked: number
  /**
   * 요청이 **전부** 주문이 됐을 때의 소비자가 합.
   * ⚠️ 예상 매출이 아니라 **상한**이다. 요청은 구매 약속이 아니다 —
   *    화면에서도 그렇게 부르지 말 것.
   */
  grossCeilingWon: number
  /** 그 상한에서 권리자에게 가는 몫 */
  royaltyCeilingWon: number
  /** 그 상한에서 작가에게 가는 몫 */
  creatorCeilingWon: number
}

/**
 * 파트너 미팅 요약 — **모든 숫자가 `demandFor` · `splitOf` 에서 파생된다.**
 * 요약이 따로 계산하면 아래 보드와 어긋나고, 표를 읽는 사람이 그 자리에서 잡아낸다.
 */
export function partnerRollup(scene: SceneKey, wanted: Wanted = {}): PartnerRollup {
  let requests = 0
  let readyCombos = 0
  let gross = 0
  let royalty = 0
  let creator = 0

  for (const piece of GALLERY) {
    for (const item of interestItemsOf(piece)) {
      const n = demandFor(piece.id, item.id, scene, wanted)
      if (n === 0) continue
      requests += n
      if (n >= GOAL) readyCombos += 1
      // 신호 품목은 팔지 않는다 — 금액에 넣으면 없는 매출이 생긴다
      if (item.stage !== "sell") continue
      const split = splitOf(item.price)
      gross += item.price * n
      royalty += split.rights * n
      creator += split.creator * n
    }
  }

  return {
    requests,
    readyCombos,
    awaitingApproval: APPROVAL_QUEUE.filter((c) => c.rights[scene] === "review").length,
    blocked: BLOCKED_QUEUE.length,
    grossCeilingWon: gross,
    royaltyCeilingWon: royalty,
    creatorCeilingWon: creator,
  }
}

/** 권리자가 이 화면에서 해야 하는 일 — 미팅의 마지막 슬라이드 */
export const PARTNER_ASKS: { title: string; detail: string }[] = [
  {
    title: "인쇄 소품 3종에 대한 포괄 승인",
    detail:
      "스티커 · 아크릴 스탠드 · 아크릴 키링. 한 공정 · 한 권리 층위라 작품마다가 아니라 카테고리로 한 번 승인할 수 있습니다.",
  },
  {
    title: "브랜드 가이드 값 공유",
    detail: "팬톤 · 금지 표현 · 로고 여백. 지금은 색 왜곡이 수정 사유 1위인데 기준이 없습니다.",
  },
  {
    title: "반려 사유를 우리 목록과 맞추기",
    detail: "10개 사유 목록을 그대로 쓰거나 고쳐 주시면, 팬에게 나가는 문구가 구단 기준이 됩니다.",
  },
]

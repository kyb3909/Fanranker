/**
 * LFA 경기 스탯 라벨 → 지면 표기 (**순수 모듈**).
 *
 * ## 왜 파일이 따로인가
 * `lib/lfa/match.ts` 는 서버 전용(`server-only` → supabase → env)이라 테스트에서 열리지
 * 않는다. 이 표가 깨지면 지면이 통째로 비는데, 열 수 없으면 시험도 못 쓴다. 그래서
 * 표와 대조 규칙만 여기로 뺀다 — 여기엔 import 가 하나도 없다.
 *
 * ## 무슨 사고였나 (2026-08-25 ~ 08-26)
 * LFA 백엔드는 터키어고 영어 라벨이 **기계번역**이었다 (`"PLAYING THE BALL"` = 점유율,
 * `"Receiving the Ball in the Opponent's Penalty Area"` = 상대 박스 터치, 값은 `"%41"`
 * 처럼 퍼센트가 앞에 붙고 소수점이 쉼표). 2026-08-25 03:09(UTC) 무렵 그쪽이 영어를
 * 제대로 된 축구 용어로 정리했다.
 *
 * 우리는 `label === en` **정확일치**로 대조하고 있었다. 9개 중 8개가 그 순간 죽고,
 * 이름이 안 바뀐 `Total Shots` 하나만 남아 **지면에 "슈팅" 한 줄만** 떴다.
 * 실측: 8/24 는 67경기 중 37경기가 9개 전부 → 8/25 는 24경기 중 9개짜리가 **0개**.
 *
 * ## 그래서 규칙 셋
 * 1. 옛 이름을 **지우지 않고 별칭으로** 남긴다 — 되돌아오거나 섞여 와도 받는다.
 * 2. 대조는 **정규화**해서 한다 (대소문자·공백·구두점 흔들림에 안 죽게).
 * 3. 비율 지표는 값이 아니라 **표가** 알려준다 — 그쪽이 `%` 접두를 떼면서
 *    점유율이 "39%" 가 아니라 "39" 로 나갈 뻔했다.
 *
 * **목록에 없는 지표는 버린다** — LFA 는 30개를 주지만 노출 지면은 운영자가 정한다.
 * 순서가 곧 표시 순서다.
 */

export interface StatLabelDef {
  /** 지면 표기 */
  ko: string
  /** LFA 라벨 후보 — 첫 번째가 현행, 뒤는 옛 이름(별칭) */
  en: string[]
  /** 비율 지표인가 (값에 % 를 붙인다) */
  percent?: boolean
}

export const STAT_LABELS: StatLabelDef[] = [
  { ko: "기대득점 (xG)", en: ["Expected Goals (xG)", "Goal Expectation (xG)"] },
  { ko: "점유율", en: ["Possession", "PLAYING THE BALL"], percent: true },
  { ko: "슈팅", en: ["Total Shots"] },
  { ko: "유효 슈팅", en: ["Shots on Target", "Accurate Shot"] },
  { ko: "코너킥", en: ["Corners", "corner"] },
  {
    ko: "상대 박스 터치",
    en: ["Touches in Opposition Box", "Receiving the Ball in the Opponent's Penalty Area"],
  },
  { ko: "패스 성공률", en: ["Passing Accuracy", "Pass Accuracy%"], percent: true },
  { ko: "파울", en: ["Fouls", "Foul"] },
  { ko: "오프사이드", en: ["Offsides", "Offside"] },
]

/** 대소문자·공백·구두점을 지운 대조 키 — 라벨 표기가 흔들려도 같은 지표로 본다 */
export function statKey(label: string): string {
  return String(label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/** 별칭까지 펼친 대조표 (정규화 키 → 정의) */
export const STAT_BY_KEY: ReadonlyMap<string, StatLabelDef> = new Map(
  STAT_LABELS.flatMap((s) => s.en.map((en) => [statKey(en), s] as const))
)

/**
 * `"%41"` → `"41%"`, `"2,19"` → `"2.19"` (터키식 소수점 쉼표 + 퍼센트 접두)
 *
 * ⚠️ `isPercent` 가 필요한 이유: LFA 가 라벨을 정리하면서 **퍼센트 접두도 뗐다**.
 *    종전 `"%41"` → 지금 `"41"`. 값만 보고 판단하면 점유율·패스성공률이 단위 없이 나간다.
 */
export function normalizeStatValue(
  raw: string,
  isPercent = false
): { text: string; num: number | null } {
  const s = String(raw ?? "").trim()
  const pct = s.startsWith("%") || s.endsWith("%")
  const body = s.replace(/%/g, "").replace(",", ".").trim()
  const num = Number(body)
  if (!Number.isFinite(num)) return { text: s, num: null }
  return { text: pct || isPercent ? `${body}%` : body, num }
}

export interface MappedStat {
  label: string
  home: string
  away: string
  homeNum: number | null
  awayNum: number | null
}

/** LFA 스탯 배열 → 지면용 행. 못 알아본 라벨은 `unknown` 으로 돌려준다 (조용히 죽지 않게). */
export function mapLfaStats(raw: { label?: string; home?: string; away?: string }[] | null): {
  rows: MappedStat[]
  unknown: string[]
} {
  const incoming = new Map<string, { home: string; away: string }>()
  for (const s of raw ?? []) {
    const k = statKey(s.label ?? "")
    if (k && !incoming.has(k)) incoming.set(k, { home: s.home ?? "", away: s.away ?? "" })
  }

  const rows: MappedStat[] = []
  for (const def of STAT_LABELS) {
    const hit = def.en.map((en) => incoming.get(statKey(en))).find(Boolean)
    if (!hit) continue
    const h = normalizeStatValue(hit.home, def.percent)
    const a = normalizeStatValue(hit.away, def.percent)
    rows.push({ label: def.ko, home: h.text, away: a.text, homeNum: h.num, awayNum: a.num })
  }

  const unknown = (raw ?? [])
    .map((s) => s.label ?? "")
    .filter((l) => l && !STAT_BY_KEY.has(statKey(l)))

  return { rows, unknown }
}

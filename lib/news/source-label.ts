/**
 * 제목 앞 `[출처]` 라벨 표기 정규화 (2026-08-09).
 *
 * 실사고: 최근 14일 발행 제목의 출처 라벨이 영문·한글 혼용이었다 —
 * `[The Athletic]` 12건인데 사전에는 '디 애슬레틱'이 있고, `[Sky Sports]` 4건과
 * `[스카이 스포츠]` 2건이 같은 매체다. `[FC Barcelona]`와 `[FC 바르셀로나]`도 공존.
 * 사전(media 31 / team 32)에 정답이 있는데 발행 경로가 읽지 않아 생긴 일 —
 * 감독 표기 구멍([[naming-normalize]])과 같은 병이다.
 *
 * 게다가 2026-08-09 부터 기사 첫 문장이 출처 귀속으로 시작하도록 바뀌어,
 * 매체명이 가장 눈에 띄는 자리로 올라왔다. 혼용이 그만큼 더 티가 난다.
 *
 * ⚠️ **제목의 대괄호 라벨만** 바꾼다. 본문 전체 치환은 절대 금지 —
 * 'Goal' → '골닷컴'을 본문에 걸면 "Goal of the season"이 박살난다. 라벨은 위치가
 * 고정돼 있어서 오탐이 원천적으로 불가능하다는 것이 이 설계의 전부다.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SourceLabelRow {
  preferred_ko: string
  romanized: string | null
  surfaces: string[] | null
  hangul_alts: string[] | null
}

/** 도메인 끝에서 떼어낼 TLD 조각 (theathletic.com → theathletic, bbc.co.uk → bbc) */
const TLD_PARTS = new Set([
  "com",
  "net",
  "org",
  "co",
  "uk",
  "es",
  "fr",
  "it",
  "de",
  "pt",
  "nl",
  "br",
  "us",
  "io",
  "tv",
  "info",
  "london",
])

/**
 * 짧은 키는 버린다. `[AFC]`가 아스널로, `[OM]`이 마르세유로 둔갑하는 것을 막는다.
 * 3자 이하 약어(bbc·espn·psg·lfc…)는 대부분 preferred 와 같아서 어차피 바뀔 게 없고,
 * 다른 뜻일 위험만 남는다 — 놓치는 건 안전하지만 엉뚱하게 바꾸는 건 안전하지 않다.
 */
const MIN_KEY_LENGTH = 4

/** 비교용 키 — 대소문자·공백·구두점을 접는다 ("The Athletic" ≡ "theathletic.com"의 몸통) */
export function sourceKey(s: string): string {
  return s.toLowerCase().replace(/[\s.·'’`"\-_&,]/g, "")
}

/** 도메인에서 몸통만: theathletic.com → theathletic, bbc.co.uk → bbc */
function domainBody(domain: string): string {
  const parts = domain.toLowerCase().split(".")
  while (parts.length > 1 && TLD_PARTS.has(parts[parts.length - 1])) parts.pop()
  return sourceKey(parts.join(""))
}

/**
 * 사전 행 → {키: 대표표기} 맵.
 * 키 출처: preferred_ko / hangul_alts / surfaces / romanized, 그리고 도메인 몸통.
 * 서로 다른 항목이 같은 키를 주장하면 **먼저 온 항목이 이긴다** (치환 쌍과 같은 규율).
 */
export function buildSourceLabelMap(rows: SourceLabelRow[]): Map<string, string> {
  const map = new Map<string, string>()
  const add = (raw: string | null | undefined, preferred: string) => {
    if (!raw) return
    for (const key of [sourceKey(raw), domainBody(raw)]) {
      if (key.length < MIN_KEY_LENGTH) continue
      if (!map.has(key)) map.set(key, preferred)
    }
  }
  for (const row of rows) {
    const preferred = row.preferred_ko?.trim()
    if (!preferred) continue
    add(preferred, preferred)
    for (const alt of row.hangul_alts ?? []) add(alt, preferred)
    for (const surface of row.surfaces ?? []) add(surface, preferred)
    add(row.romanized, preferred)
  }
  return map
}

/** 제목 맨 앞의 `[라벨]` — 대괄호가 없거나 너무 길면 출처 라벨이 아니다 */
const LABEL_RE = /^\[([^\]]{1,40})\]/

/**
 * 제목의 출처 라벨을 대표 표기로 교정. 사전에 없으면 **그대로 둔다** —
 * 모르는 출처를 억지로 바꾸지 않는 것이 fail-safe 방향이다.
 */
export function normalizeSourceLabel(title: string, map: Map<string, string>): string {
  const m = LABEL_RE.exec(title)
  if (!m) return title
  const label = m[1].trim()
  const preferred = map.get(sourceKey(label))
  if (!preferred || preferred === label) return title
  return `[${preferred}]${title.slice(m[0].length)}`
}

/** 출처 라벨이 될 수 있는 분류 — 매체와 구단(공식 발표) */
export const SOURCE_LABEL_CATEGORIES = ["media", "team"] as const

/** 발행 초크포인트용 로더 (실패 시 빈 맵: 교정 없이 발행 — 사전 장애가 발행을 막지 않는다) */
export async function fetchSourceLabelMap(
  supabase: SupabaseClient<never, never, never> | { from: CallableFunction }
): Promise<Map<string, string>> {
  try {
    const { data } = await (supabase as SupabaseClient)
      .from("news_alias_dictionary")
      .select("preferred_ko, romanized, surfaces, hangul_alts")
      .in("category", [...SOURCE_LABEL_CATEGORIES])
    return buildSourceLabelMap((data ?? []) as SourceLabelRow[])
  } catch {
    return new Map()
  }
}

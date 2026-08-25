/**
 * 선수명 정규화 — 추출된 표기를 news_alias_dictionary 로 접는다.
 *
 * "Vini" 와 "Vinicius Jr" 가 다른 사가로 갈라지는 것(별칭 분열)을 막는 레이어.
 * 병합은 **사전 surface 정확 일치만** — 성씨 prefix 추측 병합은 다른 선수를 한
 * 사가로 합치는 오병합(PRD 병합오류 0 원칙 위반)이라 하지 않는다. 커버리지는
 * 사전이 자라며 해결 (fpl 시드 + learn-corrections 자동 학습).
 */

import { normalizePlayerKey } from "./identity"

export interface AliasRow {
  romanized: string
  preferred_ko: string
  surfaces: string[]
}

interface CanonicalPlayer {
  /** identity_key 에 들어갈 정규 키 (사전 미등재면 입력 그대로 정규화) */
  key: string
  /** 한국어 표기 (사전 미등재면 null — 추출기의 player_kr 이 폴백) */
  ko: string | null
  matched: boolean
}

interface AliasEntry {
  key: string
  ko: string
}

interface AliasIndex {
  exact: Map<string, AliasEntry>
  /** 성(마지막 토큰) → 항목. 같은 성이 여러 명이면 null(충돌 — 병합 금지) */
  bySurname: Map<string, AliasEntry | null>
}

const SURNAME_SKIP = new Set(["jr", "junior", "sr", "ii", "iii"])

function surnameOf(key: string): string | null {
  const tokens = key.split("-").filter((t) => t.length > 0 && !SURNAME_SKIP.has(t))
  const last = tokens[tokens.length - 1]
  return last && last.length >= 3 ? last : null
}

/** 사전 행 → surface 정규화 인덱스 + 성(姓) 인덱스. romanized 자신도 surface 취급 */
export function buildAliasIndex(rows: AliasRow[]): AliasIndex {
  const exact = new Map<string, AliasEntry>()
  const bySurname = new Map<string, AliasEntry | null>()
  for (const row of rows) {
    const key = normalizePlayerKey(row.romanized)
    if (!key) continue
    const entry = { key, ko: row.preferred_ko }
    exact.set(key, entry)
    for (const s of row.surfaces ?? []) {
      const surface = normalizePlayerKey(s)
      if (surface && !exact.has(surface)) exact.set(surface, entry)
    }
    const surname = surnameOf(key)
    if (surname) {
      const prev = bySurname.get(surname)
      // 같은 성이 서로 다른 선수를 가리키면 충돌 표시 — 성만으로는 병합하지 않는다
      if (prev === undefined) bySurname.set(surname, entry)
      else if (prev !== null && prev.key !== entry.key) bySurname.set(surname, null)
    }
  }
  return { exact, bySurname }
}

export function canonicalizePlayer(name: string, index: AliasIndex): CanonicalPlayer {
  const key = normalizePlayerKey(name)
  const hit = index.exact.get(key)
  if (hit) return { key: hit.key, ko: hit.ko, matched: true }

  // 성(姓) 폴백 — "조던 헨더슨"과 "헨더슨"이 다른 사가가 되면 안 된다 (2026-08-04).
  // 사전에서 그 성이 유일할 때만 (동성이인은 충돌 표시돼 있어 병합 안 함)
  const surname = surnameOf(key)
  if (surname) {
    const bySur = index.bySurname.get(surname)
    if (bySur) return { key: bySur.key, ko: bySur.ko, matched: true }
  }
  return { key, ko: null, matched: false }
}

// ─────────────────────────────────────────────────────────────
// 근거 검증 (grounding) — LLM 이 지어낸 이름을 신원으로 받지 않는다
// ─────────────────────────────────────────────────────────────

/**
 * ⚠️ **2026-08-25 실사고 — 사가가 둘로 갈렸다.**
 *
 * 원문 제목은 "Tottenham sign **Savinho** from Man City for £75m" 였는데 추출기가
 * `player: "fabinho"` 를 냈다(파비뉴 — 다른 선수). 그 문자열이 **그대로 기본키**가 돼
 * `transfer:fabinho:in:2026-summer` 사가가 따로 생겼고, 같은 이적이 두 문서로 갈렸다.
 *
 * 재료가 없어서가 아니다. 영어 원문에 철자가 또렷이 있는데도 지어냈다. 그러니
 * 프롬프트를 아무리 다듬어도 확률적으로 재발한다. **구조로 막아야 한다.**
 *
 * 원칙: **LLM 이 만든 식별자는 원문이나 사전에 실재할 때만 신원이 된다.**
 * 언어 이해(누구 이야기인가)는 LLM 몫이지만, 그 결과를 **기본키로 승격**하는 순간
 * 검증이 필요하다. 검증은 결정적이고 공짜다 — 원문에 그 철자가 있는지 보면 된다.
 */

/** 대조용 정규화 — 악센트·대소문자·구두점을 지우고 낱말 사이를 공백 하나로 */
function flatten(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** 낱말 경계로 포함되는가 — "inho" 가 "savinho" 에 걸리는 것을 막는다 */
function hasWord(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `)
}

/** 이름에서 대조에 쓸 토막 — 3자 이하는 'de'·'van' 처럼 아무나 문다 */
function significantTokens(name: string): string[] {
  return flatten(name)
    .split(" ")
    .filter((t) => t.length >= 4)
}

/**
 * 추출된 선수명이 **원문에 실재하는가.**
 * 풀네임이 통째로 있을 필요는 없다 — 의미 있는 토막 하나라도 원문에 있으면 근거로 본다
 * ("Savio Moreira de Oliveira" 를 냈는데 제목엔 "Savio" 만 있는 경우가 정상이다).
 */
export function isGroundedInSource(player: string, sourceText: string): boolean {
  const src = flatten(sourceText)
  if (!src) return false
  const tokens = significantTokens(player)
  if (tokens.length === 0) return false
  return tokens.some((t) => hasWord(src, t))
}

/**
 * 원문에서 **사전에 있는 선수**를 찾아낸다 — 추출기가 지어냈을 때의 복구 경로.
 *
 * ⚠️ 후보가 여럿이면 포기한다. 아무거나 고르면 [[project-squad-dictionary]] 에서 두 번
 *    데인 오병합(다른 사람을 한 사가로)이 재발한다. 모호하면 원문 유지가 규율이다.
 */
export function recoverPlayerFromSource(
  sourceText: string,
  index: AliasIndex
): CanonicalPlayer | null {
  const src = flatten(sourceText)
  if (!src) return null

  const hits = new Map<string, AliasEntry>()
  for (const [surface, entry] of index.exact) {
    // surface 는 normalizePlayerKey 결과라 '-' 로 이어져 있다 — 원문 대조는 공백 기준
    const probe = surface.replace(/-/g, " ")
    if (probe.length < 4) continue
    if (hasWord(src, probe)) hits.set(entry.key, entry)
  }
  if (hits.size !== 1) return null
  const only = [...hits.values()][0]
  return { key: only.key, ko: only.ko, matched: true }
}

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

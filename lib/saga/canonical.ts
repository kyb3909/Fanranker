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

export interface CanonicalPlayer {
  /** identity_key 에 들어갈 정규 키 (사전 미등재면 입력 그대로 정규화) */
  key: string
  /** 한국어 표기 (사전 미등재면 null — 추출기의 player_kr 이 폴백) */
  ko: string | null
  matched: boolean
}

export type AliasIndex = Map<string, { key: string; ko: string }>

/** 사전 행 → surface 정규화 인덱스. romanized 자신도 surface 로 취급 */
export function buildAliasIndex(rows: AliasRow[]): AliasIndex {
  const index: AliasIndex = new Map()
  for (const row of rows) {
    const key = normalizePlayerKey(row.romanized)
    if (!key) continue
    const entry = { key, ko: row.preferred_ko }
    index.set(key, entry)
    for (const s of row.surfaces ?? []) {
      const surface = normalizePlayerKey(s)
      if (surface && !index.has(surface)) index.set(surface, entry)
    }
  }
  return index
}

export function canonicalizePlayer(name: string, index: AliasIndex): CanonicalPlayer {
  const key = normalizePlayerKey(name)
  const hit = index.get(key)
  if (hit) return { key: hit.key, ko: hit.ko, matched: true }
  return { key, ko: null, matched: false }
}

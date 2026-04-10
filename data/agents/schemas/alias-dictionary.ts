// Central alias dictionary. Backed by Supabase table `news_alias_dictionary`.
// Manually curated + grown over time. Naming Resolver READS only.

export type AliasCategory = "player" | "team" | "coach" | "competition"

export interface AliasEntry {
  id: string // e.g. player_salah_mo, team_liverpool
  category: AliasCategory
  preferred_ko: string // canonical Korean display name
  romanized: string // canonical English/romanized form
  surfaces: string[] // every variant we have seen (matching key)
  hangul_alts?: string[] // common Korean variants we should NOT pick (helps detection)
  disambiguation?: string // for homonyms, e.g. "Liverpool FC (잉글랜드)"
  confidence: number // 0..1, our trust in this entry
  ko_first_seen?: string // when this Korean form became standard
  notes?: string
  updatedAt: string
}

export interface AliasLookupHit {
  preferred_ko: string
  confidence: number
  id: string
  category: AliasCategory
  disambiguation?: string
}

// Lookup contract used by Naming Resolver caller (deterministic, NOT LLM):
// 1. lowercase + diacritic-fold the surface
// 2. exact match on surfaces[]
// 3. if multiple candidates with same key, return all and let desk/hold decide
// 4. if no match, return null (resolver MUST treat as unresolved)
export interface AliasLookupRequest {
  category: AliasCategory
  surfaces: string[]
}

export interface AliasLookupResponse {
  hits: Record<string, AliasLookupHit | AliasLookupHit[] | null>
}

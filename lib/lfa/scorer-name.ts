/**
 * 타임라인 선수명 한글화 — **순수 모듈** (2026-09-01 분리).
 *
 * ⚠️ `lib/lfa/match.ts` 안에 있던 것을 뗐다. 거기는 `server-only` + Supabase 를 최상위에서
 *    import 하므로 시험도 CLI 도 부를 수 없었다 — 그래서 "타임라인 이름이 영문으로 남는다"
 *    는 결함을 **재현할 방법이 없었고**, 저장분을 고치는 백필도 규칙을 복사해 써야 했다.
 *    (player-name·options·pair-fixtures 와 같은 이유.)
 *
 * ## 두 단계인 이유
 * 1. **그 경기 라인업**의 로마자와 대조 — 후보가 22명뿐이라 성 하나로도 거의 유일하다
 *    (2026-08-16 실측 40명 중 39명). 근거가 그 경기 안에 있으니 가장 안전하다.
 * 2. 라인업으로 안 되면 **팀 스쿼드 사전** 폴백 — 명단에서 빠진 선수(경기 중 등록 등)를 위한 것.
 *
 * ⚠️ 판정 기준은 "값이 바뀌었나" 가 아니라 **한글이 됐나** 다 (2026-08-18 실사고: 라인업이
 *    로마자 라벨을 돌려주면 바뀐 걸로 착각해 폴백을 건너뛰었다).
 * ⚠️ 애매하면 원문을 유지한다 — 틀린 한글보다 낫다 (fail-closed).
 */
import { tokens } from "@/lib/match/pair-fixtures"

/** 라인업 한 명 — 대조에 필요한 것만 */
export interface RosterEntry {
  label: string
  roman?: string | null
}

/** 스쿼드 사전 한 명 (한글이 확정된 것만 넘긴다) */
export interface SquadEntry {
  nameEn: string
  nameKr: string
}

export function hasHangul(s: string | null | undefined): boolean {
  return !!s && /[가-힣]/.test(s)
}

/** 앞 이니셜("R.")을 뗀 성 토큰 */
function surnameTokens(lfaName: string): string[] {
  return tokens(lfaName.replace(/^[A-Za-z]\.\s*/, ""))
}

/** 성 토큰이 이 후보의 로마자 토큰에 다 들어 있나 (양방향 접두 허용) */
function surnameFits(surname: string[], rt: string[]): boolean {
  return surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))
}

/** ① 그 경기 라인업으로 — 유일하게 결정될 때만 바꾼다 */
export function localizeFromRoster(lfaName: string, roster: RosterEntry[]): string {
  const surname = surnameTokens(lfaName)
  if (surname.length === 0) return lfaName
  const hits = roster.filter((p) => surnameFits(surname, tokens(p.roman ?? "")))
  return hits.length === 1 ? hits[0].label : lfaName
}

/**
 * ② 팀 스쿼드 사전으로 — 성이 같은 동명이인이 있어 이니셜로 한 번 더 거른다
 * (실측: 비야레알 파페 게예 / 라싱 마게테 게예).
 */
export function localizeFromSquad(lfaName: string, squad: SquadEntry[]): string {
  if (squad.length === 0) return lfaName
  const initial = lfaName.match(/^([A-Za-z])\.\s*/)?.[1]?.toLowerCase() ?? null
  const surname = surnameTokens(lfaName)
  if (surname.length === 0) return lfaName

  const hits = squad.filter((p) => {
    const rt = tokens(p.nameEn)
    if (!surnameFits(surname, rt)) return false
    if (!initial) return true
    // 성 토큰이 아닌 나머지(=이름) 중 하나가 이니셜로 시작해야 한다
    const rest = rt.filter(
      (u) => !surname.some((t) => u === t || u.startsWith(t) || t.startsWith(u))
    )
    return rest.length === 0 || rest.some((u) => u.startsWith(initial))
  })
  return hits.length === 1 ? hits[0].nameKr : lfaName
}

/**
 * 타임라인 이름 한 사람분 — 라인업 → 스쿼드 사전 순.
 * 어느 쪽으로도 한글이 안 되면 라인업 단계의 결과(대개 원문)를 그대로 돌려준다.
 */
export function localizeTimelineName(
  raw: string | null | undefined,
  roster: RosterEntry[],
  squad: SquadEntry[]
): string | null {
  const name = raw?.trim()
  if (!name) return null
  const fromRoster = localizeFromRoster(name, roster)
  if (hasHangul(fromRoster)) return fromRoster
  for (const candidate of [name, fromRoster]) {
    const ko = localizeFromSquad(candidate, squad)
    if (hasHangul(ko)) return ko
  }
  return fromRoster
}

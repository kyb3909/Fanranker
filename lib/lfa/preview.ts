import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch } from "@/lib/lfa/client"

/**
 * 경기 부가 정보 — 심판·부상·최근 폼·상대 전적 (2026-08-17, 매치 센터).
 *
 * FotMob 의 "정보" 탭에 해당한다. 전부 경기당 불변에 가까운 데이터라 길게 캐시한다
 * (부상 명단만 경기 전에 바뀌므로 조금 짧게). 셋 다 fail-open — 없으면 섹션이 사라진다.
 *
 * ## 크레딧
 * 경기당 3콜이지만 **12시간 캐시**라 한 경기를 몇 명이 보든 3콜이다. 종료 후에는
 * 값이 굳으므로 재조회할 이유가 없다.
 */

export interface FormMatch {
  date: string
  home: { name: string }
  away: { name: string }
  score: string
}

export interface InjuryRow {
  name: string
  position: string | null
  status: string
}

export interface OfficialRow {
  role: string
  name: string
}

export interface MatchPreview {
  homeForm: FormMatch[]
  awayForm: FormMatch[]
  h2h: FormMatch[]
  injuries: { home: InjuryRow[]; away: InjuryRow[] }
  officials: OfficialRow[]
}

/** LFA 심판 역할 표기 → 한글. 기계번역이라 원문이 이상하다("YES" = VAR) */
const ROLE_LABELS: Record<string, string> = {
  Referee: "주심",
  "Assistant Referee": "부심",
  "4. Referee": "대기심",
  "4th Official": "대기심",
  YES: "VAR",
  VAR: "VAR",
  AVAR: "AVAR",
}

/**
 * 결장 사유 한글화 (2026-08-17 운영자: "결장 이유도 모두 한글로").
 *
 * 어휘가 닫혀 있어(부위 + 유형 조합) 사전이 아니라 **부분 치환**으로 처리한다:
 * "Thigh Muscle Strain" → "허벅지 근육 염좌". 못 바꾼 토큰은 그대로 남겨
 * 정보가 사라지지 않게 한다 (빈칸보다 영문이 낫다).
 * 긴 표현부터 치환해야 "Hamstring Injury" 가 "Injury" 에 먼저 걸리지 않는다.
 */
const INJURY_TERMS: [RegExp, string][] = [
  // 통 문장형 사유 — 부분 치환보다 먼저 통째로 잡는다 (2026-08-18 실측 미번역분)
  [/not included in the (?:match )?squad/gi, "명단 제외"],
  [/impact[- ]related/gi, "타박"],
  [/lack of match fitness/gi, "경기 감각 부족"],
  [/knock/gi, "타박"],
  // 상태·유형 (먼저)
  [/\bcruciate ligament\b/gi, "십자인대"],
  [/\bligament\b/gi, "인대"],
  [/\bmuscle strain\b/gi, "근육 염좌"],
  [/\bmuscular problems?\b/gi, "근육 문제"],
  [/\bstrain\b/gi, "염좌"],
  [/\brupture\b/gi, "파열"],
  [/\btear\b/gi, "파열"],
  [/\bfracture\b/gi, "골절"],
  [/\bbroken\b/gi, "골절"],
  [/\bsurgery\b/gi, "수술"],
  [/\bconcussion\b/gi, "뇌진탕"],
  [/\billness\b/gi, "질병"],
  [/\bfitness\b/gi, "컨디션"],
  [/\bsuspend(?:ed|ision)?\b/gi, "출전정지"],
  [/\bsuspension\b/gi, "출전정지"],
  [/\bred card\b/gi, "퇴장 징계"],
  [/\bdoubtful\b/gi, "출전 불투명"],
  [/\bunknown\b/gi, "사유 미상"],
  [/\bpersonal reasons?\b/gi, "개인 사정"],
  [/\binternational duty\b/gi, "대표팀 차출"],
  [/\bproblems?\b/gi, "문제"],
  [/\binjur(?:y|ies|ed)\b/gi, "부상"],
  [/\bout\b/gi, "결장"],
  // 부위
  [/\bhamstring\b/gi, "햄스트링"],
  [/\bachilles\b/gi, "아킬레스건"],
  [/\bthigh\b/gi, "허벅지"],
  [/\bcalf\b/gi, "종아리"],
  [/\bgroin\b/gi, "사타구니"],
  [/\bknee\b/gi, "무릎"],
  [/\bankle\b/gi, "발목"],
  [/\bfoot\b/gi, "발"],
  [/\btoe\b/gi, "발가락"],
  [/\bhip\b/gi, "고관절"],
  [/\bback\b/gi, "허리"],
  [/\bshoulder\b/gi, "어깨"],
  [/\belbow\b/gi, "팔꿈치"],
  [/\bwrist\b/gi, "손목"],
  [/\bhand\b/gi, "손"],
  [/\bhead\b/gi, "머리"],
  [/\bface\b/gi, "얼굴"],
  [/\bnose\b/gi, "코"],
  [/\brib\b/gi, "갈비뼈"],
  [/\bchest\b/gi, "가슴"],
  [/\babdominal\b/gi, "복부"],
  [/\bpubic\b/gi, "치골"],
  [/\bmeniscus\b/gi, "반월판"],
  [/\bmuscle\b/gi, "근육"],
]

export function localizeInjuryStatus(raw: string): string {
  let s = String(raw ?? "").trim()
  if (!s) return s
  for (const [re, ko] of INJURY_TERMS) s = s.replace(re, ko)
  // "허벅지/고관절 부상" 처럼 슬래시 구분은 가운뎃점이 한국어에서 자연스럽다
  return s
    .replace(/\s*\/\s*/g, "·")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function toFormMatches(raw: unknown): FormMatch[] {
  if (!Array.isArray(raw)) return []
  const out: FormMatch[] = []
  for (const m of raw as Record<string, unknown>[]) {
    const home = (m.home ?? {}) as { name?: string }
    const away = (m.away ?? {}) as { name?: string }
    if (!home.name || !away.name) continue
    out.push({
      date: String(m.date ?? ""),
      home: { name: home.name },
      away: { name: away.name },
      score: String(m.score ?? ""),
    })
  }
  return out
}

/* ── 팀명·선수명 한글화 ──
 *
 * 정보 탭이 통째로 영문이었다 — 상대 전적 "R. Santander 2-1 Villarreal", 결장자
 * "G. Guliashvili" (2026-08-18 운영자: "선수단 이름도 전혀 반영이 안되어있어").
 * 콘텐츠 한글 원칙이 이 탭에만 적용되지 않고 있었다.
 *
 * 둘 다 **유일하게 결정될 때만** 바꾸고, 아니면 원문을 남긴다 — 틀린 한글보다 낫다. */

function nameTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !["the", "afc", "club"].includes(t))
}

/** 영문 팀명 → 한글 (team_dictionary, 1h 캐시) */
const cachedTeamPairs = unstable_cache(
  async (): Promise<[string, string][]> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("name_en, name_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    return (data ?? [])
      .filter((r) => r.name_en)
      .map((r) => [String(r.name_en), String(r.name_kr)] as [string, string])
  },
  ["lfa-preview-team-names"],
  { revalidate: 3600 }
)

/**
 * LFA 축약 팀명 → 한글. LFA 표기가 제각각이라("R. Santander"·"alaves"·"Ath.") 느슨하게
 * 보되, **정확일치를 접두일치보다 높게** 친다.
 *
 * ⚠️ 접두 겹침만으로 동급 판정하면 오답이 난다 (2026-08-18 실측):
 *    "Ath." 가 "AEK Athens" 의 "athens" 에 걸려 AEK아테네가 됐고,
 *    "Villarreal" 은 "Aston Villa" 의 "villa" 와 동점이 돼 둘 다 버려졌다.
 *    3글자 토큰은 정확일치만 인정하고, 정확일치가 있으면 그쪽이 이긴다.
 */
function localizeTeam(lfaName: string, pairs: [string, string][]): string {
  const a = nameTokens(lfaName)
  if (a.length === 0) return lfaName

  const score = (t: string, b: string[]): number => {
    if (b.some((u) => u === t)) return 2
    if (t.length >= 4 && b.some((u) => u.startsWith(t) || t.startsWith(u))) return 1
    return 0
  }

  let best = 0
  const hits = new Set<string>()
  for (const [en, kr] of pairs) {
    const b = nameTokens(en)
    if (b.length === 0) continue
    const total = a.reduce((sum, t) => sum + score(t, b), 0)
    if (total === 0) continue
    if (total > best) {
      best = total
      hits.clear()
    }
    if (total === best) hits.add(kr)
  }
  return hits.size === 1 ? [...hits][0] : lfaName
}

/** 팀 한글명 → 그 팀 스쿼드 (영문명은 "성 이름" 순) */
const cachedSquad = unstable_cache(
  async (teamKr: string): Promise<[string, string][]> => {
    const supabase = createServiceRoleClient()
    const { data: team } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id")
      .eq("name_kr", teamKr)
      .maybeSingle()
    if (!team) return []
    const { data } = await supabase
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", team.soccerway_team_id)
      .not("name_kr", "is", null)
      .neq("status", "rejected")
    return (data ?? []).map((r) => [String(r.name_en ?? ""), String(r.name_kr)] as [string, string])
  },
  ["lfa-preview-squad"],
  { revalidate: 21600 }
)

/** "G. Guliashvili" → 한글. 이니셜은 앞뒤 어디든 올 수 있어 성 토큰으로만 본다 */
function localizePlayer(lfaName: string, squad: [string, string][]): string {
  const surname = nameTokens(lfaName)
  if (surname.length === 0 || squad.length === 0) return lfaName
  const hits = new Set<string>()
  for (const [en, kr] of squad) {
    const rt = nameTokens(en)
    if (surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))) {
      hits.add(kr)
    }
    if (hits.size > 1) return lfaName
  }
  return hits.size === 1 ? [...hits][0] : lfaName
}

async function fetchPreview(
  matchId: string,
  homeTeamKr: string,
  awayTeamKr: string
): Promise<MatchPreview> {
  const [h2hData, injData, offData] = await Promise.all([
    lfaFetch<{ home_form?: unknown; away_form?: unknown; h2h?: unknown }>("h2h", {
      match_id: matchId,
      lang: "en",
    }),
    lfaFetch<{ injuries?: { home?: unknown[]; away?: unknown[] } }>("injuries", {
      match_id: matchId,
      lang: "en",
    }),
    lfaFetch<{ officials?: unknown[] }>("officials", { match_id: matchId, lang: "en" }),
  ])

  // 한글화 재료 — 실패해도 원문이 남는다 (fail-open)
  const [teamPairs, homeSquad, awaySquad] = await Promise.all([
    cachedTeamPairs().catch(() => [] as [string, string][]),
    cachedSquad(homeTeamKr).catch(() => [] as [string, string][]),
    cachedSquad(awayTeamKr).catch(() => [] as [string, string][]),
  ])

  const toInjuries = (raw: unknown[] | undefined, squad: [string, string][]): InjuryRow[] =>
    (raw ?? [])
      .map((r) => r as { name?: string; position?: string; status?: string })
      .filter((r) => !!r.name)
      .map((r) => ({
        name: localizePlayer(String(r.name), squad),
        position: r.position ? String(r.position) : null,
        status: localizeInjuryStatus(String(r.status ?? "")),
      }))

  const koForm = (list: FormMatch[]): FormMatch[] =>
    list.map((m) => ({
      ...m,
      home: { name: localizeTeam(m.home.name, teamPairs) },
      away: { name: localizeTeam(m.away.name, teamPairs) },
    }))

  return {
    homeForm: koForm(toFormMatches(h2hData?.home_form)),
    awayForm: koForm(toFormMatches(h2hData?.away_form)),
    h2h: koForm(toFormMatches(h2hData?.h2h)),
    injuries: {
      home: toInjuries(injData?.injuries?.home, homeSquad),
      away: toInjuries(injData?.injuries?.away, awaySquad),
    },
    officials: (offData?.officials ?? [])
      .map((o) => o as { role?: string; name?: string })
      .filter((o) => !!o.name && !!o.role)
      .map((o) => ({ role: ROLE_LABELS[String(o.role)] ?? String(o.role), name: String(o.name) })),
  }
}

/** 12시간 캐시 — 경기당 3콜이 그 시간 동안 모든 방문자를 덮는다 */
export function getMatchPreview(
  matchId: string,
  homeTeamKr: string,
  awayTeamKr: string
): Promise<MatchPreview> {
  return unstable_cache(
    () => fetchPreview(matchId, homeTeamKr, awayTeamKr),
    ["lfa-preview-v2", matchId],
    { revalidate: 12 * 3600 }
  )().catch(() => ({
    homeForm: [],
    awayForm: [],
    h2h: [],
    injuries: { home: [], away: [] },
    officials: [],
  }))
}

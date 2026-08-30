/**
 * team_dictionary 백필 — LFA 경기 목록에서 팀 영문명·팀 id 를 회수한다.
 *
 * ## 왜 필요한가
 * `lib/lfa/match.ts` 의 팀 대조는 betman 한글명을 `team_dictionary` 로 영문화한 뒤
 * LFA 축약명과 겹치는지 본다. 사전에 없으면 **한글이 그대로** 대조에 들어가는데,
 * 토큰화가 `[^a-z0-9\s]` 를 지우므로 빈 배열이 되어 **무조건 실패**한다 — 그 경기의
 * 라인업·스탯·타임라인이 통째로 사라지고, 라인업이 조건인 불판도 생성되지 않는다.
 * (2026-08-23 실사고: 브라이턴·본머스 미등재 → 두 EPL 경기 라인업 0, 불판 0)
 *
 * ## 왜 lib 으로 나왔나 (2026-08-30)
 * 종전엔 `scripts/backfill-team-dictionary-from-lfa.ts` 한 벌뿐이라 **사람이 기억해서
 * 돌려야** 메워졌다. 실제로 분데스리가 4팀(프라이부르크·아우크스부르크·브레멘·샬케)이
 * 미등재로 남아 그날 라인업이 전부 영문으로 나갔다 — 같은 사고의 재발이다.
 * 운영자: "이건 서버에서 자체적으로 처리해야 하는 부분이잖아."
 * 그래서 로직을 여기 두고 **크론과 CLI 가 같이 쓴다.** 두 벌로 두면 갈라진다.
 *
 * ⚠️ `server-only` 를 import 하지 않는다 — CLI(tsx)에서도 불러야 한다.
 *    Supabase 클라이언트는 호출부가 넘긴다 (`lib/dictionary/sync-news.ts` 와 같은 규율).
 *
 * ## 안전 규칙 (건드리지 말 것)
 * - **킥오프 시각이 그 리그에서 유일한 경기만** 채택한다. 동시 킥오프가 여럿이면
 *   이미 아는 팀으로 좁히고, 그래도 1건이 아니면 포기한다 — 남의 팀 이름 등재가 최악이다.
 * - team_dictionary PK 는 `soccerway_team_id` 라 soccerway 에 없는 팀은 합성 id
 *   `lfa_<LFA팀id>` 로 만든다. soccerway 경로는 이 id 로 404 지만 전부 fail-open 이고,
 *   로스터 정본은 이미 LFA 피드다 (2026-08-24 운영자: "사커웨이는 이제 의미가 없어졌어").
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { LFA_LEAGUE_IDS } from "@/lib/lfa/leagues"

/** 백필 대상 리그 — 매치 페이지가 다루는 5대 리그 + 유럽 대항전 */
const TARGET_LEAGUES = ["EPL", "라리가", "세리에A", "분데스리", "프리그1", "UCL", "UEL", "UECL"]

interface LfaMatch {
  id: string
  league?: { id?: string }
  kickoff?: string
  home?: { id?: string; name?: string }
  away?: { id?: string; name?: string }
}

export interface TeamBackfillResult {
  /** 사전에 영문명이 없던 팀 */
  missing: string[]
  /** LFA 에서 짝을 찾은 팀 */
  found: { kr: string; en: string; lfaId: string | null }[]
  /** 동시 킥오프 등으로 확정 못 한 팀 — fail-closed */
  unresolved: string[]
  /** lfa_team_names 에 쓴 건수 */
  labelsWritten: number
  /** team_dictionary 에 새로 등재한 팀 */
  dictAdded: { kr: string; en: string; id: string }[]
  /** LFA 팀 id 가 없어 합성 PK 를 못 만든 팀 */
  dictSkipped: string[]
  /** LFA 하루 목록 조회에 실패한 날짜 */
  failedDates: string[]
}

/** lib/lfa/match.ts teamMatches 와 같은 규칙 — 축약 방식이 달라 접두 겹침으로 본다 */
function looseMatch(lfaName: string, ourEn: string): boolean {
  const tok = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
  const a = tok(lfaName)
  const b = tok(ourEn)
  if (a.length === 0 || b.length === 0) return false
  return a.some((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)))
}

async function fetchLfaDay(dateUtc: string, apiKey: string): Promise<LfaMatch[]> {
  const qs = new URLSearchParams({ api_key: apiKey, date: dateUtc, lang: "en" })
  // ⚠️ matches 는 하루 800경기 913KB 라 LFA 서버 캐시가 비면 46초까지 간다 (2026-08-24 실측).
  const res = await fetch(`https://live-football-api.com/api/v1/matches?${qs}`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`LFA ${res.status}`)
  const json = (await res.json()) as { data?: { matches?: LfaMatch[] } }
  return json.data?.matches ?? []
}

/** 정규화 대조 — lib/match/resolve-team-id.ts 와 같은 규칙(정확일치·별칭·포함관계) */
const normTeam = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\s&·．.\-_'"()]/g, "")
    .trim()

export async function backfillTeamDictionaryFromLfa(
  supabase: SupabaseClient,
  opts: { apiKey: string; days?: number; apply?: boolean }
): Promise<TeamBackfillResult> {
  const days = opts.days ?? 10
  const apply = opts.apply ?? false
  const out: TeamBackfillResult = {
    missing: [],
    found: [],
    unresolved: [],
    labelsWritten: 0,
    dictAdded: [],
    dictSkipped: [],
    failedDates: [],
  }

  // 1) 사전에 영문명이 없는 팀 (대상 리그, 최근 N일 경기)
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString()
  const { data: games } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, league_code, match_time")
    .eq("sport", "축구")
    .in("league_code", TARGET_LEAGUES)
    .gte("match_time", since)
  if (!games?.length) return out

  const [{ data: dict }, { data: lfaDict }] = await Promise.all([
    supabase.from("team_dictionary").select("name_kr, name_en"),
    supabase.from("lfa_team_names").select("name_kr, name_en"),
  ])
  const dictAll = [...(dict ?? []), ...(lfaDict ?? [])]
  const known = new Set(dictAll.filter((d) => d.name_en).map((d) => String(d.name_kr)))
  const enOf = new Map(
    dictAll.filter((d) => d.name_en).map((d) => [String(d.name_kr), String(d.name_en)])
  )
  const missing = new Set<string>()
  for (const g of games) {
    for (const kr of [g.home_team_name, g.away_team_name]) {
      if (kr && kr !== "미정" && !known.has(String(kr))) missing.add(String(kr))
    }
  }
  out.missing = [...missing]
  if (missing.size === 0) return out

  // 2) 날짜별 LFA 경기 — 리그+킥오프가 유일한 경기만 신뢰
  const dates = [...new Set(games.map((g) => String(g.match_time).slice(0, 10)))].sort()
  const found = new Map<string, { en: string; lfaId: string | null }>()

  for (const d of dates) {
    let matches: LfaMatch[]
    try {
      matches = await fetchLfaDay(d, opts.apiKey)
    } catch {
      out.failedDates.push(d)
      continue
    }
    const byKey = new Map<string, LfaMatch[]>()
    for (const m of matches) {
      const k = `${m.league?.id ?? ""}|${m.kickoff ?? ""}`
      byKey.set(k, [...(byKey.get(k) ?? []), m])
    }
    for (const g of games) {
      if (String(g.match_time).slice(0, 10) !== d) continue
      const lid = LFA_LEAGUE_IDS.get(String(g.league_code))
      if (!lid) continue
      const hhmm = new Date(String(g.match_time)).toISOString().slice(11, 16)
      let bucket = byKey.get(`${lid}|${hhmm}`) ?? []
      if (bucket.length === 0) continue
      if (bucket.length > 1) {
        // 동시 킥오프 — **이미 아는 팀**으로 좁힌다. 라운드가 통째로 같은 시각에 열리는
        // 리그에서 이 단계 없이는 아무것도 못 건진다.
        const knownEn = [g.home_team_name, g.away_team_name]
          .map((kr) => enOf.get(String(kr)))
          .filter((v): v is string => !!v)
        if (knownEn.length === 0) continue
        const narrowed = bucket.filter((m) =>
          knownEn.every(
            (en) => looseMatch(m.home?.name ?? "", en) || looseMatch(m.away?.name ?? "", en)
          )
        )
        if (narrowed.length !== 1) continue // 여전히 애매하면 포기 (오등재가 최악)
        bucket = narrowed
      }
      const m = bucket[0]
      const pairs: [string | null, { id?: string; name?: string } | undefined][] = [
        [g.home_team_name as string | null, m.home],
        [g.away_team_name as string | null, m.away],
      ]
      for (const [kr, side] of pairs) {
        if (!kr || !side?.name || !missing.has(kr) || found.has(kr)) continue
        found.set(kr, { en: side.name, lfaId: side.id ?? null })
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  out.found = [...found].map(([kr, v]) => ({ kr, ...v }))
  out.unresolved = [...missing].filter((k) => !found.has(k))

  if (apply) {
    for (const [kr, v] of found) {
      const { error } = await supabase.from("lfa_team_names").upsert(
        {
          name_kr: kr,
          name_en: v.en,
          lfa_team_id: v.lfaId,
          source: "lfa-backfill",
          note: "LFA 경기 목록에서 회수 (리그+킥오프 유일 대조, 동시 킥오프는 기지의 팀으로 좁힘)",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "name_kr" }
      )
      if (!error) out.labelsWritten++
    }
  }

  /* ── 3) team_dictionary 본등재 ──
   * lfa_team_names 는 영문→한글 라벨만 준다. 스쿼드 적재·나무위키 선수명 수확·선수
   * 한글화는 전부 team_dictionary 행을 기준으로 돌므로, 행이 없는 구단은 선수 이름이
   * 영영 영문이다. */
  const { data: dictFull } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, aliases_kr")
    .neq("status", "rejected")
  const dictRows = (dictFull ?? []).map((r) => ({
    nameKr: String(r.name_kr ?? ""),
    aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
  }))
  const inDict = (kr: string): boolean => {
    if (dictRows.some((d) => d.nameKr === kr || d.aliases.includes(kr))) return true
    const a = normTeam(kr)
    if (a.length < 3) return false
    return dictRows.some((d) => {
      const b = normTeam(d.nameKr)
      return b.length >= 3 && (a.includes(b) || b.includes(a))
    })
  }

  const { data: lfaAll } = await supabase
    .from("lfa_team_names")
    .select("name_kr, name_en, lfa_team_id")
  const candidates = new Map<string, { en: string; lfaId: string | null }>()
  for (const r of lfaAll ?? []) {
    candidates.set(String(r.name_kr), {
      en: String(r.name_en),
      lfaId: r.lfa_team_id ? String(r.lfa_team_id) : null,
    })
  }
  for (const [kr, v] of found) candidates.set(kr, v)

  for (const [kr, v] of candidates) {
    if (inDict(kr)) continue
    if (!v.lfaId) {
      out.dictSkipped.push(kr)
      continue
    }
    const synthetic = `lfa_${v.lfaId}`
    if (!apply) {
      out.dictAdded.push({ kr, en: v.en, id: synthetic })
      continue
    }
    const { error } = await supabase.from("team_dictionary").upsert(
      {
        soccerway_team_id: synthetic,
        slug: synthetic,
        name_en: v.en,
        name_kr: kr,
        lfa_team_id: v.lfaId,
        source: "lfa_pair",
        status: "proposed",
        note: "betman↔LFA 경기 짝맞춤으로 등재 (soccerway 미보유 → 합성 id)",
      },
      { onConflict: "soccerway_team_id" }
    )
    if (!error) out.dictAdded.push({ kr, en: v.en, id: synthetic })
  }

  return out
}

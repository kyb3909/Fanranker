/**
 * 팀 사전 일괄 시드 — betman 한글 팀명 → soccerway 팀 해시 (2026-08-17).
 *
 * ## 왜 필요한가
 * 라인업은 `match_mapping_attempts` 의 proposed 행이 있어야 뜨는데, 그 매핑은
 * `team_dictionary` 에 팀이 있어야 성립한다. 사전이 비어 있으면 5대 리그·유럽 대항전
 * 경기라도 라인업이 통째로 없다 (2026-08-16~17 실측: 라리가 개막 라운드 전부 누락).
 *
 * 기존 자동 발견은 **LLM 이 한글 팀명을 로마자로 추측**하는 단계에서 깨졌다
 * ("데포르티보 아코루냐" → 쿼리 0건). 이 스크립트는 그 추측을 없앤다:
 *
 *   betman 한글 → (킥오프 시각으로 LFA 경기 매칭) → **LFA 영문 팀명** → soccerway 검색
 *   → 두 팀으로 경기 URL 구성 → 날짜 대조 성공 시에만 등재
 *
 * 킥오프 시각 매칭은 표기를 타지 않으므로 로마자 변환이 원천적으로 불필요하다.
 * 등재는 **경기 페이지 날짜 대조를 통과했을 때만** — 검색 1위라서가 아니다 (fail-closed).
 *
 * 실행: pnpm exec tsx scripts/seed-teams-from-lfa.ts [--apply] [--days=14]
 * 기본은 드라이런.
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "../lib/match/leagues"
import { LFA_LEAGUE_IDS } from "../lib/lfa/leagues"
import { searchSoccerwayTeams, leagueCountryHint } from "../lib/soccerway/team-search"
import { buildMatchUrl, fetchMatchPage, parseMatchPage } from "../lib/soccerway/match-page"
import { judgeMatchPage, type TeamDictionaryRow } from "../lib/soccerway/match-mapping"

const APPLY = process.argv.includes("--apply")
const daysArg = process.argv.find((a) => a.startsWith("--days="))
const DAYS = daysArg ? Number(daysArg.slice(7)) || 14 : 14

interface LfaMatchLite {
  id: string
  league: { id: string }
  kickoff: string
  home: { name: string }
  away: { name: string }
}

const dayCache = new Map<string, LfaMatchLite[]>()

async function lfaDay(dateUtc: string): Promise<LfaMatchLite[]> {
  if (dayCache.has(dateUtc)) return dayCache.get(dateUtc)!
  const key = process.env.LIVE_FOOTBALL_API_KEY
  if (!key) throw new Error("LIVE_FOOTBALL_API_KEY 없음")
  const qs = new URLSearchParams({ api_key: key, date: dateUtc, lang: "en" })
  const res = await fetch(`https://live-football-api.com/api/v1/matches?${qs}`)
  const json = (await res.json()) as {
    credits_remaining?: number
    data?: { matches?: LfaMatchLite[] }
  }
  const list = json.data?.matches ?? []
  dayCache.set(dateUtc, list)
  console.log(`  [LFA] ${dateUtc} — ${list.length}경기 (잔여 크레딧 ${json.credits_remaining})`)
  return list
}

/** 검색 결과에서 영문명이 가장 근접한 후보 순으로 (최대 3) */
async function candidatesFor(nameEn: string, country: string | null) {
  const res = await searchSoccerwayTeams(nameEn)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
  const target = norm(nameEn)
  return res
    .filter((c) => !country || !c.country || c.country === country)
    .sort((a, b) => {
      const an = norm(a.nameEn)
      const bn = norm(b.nameEn)
      const score = (x: string) =>
        x === target ? 0 : x.startsWith(target) || target.startsWith(x) ? 1 : 2
      return score(an) - score(bn)
    })
    .slice(0, 3)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) throw new Error("SUPABASE env 누락")
  const supabase = createClient(url, svc, { auth: { persistSession: false } })

  const { data: dictRows } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, slug, name_en, name_kr, aliases_kr, status")
  const dictionary = (dictRows ?? []) as TeamDictionaryRow[]
  const known = new Set<string>()
  for (const r of dictionary) {
    if (r.status === "rejected") continue
    if (r.name_kr) known.add(r.name_kr.trim())
    for (const a of r.aliases_kr ?? []) known.add(a.trim())
  }
  const byId = new Map(dictionary.map((r) => [r.soccerway_team_id, r]))
  console.log(`사전 ${dictionary.length}팀 / 표기 ${known.size}종`)

  const since = new Date(Date.now() - DAYS * 24 * 3600_000).toISOString()
  const until = new Date(Date.now() + DAYS * 24 * 3600_000).toISOString()
  const { data: games } = await supabase
    .from("betman_games")
    .select("id, home_team_name, away_team_name, league_code, match_time")
    .eq("sport", "축구")
    .in("league_code", [...MATCH_PAGE_LEAGUES])
    .gte("match_time", since)
    .lte("match_time", until)
    .order("match_time", { ascending: true })

  // 경기 단위 dedup + 미등재 팀이 하나라도 있는 경기만
  const seen = new Set<string>()
  const targets: { home: string; away: string; league: string; time: string }[] = []
  for (const g of games ?? []) {
    const k = `${g.home_team_name}|${g.away_team_name}|${g.match_time}`
    if (seen.has(k)) continue
    seen.add(k)
    const h = String(g.home_team_name).trim()
    const a = String(g.away_team_name).trim()
    if (known.has(h) && known.has(a)) continue
    targets.push({ home: h, away: a, league: String(g.league_code), time: String(g.match_time) })
  }
  console.log(`대상 경기 ${targets.length}건 (미등재 팀 포함)\n`)
  if (targets.length === 0) return

  const discovered: Record<string, unknown>[] = []
  const failures: string[] = []

  for (const t of targets) {
    const leagueId = LFA_LEAGUE_IDS.get(t.league)
    if (!leagueId) {
      failures.push(`${t.league} ${t.home} vs ${t.away} — LFA 리그 매핑 없음`)
      continue
    }
    const date = new Date(t.time).toISOString().slice(0, 10)
    const hhmm = new Date(t.time).toISOString().slice(11, 16)
    let lfaMatch: LfaMatchLite | undefined
    try {
      const day = await lfaDay(date)
      const inLeague = day.filter((m) => m.league?.id === leagueId)
      const sameTime = inLeague.filter((m) => m.kickoff === hhmm)
      if (sameTime.length === 1) lfaMatch = sameTime[0]
    } catch (e) {
      failures.push(`${t.home} vs ${t.away} — LFA 조회 실패: ${(e as Error).message}`)
      continue
    }
    if (!lfaMatch) {
      failures.push(`${t.league} ${t.home} vs ${t.away} @${hhmm} — LFA 경기 특정 실패`)
      continue
    }

    const country = leagueCountryHint(t.league)
    const homeCands = known.has(t.home)
      ? [dictionary.find((r) => r.name_kr === t.home || r.aliases_kr?.includes(t.home))!]
      : await candidatesFor(lfaMatch.home.name, country)
    const awayCands = known.has(t.away)
      ? [dictionary.find((r) => r.name_kr === t.away || r.aliases_kr?.includes(t.away))!]
      : await candidatesFor(lfaMatch.away.name, country)

    const toRow = (c: {
      soccerwayTeamId: string
      slug: string
      nameEn: string
    }): TeamDictionaryRow => ({
      soccerway_team_id: c.soccerwayTeamId,
      slug: c.slug,
      name_en: c.nameEn,
      name_kr: null,
      aliases_kr: [],
      status: "proposed",
    })
    const homes = homeCands.filter(Boolean).map((c) => ("soccerwayTeamId" in c ? toRow(c) : c))
    const aways = awayCands.filter(Boolean).map((c) => ("soccerwayTeamId" in c ? toRow(c) : c))

    // 조합을 실제 경기 페이지로 검증 — 정확히 1건 성립할 때만 채택
    const winners: { home: TeamDictionaryRow; away: TeamDictionaryRow }[] = []
    for (const h of homes) {
      for (const a of aways) {
        if (winners.length > 1) break
        if (h.soccerway_team_id === a.soccerway_team_id) continue
        const u = buildMatchUrl(
          { slug: h.slug, soccerwayTeamId: h.soccerway_team_id },
          { slug: a.slug, soccerwayTeamId: a.soccerway_team_id }
        )
        try {
          const fetched = await fetchMatchPage(u)
          if (fetched.httpStatus !== 200 || !fetched.html) continue
          const page = parseMatchPage(fetched.html)
          if (!page) continue
          const verdict = judgeMatchPage({ match_time: t.time }, h, a, page)
          if (verdict.outcome === "proposed") winners.push({ home: h, away: a })
        } catch {
          /* 조합 하나 실패는 건너뛴다 */
        }
        await new Promise((r) => setTimeout(r, 350))
      }
    }

    if (winners.length !== 1) {
      failures.push(
        `${t.league} ${t.home} vs ${t.away} — 검증 조합 ${winners.length}건 ` +
          `(LFA: ${lfaMatch.home.name} vs ${lfaMatch.away.name})`
      )
      continue
    }

    const w = winners[0]
    for (const [kr, row] of [
      [t.home, w.home],
      [t.away, w.away],
    ] as [string, TeamDictionaryRow][]) {
      if (known.has(kr)) continue
      known.add(kr)
      const existing = byId.get(row.soccerway_team_id)
      discovered.push(
        existing
          ? {
              mode: "alias",
              soccerway_team_id: row.soccerway_team_id,
              name_kr: kr,
              name_en: row.name_en,
            }
          : {
              mode: "insert",
              soccerway_team_id: row.soccerway_team_id,
              slug: row.slug,
              name_en: row.name_en,
              name_kr: kr,
            }
      )
      console.log(`  ✓ ${kr}  →  ${row.name_en} (${row.soccerway_team_id})`)
    }
  }

  console.log(`\n등재 대상 ${discovered.length}건 / 실패 ${failures.length}건`)
  for (const f of failures.slice(0, 25)) console.log(`  ✗ ${f}`)

  if (!APPLY) {
    console.log("\n(드라이런 — 반영하려면 --apply)")
    return
  }
  let ok = 0
  for (const d of discovered) {
    if (d.mode === "alias") {
      const cur = byId.get(d.soccerway_team_id as string)
      const merged = Array.from(new Set([...(cur?.aliases_kr ?? []), d.name_kr as string]))
      const { error } = await supabase
        .from("team_dictionary")
        .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
        .eq("soccerway_team_id", d.soccerway_team_id as string)
      if (error) console.error(`  별칭 실패 ${d.name_kr}: ${error.message}`)
      else ok++
    } else {
      const { error } = await supabase.from("team_dictionary").insert({
        soccerway_team_id: d.soccerway_team_id,
        slug: d.slug,
        name_en: d.name_en,
        name_kr: d.name_kr,
        aliases_kr: [],
        status: "proposed",
        source: "lfa_verified",
        note: "LFA 영문명 + 경기 페이지 날짜 대조로 검증 (seed-teams-from-lfa)",
      })
      if (error) console.error(`  등재 실패 ${d.name_kr}: ${error.message}`)
      else ok++
    }
  }
  console.log(`[done] ${ok}건 반영`)
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})

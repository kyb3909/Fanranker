import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { BETMAN_CODE_BY_LFA_ID } from "@/lib/lfa/leagues"
import type { LfaMatch } from "@/lib/lfa/client"

const LEAGUES = ["EPL", "EFL챔", "라리가", "세리에A", "분데스리", "프리그1"]
const SEASON_START = "2026-08-01"
const SEASON_END = "2027-08-01"
const STANDINGS_IDS: Readonly<Record<string, string>> = {
  EPL: "epl",
  라리가: "laliga",
  세리에A: "seriea",
  분데스리: "bundesliga",
  프리그1: "ligue1",
  // 현재 네이버 순위 캐시에 EFL챔은 없다. LFA 목록도 없으면 unknown으로 남긴다.
}

const cachedMembers = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    const db = createServiceRoleClient()
    const members = new Map(LEAGUES.map((code) => [code, new Set<string>()]))
    // 오염된 과거/먼 미래 날짜와 다음 시즌 승강 팀은 섞지 않는다.
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await db
        .from("lfa_day_cache")
        .select("date_utc, payload")
        .gte("date_utc", SEASON_START)
        .lt("date_utc", SEASON_END)
        .order("date_utc")
        .range(offset, offset + 99)
      if (error) throw new Error(`lfa-league-members:${error.code}:${error.message}`)
      for (const row of data ?? []) {
        if (!Array.isArray(row.payload)) continue
        for (const match of row.payload as LfaMatch[]) {
          const code = BETMAN_CODE_BY_LFA_ID.get(match?.league?.id)
          const set = code ? members.get(code) : undefined
          if (!set) continue
          for (const team of [match.home, match.away]) {
            if (typeof team?.name === "string" && team.name.trim()) set.add(team.name.trim())
          }
        }
      }
      if ((data?.length ?? 0) < 100) break
    }

    const missing = LEAGUES.filter((code) => !members.get(code)!.size && STANDINGS_IDS[code])
    if (missing.length) {
      const { data: standings, error } = await db
        .from("standings_cache")
        .select("league_id, data")
        .in(
          "league_id",
          missing.map((code) => STANDINGS_IDS[code])
        )
      if (error) throw new Error(`lfa-league-members-standings:${error.code}:${error.message}`)
      if (standings?.length) {
        const names = new Map<string, Set<string>>()
        // 사전은 1,000행을 넘을 수 있으므로 끝까지 읽는다. 충돌 별칭은 확정하지 않는다.
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db
            .from("team_dictionary")
            .select("name_kr, aliases_kr, name_en")
            .neq("status", "rejected")
            .order("soccerway_team_id")
            .range(offset, offset + 999)
          if (error) throw new Error(`lfa-league-members-dictionary:${error.code}:${error.message}`)
          for (const row of data ?? []) {
            const en = typeof row.name_en === "string" ? row.name_en.trim() : ""
            for (const kr of [
              row.name_kr,
              ...(Array.isArray(row.aliases_kr) ? row.aliases_kr : []),
            ]) {
              if (typeof kr !== "string" || !kr.trim()) continue
              const candidates = names.get(kr.trim()) ?? new Set<string>()
              candidates.add(en)
              names.set(kr.trim(), candidates)
            }
          }
          if ((data?.length ?? 0) < 1000) break
        }
        for (const code of missing) {
          const rows = standings.find((row) => row.league_id === STANDINGS_IDS[code])?.data
          if (!Array.isArray(rows) || !rows.length) continue
          const translated = new Set<string>()
          for (const row of rows) {
            const kr = row && typeof row === "object" ? row["팀명"] : undefined
            const candidates = typeof kr === "string" ? names.get(kr.trim()) : undefined
            if (!candidates || candidates.size !== 1 || candidates.has("")) {
              translated.clear()
              break
            }
            translated.add([...candidates][0])
          }
          members.set(code, translated)
        }
      }
    }
    // Data Cache는 JSON으로 저장하므로 Set을 직접 캐시하지 않는다.
    return Object.fromEntries([...members].map(([code, teams]) => [code, [...teams]]))
  },
  ["lfa-league-members", SEASON_START, SEASON_END],
  { revalidate: 300 }
)

export async function getBetmanLeagueMembers(): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const snapshot = await cachedMembers()
  return new Map(Object.entries(snapshot).map(([code, teams]) => [code, new Set(teams)]))
}

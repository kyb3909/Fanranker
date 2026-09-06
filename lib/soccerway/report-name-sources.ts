import "server-only"
import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { loadNotation } from "@/lib/news/notation"
import type { ReportNameRow } from "./report-names"

/** Full notation entries retain aliases; the lineup cache intentionally drops them. */
export async function loadReportNameSources() {
  const db = createServiceRoleClient()
  const notation = await loadNotation(db)
  const squads: ReportNameRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from("team_squads")
      .select("player_slug, name_en, name_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
      .order("soccerway_team_id")
      .order("player_id")
      .range(offset, offset + 499)
    if (error) throw new Error(`report-name-squads:${error.code}`)
    for (const row of data ?? [])
      squads.push({
        romanized: row.name_en,
        preferred_ko: row.name_kr,
        surfaces: [String(row.player_slug).replace(/-/g, " ")],
      })
    if (!data || data.length < 500) break
  }
  return { persons: notation.persons, squads }
}

export const getReportNameSources = unstable_cache(
  loadReportNameSources,
  ["report-name-sources-v1"],
  { revalidate: 3600 }
)

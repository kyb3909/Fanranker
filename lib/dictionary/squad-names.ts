import type { SupabaseClient } from "@supabase/supabase-js"
import type { SquadName } from "@/lib/lfa/player-name"
import type { TeamNameRow } from "@/lib/match/team-name-resolution"
import { readPages } from "./read-pages"

export async function fetchTeamNames(db: SupabaseClient): Promise<TeamNameRow[]> {
  const rows = await readPages((fromPage, toPage) => {
    return db
      .from("team_dictionary")
      .select("soccerway_team_id,name_kr,aliases_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
      .order("soccerway_team_id")
      .range(fromPage, toPage)
  })
  return rows.map((r) => ({
    id: String(r.soccerway_team_id),
    nameKr: String(r.name_kr),
    aliases: Array.isArray(r.aliases_kr) ? r.aliases_kr.map(String) : [],
  }))
}

export async function fetchSquadNames(db: SupabaseClient, teamId: string): Promise<SquadName[]> {
  const rows = await readPages((from, to) =>
    db
      .from("team_squads")
      .select("player_id,name_en,name_kr,source,status")
      .eq("soccerway_team_id", teamId)
      .neq("status", "rejected")
      .order("player_id")
      .range(from, to)
  )
  return rows.map((r) => ({
    playerId: String(r.player_id),
    nameEn: String(r.name_en ?? ""),
    nameKr: r.name_kr ? String(r.name_kr) : null,
    source: String(r.source),
    status: String(r.status),
  }))
}

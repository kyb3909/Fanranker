import { NextResponse } from "next/server"
import { createAnonClient } from "@/lib/supabase/server"

/**
 * GET /api/metaverse/teams?community_slug=<slug>
 * 글쓰기 UI에서 팀 플레어 선택에 쓸 팀 목록.
 * community_slug (football/baseball/basketball/volleyball) ↔ team_map_pins.sport 매핑.
 * 다른 커뮤니티(예: movies/idol)는 해당 없음 → 빈 배열 반환.
 */

const SUPPORTED_SPORTS = new Set(["football", "baseball", "basketball", "volleyball"])

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const communitySlug = searchParams.get("community_slug")?.toLowerCase()

  if (!communitySlug || !SUPPORTED_SPORTS.has(communitySlug)) {
    return NextResponse.json({ teams: [] })
  }

  const supabase = createAnonClient()
  const { data, error } = await supabase
    .from("team_map_pins")
    .select("team_id, team_name, team_short_name, color, league_id")
    .eq("sport", communitySlug)
    .eq("is_active", true)
    .order("team_name", { ascending: true })

  if (error) {
    return NextResponse.json({ teams: [], error: "fetch_failed" }, { status: 500 })
  }

  const teams = (data ?? []).map((t) => ({
    teamId: t.team_id,
    teamName: t.team_name,
    teamShortName: t.team_short_name,
    color: t.color,
    leagueId: t.league_id,
  }))

  return NextResponse.json({ teams })
}

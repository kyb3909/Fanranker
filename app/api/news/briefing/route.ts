import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { verifyCronSecret } from "@/lib/cron-auth"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { selectBackground, type BackgroundRow } from "@/lib/news/briefing"

export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "private, no-store" }
const Query = z.object({
  title: z.string().min(1).max(2000),
  material: z.string().max(5000),
  source_url: z.string().url().max(2000),
  published_at: z.string().datetime({ offset: true }).optional(),
})

/** Authenticated read-only briefing for the VPS scanner; no external API calls. */
export async function POST(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied
  const parsed = Query.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "잘못된 조회" }, { status: 400, headers })
  const now = Date.now()
  const asOf = Math.min(now, Date.parse(parsed.data.published_at ?? "") || now)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from("news_reservoir")
    .select("id, created_at, urls, raw, draft")
    .eq("status", "published")
    .gte("created_at", new Date(asOf - 30 * 86400_000).toISOString())
    .lte("created_at", new Date(now).toISOString())
    .order("created_at", { ascending: false })
    .limit(240)
  if (error) return NextResponse.json({ error: "배경 조회 실패" }, { status: 503, headers })
  return NextResponse.json(
    {
      background: selectBackground(parsed.data, (data ?? []) as BackgroundRow[], now),
      as_of: new Date(asOf).toISOString(),
    },
    { headers }
  )
}

/** Match windows, rather than Reddit popularity, determine which clubs to visit. */
export async function GET(request: NextRequest) {
  const denied = verifyCronSecret(request)
  if (denied) return denied
  const now = Date.now()
  const supabase = createServiceRoleClient()
  const [games, teams] = await Promise.all([
    supabase
      .from("betman_games")
      .select("id, home_team_name, away_team_name, league_code, match_time")
      .eq("sport", "축구")
      .in("game_type", ["일반", "S일반"])
      .gte("match_time", new Date(now - 48 * 3600_000).toISOString())
      .lte("match_time", new Date(now + 48 * 3600_000).toISOString())
      .order("match_time", { ascending: false })
      .limit(240),
    supabase.from("team_dictionary").select("name_en, name_kr, short_kr, aliases_kr"),
  ])
  if (games.error || teams.error) {
    return NextResponse.json({ error: "경기 수집 일정 조회 실패" }, { status: 503, headers })
  }
  const seen = new Set<string>()
  const matches = (games.data ?? [])
    .filter((g) => {
      const key = `${g.home_team_name}|${g.away_team_name}|${g.match_time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((g) => {
      const names = [g.home_team_name, g.away_team_name]
      const aliases = names.flatMap((name) => {
        const team = teams.data?.find((t) =>
          [t.name_kr, t.short_kr, ...(t.aliases_kr ?? [])].includes(name)
        )
        return [
          name,
          ...(team ? [team.name_en, team.name_kr, team.short_kr, ...team.aliases_kr] : []),
        ].filter((s): s is string => Boolean(s))
      })
      return { ...g, aliases: [...new Set(aliases)] }
    })
  return NextResponse.json({ matches, checked_at: new Date(now).toISOString() }, { headers })
}

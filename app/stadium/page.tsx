import { currentUser } from "@clerk/nextjs/server"
import { createAnonClient, createServiceRoleClient } from "@/lib/supabase/server"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
import { MAP_TEAMS, MAP_TEAM_IDS, type StadiumMapRow } from "@/lib/stadium/map-teams"
import { StadiumMap } from "@/components/stadium/stadium-map"
import "./stadium-tokens.css"

export const metadata = {
  title: "경기장 — gongnori.fan",
  description: "활동 점수로 벽돌을 쌓아 우리 팀 경기장을 함께 올립니다",
}

/** 오늘 쌓인 벽돌이 지면의 핵심이라 캐시하지 않는다 */
export const dynamic = "force-dynamic"

function progressPct(level: number, totalPoints: number): number {
  const cur = STADIUM_LEVELS.find((l) => l.level === level)
  const next = STADIUM_LEVELS.find((l) => l.level === level + 1)
  if (!cur || !next) return level >= 10 ? 1 : 0
  const range = next.requiredPoints - cur.requiredPoints
  if (range <= 0) return 1
  return Math.min(1, Math.max(0, (totalPoints - cur.requiredPoints) / range))
}

/** 로그인 유저의 응원 팀 — 활동 점수가 가장 높은 플레어가 가리키는 팀 */
async function myTeam(userId: string): Promise<{ teamId: string | null; budget: number }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("user_flair_scores")
    .select("flair_id, score_total, score_balance")
    .eq("user_id", userId)
    .order("score_total", { ascending: false })
    .limit(12)
  if (!data?.length) return { teamId: null, budget: 0 }

  const { data: flairs } = await supabase
    .from("post_flairs")
    .select("id, team_id")
    .in(
      "id",
      data.map((d) => d.flair_id)
    )
    .not("team_id", "is", null)
  if (!flairs?.length) return { teamId: null, budget: 0 }

  const teamOf = new Map(flairs.map((f) => [f.id, f.team_id]))
  const top = data.find((d) => {
    const t = teamOf.get(d.flair_id)
    return t && MAP_TEAM_IDS.includes(t)
  })
  if (!top) return { teamId: null, budget: 0 }
  return {
    teamId: teamOf.get(top.flair_id) ?? null,
    budget: Math.floor((top.score_balance ?? 0) / BRICK_PRICE),
  }
}

export default async function StadiumPage() {
  const supabase = createAnonClient()

  const [stadiumsRes, todayRes, user] = await Promise.all([
    supabase
      .from("team_stadiums")
      .select("team_id, level, total_points, fan_count")
      .in("team_id", MAP_TEAM_IDS),
    supabase.rpc("stadium_bricks_today"),
    currentUser(),
  ])

  const stadiums = new Map(
    (stadiumsRes.data ?? []).map((s) => [
      s.team_id,
      { level: s.level, total: s.total_points, fans: s.fan_count },
    ])
  )
  const today = new Map(
    ((todayRes.data ?? []) as { team_id: string; bricks: number }[]).map((t) => [
      t.team_id,
      Number(t.bricks),
    ])
  )

  const rows: StadiumMapRow[] = MAP_TEAMS.map((t) => {
    const s = stadiums.get(t.teamId) ?? { level: 1, total: 0, fans: 0 }
    return {
      teamId: t.teamId,
      level: s.level,
      totalPoints: s.total,
      fanCount: s.fans,
      bricks: Math.floor(s.total / BRICK_PRICE),
      todayBricks: today.get(t.teamId) ?? 0,
      pct: progressPct(s.level, s.total),
    }
  })

  const me = user ? await myTeam(user.id) : null

  return (
    <StadiumMap rows={rows} myTeamId={me?.teamId ?? null} myBrickBudget={me ? me.budget : null} />
  )
}

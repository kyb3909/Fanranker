import { notFound } from "next/navigation"
import { createAnonClient } from "@/lib/supabase/server"
import { findMapTeam, MAP_TEAM_IDS } from "@/lib/stadium/map-teams"
import { PLAY_SCENE, buildFraction } from "@/lib/stadium/build-progress-scale"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
import { STADIUM_LEVELS } from "@/lib/constants/stadium-levels"
import { StadiumPlay } from "@/components/stadium/stadium-play"
import "./play.css"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const team = findMapTeam(teamId)
  return {
    title: team ? `${team.stadiumName} — gongnori.fan` : "경기장 — gongnori.fan",
    description: "팬들이 쌓은 벽돌만큼 서 있는 구장에 걸어 들어가 보세요",
  }
}

/**
 * 경기장 입장 — 걸어다니는 3D 구장.
 *
 * 지도(/stadium) → 팀 핀 → 모달 [입장하기] 로 들어온다. 지금 쌓인 벽돌만큼만
 * 서 있는 상태로 열리므로, 완공 전에도 들어가 볼 수 있다 —
 * "건설 중일수록 보여줄 게 많은데 입구를 닫아뒀다"는 평가 지적(R1-P1-7)의 반영.
 */
export default async function StadiumEnterPage({
  params,
}: {
  params: Promise<{ teamId: string }>
}) {
  const { teamId } = await params
  const team = findMapTeam(teamId)
  const scene = PLAY_SCENE[teamId]
  if (!team || !scene || !MAP_TEAM_IDS.includes(teamId)) notFound()

  const supabase = createAnonClient()
  const { data } = await supabase
    .from("team_stadiums")
    .select("level, total_points")
    .eq("team_id", teamId)
    .maybeSingle()

  const level = data?.level ?? 1
  const points = data?.total_points ?? 0
  // ⚠️ 화면에 "벽돌" 이라 쓰는 값은 전부 **경제 단위**여야 한다 (활동 점수 ÷ 단가).
  //    렌더 블록 수를 벽돌이라 부르면 건설 지면과 5~14배 어긋난다 (감리 C2).
  const bricks = Math.floor(points / BRICK_PRICE)
  const cur = STADIUM_LEVELS.find((l) => l.level === level)
  const next = STADIUM_LEVELS.find((l) => l.level === level + 1)
  const nextBricks = next ? Math.max(0, Math.ceil((next.requiredPoints - points) / BRICK_PRICE)) : 0
  const range = next && cur ? next.requiredPoints - cur.requiredPoints : 0
  const levelPct =
    next && cur && range > 0 ? Math.min(1, Math.max(0, (points - cur.requiredPoints) / range)) : 1

  return (
    <StadiumPlay
      teamId={teamId}
      teamName={team.name}
      stadiumName={team.stadiumName}
      scene={scene}
      level={level}
      bricks={bricks}
      nextBricks={nextBricks}
      levelPct={levelPct}
      built={buildFraction(level)}
    />
  )
}

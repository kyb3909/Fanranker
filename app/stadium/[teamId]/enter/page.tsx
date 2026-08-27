import { notFound } from "next/navigation"
import { createAnonClient } from "@/lib/supabase/server"
import { findMapTeam, MAP_TEAM_IDS } from "@/lib/stadium/map-teams"
import { PLAY_SCENE, buildFraction } from "@/lib/stadium/build-progress-scale"
import { BRICK_PRICE } from "@/lib/constants/stadium-bricks"
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
  // 전광판에는 렌더 블록 수가 아니라 **실제 벽돌 수**를 띄운다 — 건설 지면과 같은 단위
  const bricks = Math.floor((data?.total_points ?? 0) / BRICK_PRICE)

  return (
    <StadiumPlay
      teamId={teamId}
      teamName={team.name}
      stadiumName={team.stadiumName}
      scene={scene}
      level={level}
      bricks={bricks}
      built={buildFraction(level)}
    />
  )
}

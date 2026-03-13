import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest } from "@/lib/api-error"

// GET: MBTI별 월드컵 투표 통계
export async function GET(request: NextRequest) {
  try {
    const battleId = request.nextUrl.searchParams.get("battle_id")
    if (!battleId) return apiBadRequest("battle_id는 필수입니다")

    const supabase = createServiceRoleClient()

    // MBTI별 투표 통계
    const { data: stats, error } = await supabase
      .from("worldcup_mbti_stats")
      .select("candidate_id, mbti, vote_count, win_count")
      .eq("battle_id", battleId)
      .order("win_count", { ascending: false })

    if (error) return apiError("MBTI 통계 조회 실패", 500, error)

    // MBTI별 참여자 수
    const { data: participants } = await supabase
      .from("worldcup_mbti_participants")
      .select("mbti, participant_count")
      .eq("battle_id", battleId)

    // 후보자 정보
    const candidateIds = [...new Set((stats ?? []).map((s) => s.candidate_id))]
    const { data: candidates } = await supabase
      .from("worldcup_candidates")
      .select("id, name, image_url")
      .in("id", candidateIds.length > 0 ? candidateIds : ["__none__"])

    const candidateMap = new Map(
      (candidates ?? []).map((c) => [c.id, { name: c.name, image_url: c.image_url }])
    )

    // MBTI별로 그룹핑
    const mbtiGroups: Record<
      string,
      {
        mbti: string
        participant_count: number
        candidates: {
          id: string
          name: string
          image_url: string | null
          vote_count: number
          win_count: number
        }[]
      }
    > = {}

    for (const s of stats ?? []) {
      if (!mbtiGroups[s.mbti]) {
        const pc = (participants ?? []).find((p) => p.mbti === s.mbti)
        mbtiGroups[s.mbti] = {
          mbti: s.mbti,
          participant_count: pc?.participant_count ?? 0,
          candidates: [],
        }
      }
      const c = candidateMap.get(s.candidate_id)
      mbtiGroups[s.mbti].candidates.push({
        id: s.candidate_id,
        name: c?.name ?? "?",
        image_url: c?.image_url ?? null,
        vote_count: s.vote_count,
        win_count: s.win_count,
      })
    }

    // 참여자 수 기준 정렬, 각 MBTI 내에서 win_count 정렬
    const result = Object.values(mbtiGroups)
      .sort((a, b) => b.participant_count - a.participant_count)
      .map((group) => ({
        ...group,
        candidates: group.candidates.sort((a, b) => b.win_count - a.win_count),
      }))

    return NextResponse.json({ mbti_stats: result })
  } catch (error) {
    return apiError("MBTI 통계 조회 실패", 500, error)
  }
}

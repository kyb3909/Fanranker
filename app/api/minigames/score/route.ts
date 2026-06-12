import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const Body = z.object({
  game: z.enum(["corner-hero", "pass-survivor", "rondo"]),
  score: z.number().int().min(0).max(1_000_000),
})

/**
 * POST /api/minigames/score
 * { game, score }
 *
 * 미니게임 종료 시 점수 기록 (로그인 유저만). 게임 iframe 의 postMessage 를 받은
 * 부모 페이지가 호출. 오늘의 순위는 get_minigame_daily_leaderboard RPC 가
 * 유저별 최고점으로 집계하므로 시도마다 insert 해도 됨.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청입니다.")
    }
    const parsed = Body.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 입력입니다.")
    }

    const supabase = createServiceRoleClient()
    const { error } = await supabase.from("minigame_scores").insert({
      user_id: user.id,
      game: parsed.data.game,
      score: parsed.data.score,
    })

    if (error) {
      console.error("[minigames/score] insert failed:", error)
      return apiError("점수 저장에 실패했습니다.", 500)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[minigames/score] unexpected:", err)
    return apiError("점수 저장에 실패했습니다.", 500)
  }
}

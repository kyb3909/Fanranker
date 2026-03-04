import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import {
  apiError,
  apiUnauthorized,
  apiBadRequest,
  checkRateLimit,
} from "@/lib/api-error"

// 보상 테이블: 골 수 → 골드
const REWARD_TABLE: Record<number, number> = {
  0: 0,
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 50,
}

const kickDetailSchema = z.object({
  kick_number: z.number().int().min(1).max(5),
  aim_x: z.number().min(0).max(1),
  aim_y: z.number().min(0).max(1),
  power: z.number().min(0).max(1),
  is_goal: z.boolean(),
  result: z.enum(["goal", "saved", "over", "weak"]),
})

const playSchema = z.object({
  game_type: z.literal("penalty_kick"),
  kick_details: z.array(kickDetailSchema).length(5),
})

/**
 * POST /api/games/mini/play
 *
 * 미니게임 결과 제출 + 골드 보상
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const body = await request.json()
    const parsed = playSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message || "잘못된 요청입니다.")
    }

    const { game_type, kick_details } = parsed.data

    // 서버 사이드 골 수 재계산 (클라이언트 변조 방지)
    const goals = kick_details.filter((k) => k.is_goal).length

    // 보상 결정
    const goldRewarded = REWARD_TABLE[goals] ?? 0

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // KST 기준 오늘 날짜
    const now = new Date()
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const today = kstDate.toISOString().slice(0, 10)

    // 플레이 기록 삽입 (UNIQUE 제약으로 중복 차단)
    const { error: insertError } = await supabase
      .from("mini_game_plays")
      .insert({
        user_id: user.id,
        game_type,
        play_date: today,
        goals,
        gold_rewarded: goldRewarded,
        kick_details,
      })

    if (insertError) {
      // 23505 = unique_violation (이미 오늘 플레이함)
      if (insertError.code === "23505") {
        return apiBadRequest("오늘은 이미 플레이했습니다.")
      }
      return apiError("게임 기록 저장에 실패했습니다.", 500, insertError)
    }

    // 골드 보상 지급 (0골이면 스킵)
    let newBalance: number | null = null
    if (goldRewarded > 0) {
      const { data: rewardResult, error: rpcError } = (await supabase
        .rpc("reward_gold", {
          p_user_id: user.id,
          p_amount: goldRewarded,
          p_description: `페널티킥 미니게임 보상 (${goals}골)`,
        })
        .single()) as {
        data: {
          success: boolean
          new_balance?: number
          error_message?: string
        } | null
        error: unknown
      }

      if (rpcError) {
        console.error("reward_gold RPC error:", rpcError)
        // 기록은 이미 저장됨 — 보상만 실패. 로그만 남김.
      } else if (rewardResult?.success) {
        newBalance = rewardResult.new_balance ?? null
      }
    }

    return NextResponse.json({
      success: true,
      goals,
      gold_rewarded: goldRewarded,
      new_balance: newBalance,
    })
  } catch (error) {
    return apiError("게임 처리 중 오류가 발생했습니다.", 500, error)
  }
}

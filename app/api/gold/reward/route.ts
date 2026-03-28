import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

// 허용된 보상 타입과 최대 금액
const ALLOWED_REWARD_TYPES: Record<string, { maxAmount: number; maxPerUser: number }> = {
  onboarding_reward: { maxAmount: 100, maxPerUser: 2 },
  mini_game_reward: { maxAmount: 500, maxPerUser: 50 },
  daily_check_in: { maxAmount: 50, maxPerUser: 1 },
}

const rewardSchema = z.object({
  amount: z.number().int().positive().max(500),
  description: z.string().max(100),
  transaction_type: z.enum(Object.keys(ALLOWED_REWARD_TYPES) as [string, ...string[]]),
})

/**
 * POST /api/gold/reward
 *
 * Self-service gold reward for verified actions (onboarding, etc.)
 * Includes idempotency check to prevent double rewards.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
    }

    const parsed = rewardSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message }, { status: 400 })
    }

    const { amount, description, transaction_type } = parsed.data
    const userId = user.id

    // 보상 타입별 최대 금액 검증
    const typeConfig = ALLOWED_REWARD_TYPES[transaction_type]
    if (amount > typeConfig.maxAmount) {
      return NextResponse.json(
        { error: `이 보상 타입의 최대 금액은 ${typeConfig.maxAmount}입니다.` },
        { status: 400 }
      )
    }

    const supabase = createServiceRoleClient()

    // 유저별 보상 횟수 제한 체크
    const { count } = await supabase
      .from("gold_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("transaction_type", transaction_type)

    if ((count ?? 0) >= typeConfig.maxPerUser) {
      return NextResponse.json({ success: true, already_rewarded: true })
    }

    // Idempotency: check if this exact reward was already given
    const { data: existing } = await supabase
      .from("gold_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("description", description)
      .eq("transaction_type", transaction_type)
      .limit(1)
      .single()

    if (existing) {
      return NextResponse.json({ success: true, already_rewarded: true })
    }

    // Call reward_gold RPC
    const { data, error } = await supabase.rpc("reward_gold", {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
      p_transaction_type: transaction_type,
    })

    if (error) {
      console.error("reward_gold RPC error:", error)
      return NextResponse.json({ error: "보상 지급 중 오류가 발생했습니다." }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Gold reward error:", error)
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { z } from "zod"

const rewardSchema = z.object({
  amount: z.number().int().positive().max(10000),
  description: z.string().max(100),
  transaction_type: z.string().max(50).default("onboarding_reward"),
})

/**
 * POST /api/gold/reward
 *
 * Self-service gold reward for verified actions (onboarding, etc.)
 * Includes idempotency check to prevent double rewards.
 */
export async function POST(request: NextRequest) {
  try {
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

    const supabase = createServiceRoleClient()

    // Idempotency: check if this reward was already given
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

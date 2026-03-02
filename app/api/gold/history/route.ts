import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/gold/history
 *
 * 현재 유저의 골드 거래 내역 조회
 */
export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from("gold_transactions")
      .select("id, transaction_type, amount, balance_after, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      return apiError("골드 내역을 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    const transactions = (data || []).map((tx) => ({
      id: tx.id,
      type: tx.amount >= 0 ? "earn" : "spend",
      transactionType: tx.transaction_type,
      amount: tx.amount,
      balanceAfter: tx.balance_after,
      description: tx.description || tx.transaction_type,
      createdAt: tx.created_at,
    }))

    return NextResponse.json({ transactions })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

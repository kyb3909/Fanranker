import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

const MAX_GRANT = 10000
const MAX_DEDUCT = -1000

const AdjustEconomySchema = z.object({
  type: z.enum(["token", "gold"]),
  amount: z.number()
    .max(MAX_GRANT, `1회 최대 지급 금액은 ${MAX_GRANT}입니다.`)
    .min(MAX_DEDUCT, `1회 최대 차감 금액은 ${Math.abs(MAX_DEDUCT)}입니다.`),
  reason: z.string().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth
    const { userId } = await params

    const body = await request.json()
    const parsed = AdjustEconomySchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("type(token|gold), amount, reason이 필요합니다.")
    const { type, amount, reason } = parsed.data

    if (type === "token") {
      const { data: current } = await supabase
        .from("user_tokens")
        .select("token_balance")
        .eq("user_id", userId)
        .maybeSingle()

      if (current) {
        const { error: updateErr } = await supabase
          .from("user_tokens")
          .update({
            token_balance: current.token_balance + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
        if (updateErr)
          return NextResponse.json({ error: "토큰 잔액 업데이트 실패" }, { status: 500 })
      } else {
        const { error: insertErr } = await supabase
          .from("user_tokens")
          .insert({
            user_id: userId,
            token_balance: Math.max(0, amount),
            total_tokens_earned: Math.max(0, amount),
          })
        if (insertErr) return NextResponse.json({ error: "토큰 레코드 생성 실패" }, { status: 500 })
      }

      const { error: txErr } = await supabase.from("token_transactions").insert({
        user_id: userId,
        amount,
        type: amount > 0 ? "admin_grant" : "admin_deduct",
        description: reason,
      })
      if (txErr) return NextResponse.json({ error: "토큰 거래 기록 실패" }, { status: 500 })
    } else if (type === "gold") {
      const { data: current } = await supabase
        .from("user_gold")
        .select("gold_balance")
        .eq("user_id", userId)
        .maybeSingle()

      if (current) {
        const { error: updateErr } = await supabase
          .from("user_gold")
          .update({
            gold_balance: current.gold_balance + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
        if (updateErr)
          return NextResponse.json({ error: "골드 잔액 업데이트 실패" }, { status: 500 })
      } else {
        const { error: insertErr } = await supabase
          .from("user_gold")
          .insert({ user_id: userId, gold_balance: Math.max(0, amount) })
        if (insertErr) return NextResponse.json({ error: "골드 레코드 생성 실패" }, { status: 500 })
      }

      const { error: txErr } = await supabase.from("gold_transactions").insert({
        user_id: userId,
        amount,
        type: amount > 0 ? "admin_grant" : "admin_deduct",
        description: reason,
      })
      if (txErr) return NextResponse.json({ error: "골드 거래 기록 실패" }, { status: 500 })
    }

    await writeAuditLog({
      adminUserId: adminId,
      action: `adjust_${type}`,
      targetType: "user",
      targetId: userId,
      details: { type, amount, reason },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

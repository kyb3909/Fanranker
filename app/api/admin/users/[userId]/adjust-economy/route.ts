import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

const MAX_GRANT = 100000
const MAX_DEDUCT = -100000

const AdjustEconomySchema = z.object({
  type: z.enum(["token", "gold"]),
  amount: z
    .number({ invalid_type_error: "amount는 숫자여야 합니다." })
    .max(MAX_GRANT, `1회 최대 지급 금액은 ${MAX_GRANT.toLocaleString()}입니다.`)
    .min(MAX_DEDUCT, `1회 최대 차감 금액은 ${Math.abs(MAX_DEDUCT).toLocaleString()}입니다.`),
  reason: z.string().min(1, "사유를 입력해주세요."),
  idempotency_key: z.string().uuid("멱등성 키는 UUID여야 합니다."),
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

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = AdjustEconomySchema.safeParse(body)
    if (!parsed.success) {
      const firstIssue =
        parsed.error.issues[0]?.message || "type(token|gold), amount, reason이 필요합니다."
      return apiBadRequest(firstIssue)
    }
    const { type, amount, reason, idempotency_key } = parsed.data

    // Idempotency check
    const txTable = type === "token" ? "token_transactions" : "gold_transactions"
    const { data: existingTx } = await supabase
      .from(txTable)
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotency_key)
      .single()

    if (existingTx) {
      return NextResponse.json({ success: true, duplicate: true })
    }

    if (type === "token") {
      const { data: current } = await supabase
        .from("user_tokens")
        .select("token_balance")
        .eq("user_id", userId)
        .maybeSingle()

      // 잔액은 0 아래로 내려가지 않는다. 예전엔 여기만 클램프가 없어서
      // 거래기록(balance_after)은 0, 실제 잔액은 음수로 갈려 장부가 어긋났다.
      const newBalance = Math.max(0, (current?.token_balance ?? 0) + amount)

      if (current) {
        const { error: updateErr } = await supabase
          .from("user_tokens")
          .update({
            token_balance: newBalance,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId)
        if (updateErr)
          return NextResponse.json({ error: "토큰 잔액 업데이트 실패" }, { status: 500 })
      } else {
        const { error: insertErr } = await supabase.from("user_tokens").insert({
          user_id: userId,
          token_balance: Math.max(0, amount),
          total_tokens_earned: Math.max(0, amount),
        })
        if (insertErr) return NextResponse.json({ error: "토큰 레코드 생성 실패" }, { status: 500 })
      }

      const { error: txErr } = await supabase.from("token_transactions").insert({
        user_id: userId,
        amount,
        transaction_type: "admin_adjustment",
        balance_after: newBalance,
        description: reason,
        idempotency_key,
      })
      if (txErr) return NextResponse.json({ error: "토큰 거래 기록 실패" }, { status: 500 })
    } else if (type === "gold") {
      const { data: current } = await supabase
        .from("user_gold")
        .select("gold_balance")
        .eq("user_id", userId)
        .maybeSingle()

      // 볼과 동일 — 음수 잔액 금지 (장부 balance_after 와 일치)
      const newBalance = Math.max(0, (current?.gold_balance ?? 0) + amount)

      if (current) {
        const { error: updateErr } = await supabase
          .from("user_gold")
          .update({
            gold_balance: newBalance,
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
        transaction_type: "admin_adjustment",
        balance_after: newBalance,
        description: reason,
        idempotency_key,
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

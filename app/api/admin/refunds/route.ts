import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  refundId: z.string().min(1, "refundId가 필요합니다."),
  action: z.enum(["retry", "resolve"], { message: "잘못된 action입니다." }),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "pending"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "30")
    const offset = (page - 1) * limit

    let query = supabase.from("pending_refunds").select("*", { count: "exact" })
    if (status !== "all") query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const refunds = data ?? []
    const userIds = Array.from(new Set(refunds.map((r) => r.user_id).filter(Boolean)))
    const nicknameByUserId: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nickname")
        .in("user_id", userIds)
      for (const p of profiles ?? []) {
        if (p.nickname) nicknameByUserId[p.user_id] = p.nickname
      }
    }

    const enriched = refunds.map((r) => ({
      ...r,
      nickname: nicknameByUserId[r.user_id] ?? null,
    }))

    return NextResponse.json({ refunds: enriched, total: count ?? 0, page, limit })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { refundId, action } = parsed.data

    const { data: refund } = await supabase
      .from("pending_refunds")
      .select("*")
      .eq("id", refundId)
      .single()

    if (!refund) {
      return NextResponse.json({ error: "환불 항목을 찾을 수 없습니다." }, { status: 404 })
    }
    if (refund.status !== "pending") {
      return apiBadRequest("이미 처리된 항목입니다.")
    }

    const nowIso = new Date().toISOString()

    if (action === "retry") {
      // ⚠️ 이 분기는 refund_tokens(볼)만 호출한다. 골드 부채를 여기로 흘리면
      //    통화가 뒤바뀐 지급이 된다 — 지금보다 나쁜 상태다. fail-closed 로 거부한다.
      //    골드 자동 지급 경로(reward_gold)는 이 라우트에 테스트를 깐 뒤에 추가할 것.
      //    그전까지 골드 건은 어드민이 수동 지급 후 action="resolve" 로 닫는다.
      if (refund.currency && refund.currency !== "token") {
        return apiBadRequest(
          `${refund.currency} 환불은 자동 재시도를 지원하지 않습니다. 수동 지급 후 '처리 완료'로 닫아주세요.`
        )
      }

      // 토큰 환불 RPC 재시도
      const { error: rpcError } = await supabase.rpc("refund_tokens", {
        p_user_id: refund.user_id,
        p_amount: refund.amount,
        p_description: refund.description ?? "관리자 환불 재시도",
      })

      if (rpcError) {
        // 재시도 실패 — attempts 증가 + 에러 기록, status 는 pending 유지
        await supabase
          .from("pending_refunds")
          .update({
            attempts: (refund.attempts ?? 0) + 1,
            last_error: rpcError.message ?? "재시도 실패",
          })
          .eq("id", refundId)
        return NextResponse.json(
          { error: `환불 재시도 실패: ${rpcError.message ?? "알 수 없는 오류"}` },
          { status: 500 }
        )
      }

      await supabase
        .from("pending_refunds")
        .update({ status: "resolved", resolved_at: nowIso })
        .eq("id", refundId)
    } else {
      // resolve — 어드민이 다른 경로로 처리 완료 표시
      await supabase
        .from("pending_refunds")
        .update({ status: "resolved", resolved_at: nowIso })
        .eq("id", refundId)
    }

    await writeAuditLog({
      adminUserId: userId,
      action: `refund_${action}`,
      targetType: "pending_refund",
      targetId: refundId,
      details: { action, userId: refund.user_id, amount: refund.amount },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

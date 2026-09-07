import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

export const dynamic = "force-dynamic"

const patchSchema = z.object({
  refundId: z.string().min(1, "refundId가 필요합니다."),
  action: z.enum(["retry", "resolve"], { message: "잘못된 action입니다." }),
  /**
   * resolve 전용 — "실제로 지급했다"는 확인.
   *
   * resolve 는 돈을 1원도 움직이지 않고 큐에서만 지운다. 특히 골드 건은
   * "수동 지급 → resolve" 2단계인데, 지급을 잊고 resolve 만 누르면 유저 돈이
   * 증발하고 큐에서도 사라져 추적 수단이 없어진다. 그래서 명시적 확인을 강제한다.
   */
  paidConfirmed: z.boolean().optional(),
  /**
   * 어떻게 지급했는지. **서버가 요구한다** — 종전에는 선택값이었고 클라이언트가
   * `paidConfirmed: true` 를 항상 붙여 보내서, 실질 게이트가 브라우저 프롬프트 하나였다.
   * 지급 증빙을 대사하지는 못하지만, 최소한 무엇을 했는지 남기지 않고는 큐를 못 닫는다.
   */
  resolveNote: z.string().max(300).optional(),
  /** 낙관적 잠금 — 화면이 본 시도 횟수. 다르면 다른 실행이 이미 진행 중이다 */
  expectedAttempts: z.number().int().min(0).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || "pending"
    // page 에 클램프가 없어 `?page=abc` 가 NaN 으로 range() 까지 흘러갔다
    const rawPage = Number.parseInt(searchParams.get("page") || "1", 10)
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
    const limit = parseLimit(searchParams, { def: 30, max: 100 })
    const offset = (page - 1) * limit
    // 가장 오래 기다린 미지급부터 — 최신 30건만 보이던 구조에서 오래된 의무에 도달하는 길
    const oldestFirst = searchParams.get("sort") === "oldest"

    let query = supabase.from("pending_refunds").select("*", { count: "exact" })
    if (status !== "all") query = query.eq("status", status)

    const { data, count, error } = await query
      .order("created_at", { ascending: oldestFirst })
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

    return NextResponse.json({
      refunds: enriched,
      total: count ?? 0,
      page,
      limit,
      sort: oldestFirst ? "oldest" : "newest",
    })
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
    const { refundId, action, paidConfirmed, resolveNote, expectedAttempts } = parsed.data

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
          `${refund.currency} 환불은 자동 재시도를 지원하지 않습니다. 수동 지급 후 '지급 완료로 기록'으로 닫아주세요.`
        )
      }

      /**
       * ⚠️ 동시 실행 잠금 (낙관적 잠금).
       *
       * 종전에는 `상태 확인 → RPC 호출 → 상태 갱신` 사이에 아무 잠금이 없어, 두 사람이
       * 동시에 누르거나 응답이 유실돼 다시 누르면 **환불 RPC 가 두 번** 돌 수 있었다.
       * 여기서 attempts 를 조건에 걸어 한 번만 통과시킨다.
       *
       * ⚠️ 이것으로 지급 경로가 안전해졌다고 말할 수 없다. RPC 성공 뒤 상태 갱신 전에
       *    프로세스가 죽으면 행은 pending 으로 남아 다음 재시도가 다시 지급할 수 있다.
       *    원장 대사와 결과 확인은 별도 작업이다.
       */
      const currentAttempts = (refund.attempts as number | null) ?? 0
      if (expectedAttempts !== undefined && expectedAttempts !== currentAttempts) {
        return NextResponse.json(
          {
            error: "다른 곳에서 이미 재시도가 진행됐습니다. 목록을 새로고침한 뒤 확인하세요.",
            staleView: true,
          },
          { status: 409 }
        )
      }
      const { data: claimed, error: claimError } = await supabase
        .from("pending_refunds")
        .update({ attempts: currentAttempts + 1 })
        .eq("id", refundId)
        .eq("status", "pending")
        .eq("attempts", currentAttempts)
        .select("id")
      if (claimError) return apiError("재시도를 시작하지 못했습니다.", 500, claimError)
      if (!claimed || claimed.length === 0) {
        return NextResponse.json(
          {
            error: "이미 다른 실행이 이 환불을 처리하고 있습니다. 다시 실행하지 않았습니다.",
            alreadyRunning: true,
          },
          { status: 409 }
        )
      }

      // 토큰 환불 RPC 재시도
      const { error: rpcError } = await supabase.rpc("refund_tokens", {
        p_user_id: refund.user_id,
        p_amount: refund.amount,
        p_description: refund.description ?? "관리자 환불 재시도",
      })

      if (rpcError) {
        // 재시도 실패 — 오류를 남기고 status 는 pending 유지 (attempts 는 잠금에서 이미 증가)
        await supabase
          .from("pending_refunds")
          .update({ last_error: rpcError.message ?? "재시도 실패" })
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
      // resolve — 돈을 옮기지 않는다. **큐에서 지우는 기록**일 뿐이다.
      // 지급을 잊고 닫으면 유저 돈이 증발하고 추적 수단도 사라지므로 확인과 사유를 함께 요구한다.
      if (!paidConfirmed) {
        return NextResponse.json(
          {
            error:
              "실제 지급을 완료했는지 확인이 필요합니다. 이 동작은 큐에서만 지울 뿐 돈을 지급하지 않습니다.",
            requiresConfirmation: true,
          },
          { status: 400 }
        )
      }
      // 클라이언트가 붙이는 paidConfirmed 만으로는 게이트가 아니다 — 무엇을 했는지 서버가 요구한다
      if (!resolveNote || resolveNote.trim().length < 4) {
        return NextResponse.json(
          {
            error: "어떻게 지급했는지 적어야 큐를 닫을 수 있습니다. (예: 경제조정으로 수동 지급)",
            requiresNote: true,
          },
          { status: 400 }
        )
      }
      // 상태를 조건에 걸어 한 번만 닫는다 — 이미 닫힌 건을 다시 닫지 않는다
      const { data: closed, error: closeError } = await supabase
        .from("pending_refunds")
        .update({ status: "resolved", resolved_at: nowIso })
        .eq("id", refundId)
        .eq("status", "pending")
        .select("id")
      if (closeError) return apiError("큐를 닫지 못했습니다.", 500, closeError)
      if (!closed || closed.length === 0) {
        return NextResponse.json(
          { error: "이미 처리된 항목입니다. 다시 실행하지 않았습니다.", alreadyHandled: true },
          { status: 409 }
        )
      }
    }

    await writeAuditLog({
      adminUserId: userId,
      action: `refund_${action}`,
      targetType: "pending_refund",
      targetId: refundId,
      details: {
        action,
        userId: refund.user_id,
        amount: refund.amount,
        currency: refund.currency,
        paidConfirmed: paidConfirmed ?? null,
        resolveNote: resolveNote ?? null,
      },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

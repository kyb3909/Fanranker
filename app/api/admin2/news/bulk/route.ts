import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin2/news/bulk — 검수 초안 일괄 반려.
 *
 * 왜 필요한가: 스캐너가 하루 ~47건을 넣는데 검수자는 1명이다. 실측(2026-07-29)에서
 * 143건이 쌓여 있었고 대부분 48시간 뒤 그냥 만료됐다 — 읽히지도 않고 사라진 것이다.
 * 명백히 안 쓸 것을 빠르게 걷어내야 남은 시간을 쓸 만한 기사에 쓸 수 있다.
 *
 * 반려만 일괄로 연다. **발행은 절대 일괄로 열지 않는다** — 발행은 담벼락에 나가는
 * 되돌리기 어려운 행동이고, 한 건씩 눈으로 본 뒤에만 나가야 한다.
 */

const BodySchema = z.object({
  action: z.literal("reject"),
  ids: z.array(z.string().min(1)).min(1).max(200),
})

export async function POST(request: NextRequest) {
  const gate = await requireStaffApi()
  if (gate instanceof NextResponse) return gate
  const { supabase, userId } = gate

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "id 목록이 필요합니다. (최대 200건)" }, { status: 400 })
  }
  const { ids } = parsed.data

  // drafted 인 것만 반려한다 — 이미 발행/반려된 건을 덮어쓰지 않기 위한 가드.
  // 다른 관리자가 동시에 처리했거나 48시간 만료 크론이 먼저 지나갔을 수 있다.
  const { data, error } = await supabase
    .from("news_reservoir")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "drafted")
    .select("id")

  if (error) {
    return NextResponse.json({ error: "일괄 반려 실패", detail: error.message }, { status: 500 })
  }

  const rejected = data?.length ?? 0
  const skipped = ids.length - rejected

  // 감사 로그 — 일괄 조작은 흔적이 남아야 한다 (누가 몇 건을 걷어냈는지)
  try {
    await writeAuditLog({
      adminUserId: userId,
      action: "news_bulk_reject",
      targetType: "news_reservoir",
      // 일괄 조작이라 대상이 하나가 아니다 — 건수를 id 자리에 넣고 상세는 details 로
      targetId: `bulk:${rejected}`,
      details: { requested: ids.length, rejected, skipped, ids: ids.slice(0, 50) },
      ipAddress: getIpFromRequest(request),
    })
  } catch {
    /* 감사 로그 실패가 반려를 되돌리게 하지는 않는다 */
  }

  return NextResponse.json({ ok: true, rejected, skipped })
}

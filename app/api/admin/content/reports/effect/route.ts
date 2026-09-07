import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError, apiBadRequest } from "@/lib/api-error"
import {
  authorTableFor,
  describeResolveEffect,
  describeNonSanctionEffect,
} from "@/lib/admin/report-actions"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/content/reports/effect?reportId=… — **실행하기 전에** 무슨 일이 생기는지.
 *
 * 종전 신고 큐의 체크 아이콘은 이름이 `처리` 뿐이었고, 카드 발급과 누적 정지는 누른 뒤에야
 * 토스트로 알았다. 이 라우트는 아무것도 바꾸지 않고 **지금 서버 상태 기준의 효과**만 계산한다.
 *
 * 조회 시점의 최신 상태를 쓴다 — 화면을 열어둔 사이 다른 카드가 생겼으면 여기 반영된다.
 * (그래도 실행 순간의 최종 판정은 서버가 다시 한다. 미리보기는 약속이 아니라 예고다.)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const reportId = new URL(request.url).searchParams.get("reportId")
    if (!reportId) return apiBadRequest("reportId가 필요합니다.")

    const { data: report, error } = await supabase
      .from("content_reports")
      .select("id, target_type, target_id, reason, status")
      .eq("id", reportId)
      .maybeSingle()
    if (error) return apiError("신고를 조회하지 못했습니다.", 500, error)
    if (!report) return NextResponse.json({ error: "신고를 찾을 수 없습니다." }, { status: 404 })

    // 이미 끝난 신고는 실행 자체가 막힌다 — 미리보기에서도 그렇게 말한다
    const terminal = report.status === "resolved" || report.status === "dismissed"

    const table = authorTableFor(report.target_type)
    let authorId: string | null = null
    if (table) {
      const { data: content } = await supabase
        .from(table)
        .select("user_id")
        .eq("id", report.target_id)
        .maybeSingle()
      authorId = (content?.user_id as string | undefined) ?? null
    }

    const nowIso = new Date().toISOString()
    const [yellowRes, suspensionRes, siblingRes] = await Promise.all([
      authorId
        ? supabase
            .from("user_cards")
            .select("*", { count: "exact", head: true })
            .eq("user_id", authorId)
            .eq("card_type", "yellow")
            .gt("expires_at", nowIso)
        : Promise.resolve({ count: 0, error: null }),
      authorId
        ? supabase
            .from("user_suspensions")
            .select("id")
            .eq("user_id", authorId)
            .or(`suspended_until.is.null,suspended_until.gt.${nowIso}`)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // 같은 콘텐츠에 남아 있는 다른 미처리 신고 — 각각 인정하면 카드가 그만큼 더 나간다
      supabase
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .eq("target_type", report.target_type)
        .eq("target_id", report.target_id)
        .neq("id", report.id)
        .in("status", ["pending", "reviewing"]),
    ])

    const effect = describeResolveEffect({
      reason: report.reason,
      targetResolved: !!authorId,
      activeYellow: yellowRes.count ?? 0,
      hasActiveSuspension: !!suspensionRes.data,
      siblingOpenReports: siblingRes.count ?? 0,
    })

    return NextResponse.json({
      reportId: report.id,
      status: report.status,
      terminal,
      authorId,
      resolve: effect,
      dismiss: describeNonSanctionEffect("dismiss"),
      reviewing: describeNonSanctionEffect("reviewing"),
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

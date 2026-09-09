import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { requireAdminApi } from "@/lib/admin/require-admin-api"
import { listReportWork, resumeReportWork } from "@/lib/soccerway/report-work"
import { refreshReportSource, hasStoredReport } from "@/lib/soccerway/match-extras"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET() {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  try {
    const candidates = (await listReportWork()).filter(
      (w) =>
        w.status === "held" ||
        w.status === "dictionary" ||
        (w.status === "ready" && w.unresolved > 0)
    )
    const rows = []
    for (const w of candidates) {
      // A sibling may already contain the report, e.g. after a store response was lost.
      if (await hasStoredReport(w.game_id)) continue
      rows.push({
        gameId: w.game_id,
        homeTeam: w.context!.homeTeam,
        awayTeam: w.context!.awayTeam,
        state: w.status,
        reason: w.reason,
        missingNames: w.missing_names ?? [],
        since: w.held_at ?? w.updated_at,
        version: w.input_version,
        used: w.used,
        budget: w.budget,
        unresolved: w.unresolved,
      })
    }
    return NextResponse.json({ rows })
  } catch (error) {
    return apiError("리포트 보류 목록을 불러오지 못했습니다.", 503, error)
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resume"),
    gameId: z.string().min(1).max(100),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("refresh"), gameId: z.string().min(1).max(100) }),
])

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (auth instanceof NextResponse) return auth
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: "경기와 재개 사유(3~500자)를 확인하세요." }, { status: 400 })
  try {
    const body = parsed.data
    if (body.action === "resume") {
      if (await hasStoredReport(body.gameId))
        return NextResponse.json({ error: "이미 리포트가 저장된 경기입니다." }, { status: 409 })
      await resumeReportWork(body.gameId, body.version, body.reason, auth.userId)
      // The RPC durably queues the explicit request, including requests after seven days.
      // A lost HTTP response or interrupted cron must not discard the remaining grant.
      return NextResponse.json({
        message: "작성 예산 3회를 추가했습니다. 다음 회차에 사전·검증 규칙을 적용해 재개합니다.",
      })
    }
    const changed = await refreshReportSource(body.gameId)
    return NextResponse.json({
      message: changed
        ? "원문이 변경됐습니다. 종료 확인 후 7일 이내는 자동 재검사하며, 이후에는 ‘재개’를 눌러주세요."
        : "원문 내용이 같습니다. 기존 예산을 유지합니다.",
    })
  } catch (error) {
    return apiError("처리하지 못했습니다. 목록을 새로고침한 뒤 다시 시도하세요.", 409, error)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"
import { checkRateLimit } from "@/lib/api-error"

const REASONS = new Set([
  "spam", // 도배/광고
  "abuse", // 욕설/비방
  "hate", // 혐오 발언
  "sexual", // 성적 내용
  "harassment", // 희롱/괴롭힘
  "impersonation", // 사칭
  "other", // 기타
])
const SCOPES = new Set(["world", "room", "local", "other"])

/**
 * POST /api/metaverse/reports
 * body: {
 *   reportedUserId: string
 *   reason: enum (도배/욕설/혐오/성적/희롱/사칭/기타)
 *   note?: string (최대 500자)
 *   contextScope?: "world" | "room" | "local" | "other"
 *   contextRoomId?: uuid
 * }
 *
 * 중복 신고 방지: 같은 (reporter, reported) 쌍 24시간 이내 1건만 (DB 인덱스).
 * 본인 신고 방지: CHECK 제약.
 * rate limit STRICT (스팸 방지).
 */
export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, "STRICT")
  if (limited) return limited

  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: {
    reportedUserId?: unknown
    reason?: unknown
    note?: unknown
    contextScope?: unknown
    contextRoomId?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const reportedUserId = typeof body.reportedUserId === "string" ? body.reportedUserId : ""
  const reason = typeof body.reason === "string" ? body.reason : ""
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null
  const scope = typeof body.contextScope === "string" ? body.contextScope : null
  const roomId = typeof body.contextRoomId === "string" ? body.contextRoomId : null

  if (!reportedUserId) {
    return NextResponse.json({ error: "reported_user_id_required" }, { status: 400 })
  }
  if (reportedUserId === me.userId) {
    return NextResponse.json({ error: "cannot_report_self" }, { status: 400 })
  }
  if (!REASONS.has(reason)) {
    return NextResponse.json({ error: "invalid_reason" }, { status: 400 })
  }
  if (scope && !SCOPES.has(scope)) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from("metaverse_user_reports")
    .insert({
      reporter_user_id: me.userId,
      reported_user_id: reportedUserId,
      reason,
      note: note || null,
      context_scope: scope || null,
      context_room_id: roomId || null,
    })
    .select("id")
    .single()

  if (error) {
    // unique violation → 같은 쌍 오늘 이미 신고함
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate_today" }, { status: 409 })
    }
    console.error("[metaverse] report insert failed", error)
    return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, reportId: data.id })
}

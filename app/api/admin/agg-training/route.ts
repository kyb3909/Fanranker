import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/supabase/admin"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/agg-training — 관리자 전용 (admin layout + requireAdmin 이중 보호).
 * 페르소나 글 학습 라운드 검수 (F15). 발행과 무관 — posts 안 건드림.
 * body: { id, action: "pass" | "correct" | "reject", title?, body?, reason? }
 *  - pass    : 그대로 좋음 (학습 안 함, 통과)
 *  - correct : 교정본 저장 → 로컬 learn 이 few-shot 교정쌍으로 회수
 *  - reject  : 소재 부적합 → learn 이 "이런 건 쓰지 말라" 신호로 회수
 */
const BodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["pass", "correct", "reject"]),
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(4000).optional(),
  reason: z.string().max(300).optional(),
})

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "id/action 필요" }, { status: 400 })
  const { id, action, title, body: fixBody, reason } = parsed.data

  const supabase = createServiceRoleClient()
  const { data: entry } = await supabase
    .from("agg_training_entries")
    .select("id, status, ai_title, ai_body")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; ai_title: string; ai_body: string }>()
  if (!entry) return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 })
  if (entry.status !== "pending") {
    return NextResponse.json(
      { error: `이미 처리된 항목입니다 (status=${entry.status}).` },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()

  if (action === "reject") {
    await supabase
      .from("agg_training_entries")
      .update({ status: "rejected", reject_reason: reason?.trim() || null, reviewed_at: now })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  if (action === "correct") {
    const fixTitle = title?.trim()
    const fixBodyTrim = fixBody?.trim()
    if (!fixTitle || !fixBodyTrim) {
      return NextResponse.json({ error: "교정 제목/본문이 필요합니다." }, { status: 400 })
    }
    // AI 초안과 동일하면 교정이 아니라 통과 — 학습 노이즈 방지
    if (fixTitle === entry.ai_title.trim() && fixBodyTrim === entry.ai_body.trim()) {
      await supabase
        .from("agg_training_entries")
        .update({ status: "passed", reviewed_at: now })
        .eq("id", id)
      return NextResponse.json({ ok: true, status: "passed" })
    }
    await supabase
      .from("agg_training_entries")
      .update({ status: "corrected", fix_title: fixTitle, fix_body: fixBodyTrim, reviewed_at: now })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: "corrected" })
  }

  // pass
  await supabase
    .from("agg_training_entries")
    .update({ status: "passed", reviewed_at: now })
    .eq("id", id)
  return NextResponse.json({ ok: true, status: "passed" })
}

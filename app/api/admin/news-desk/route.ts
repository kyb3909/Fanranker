import { after, NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import {
  loadDesk,
  reserveDeskDraft,
  generateDeskDraft,
  learnDeskRevision,
} from "@/lib/news/desk/service"
import { ArticleSchema } from "@/lib/news/desk/types"

export const dynamic = "force-dynamic"
export const maxDuration = 300
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({
    action: z.literal("save"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
    draft: ArticleSchema,
    reason: z.string().trim().max(2000).default(""),
    status: z.enum(["drafted", "reviewed", "rejected"]),
  }),
  z.object({
    action: z.literal("settings"),
    enabled: z.boolean(),
    pending_target: z.number().int().min(1).max(20),
    daily_limit: z.number().int().min(1).max(48),
  }),
  z.object({
    action: z.literal("lesson"),
    id: z.string().uuid(),
    active: z.boolean(),
    explanation: z.string().trim().min(1).max(2000),
    instruction: z.string().trim().min(5).max(1000),
    expected: z.string().datetime({ offset: true }),
  }),
  z.object({ action: z.literal("retry_learning"), id: z.string().uuid() }),
])
export async function GET(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  try {
    const item = req.nextUrl.searchParams.get("item")
    if (item && !z.string().uuid().safeParse(item).success)
      return json({ error: "기사 식별자를 확인해 주세요." }, 400)
    return json(await loadDesk(auth.supabase, auth.role === "admin", item ?? undefined))
  } catch {
    return json({ error: "데스킹 자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503)
  }
}
export async function POST(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > 32000) return json({ error: "요청 내용이 너무 깁니다." }, 413)
    body = JSON.parse(text)
  } catch {
    return json({ error: "올바른 요청 본문이 필요합니다." }, 400)
  }
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success)
    return json(
      {
        error:
          "입력 내용을 확인해 주세요. 제목 2~300자, 본문 20~8,000자, 수정 이유 2,000자 이내입니다.",
      },
      400
    )
  const data = parsed.data,
    db = auth.supabase
  if ((data.action === "settings" || data.action === "generate") && auth.role !== "admin")
    return json({ error: "자동 작성 설정과 추가 생성은 관리자만 실행할 수 있습니다." }, 403)
  try {
    if (data.action === "generate") {
      const reservation = await reserveDeskDraft(db, true)
      if (reservation.id)
        after(async () => {
          await generateDeskDraft(db, reservation)
        })
      return json(reservation, reservation.id ? 202 : 200)
    }
    if (data.action === "settings") {
      const { error } = await db
        .from("news_desk_settings")
        .update({
          enabled: data.enabled,
          pending_target: data.pending_target,
          daily_limit: data.daily_limit,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
      if (error) throw error
      return json({ ok: true })
    }
    if (data.action === "lesson") {
      const stamp = new Date().toISOString()
      const { data: updated, error } = await db
        .from("news_desk_lessons")
        .update({
          active: data.active,
          explanation: data.explanation,
          instruction: data.instruction,
          review_status: "reviewed",
          updated_at: stamp,
        })
        .eq("id", data.id)
        .eq("updated_at", data.expected)
        .select("id")
        .maybeSingle()
      if (error) throw error
      return updated
        ? json({ ok: true, updated_at: stamp })
        : json(
            { error: "다른 창에서 해석을 변경했습니다. 입력을 보관하고 새로 불러와 주세요." },
            409
          )
    }
    if (data.action === "retry_learning") {
      const { data: updated, error } = await db
        .from("news_desk_revisions")
        .update({ next_attempt_at: new Date().toISOString() })
        .eq("id", data.id)
        .eq("learning_state", "failed")
        .lt("learning_attempts", 3)
        .select("id")
        .maybeSingle()
      if (error) throw error
      if (!updated) return json({ error: "재시도할 수 있는 학습 항목이 없습니다." }, 409)
      after(async () => {
        await learnDeskRevision(db, data.id)
      })
      return json({ ok: true }, 202)
    }
    const { data: saved, error } = await db.rpc("save_news_desk_article", {
      p_id: data.id,
      p_expected_version: data.version,
      p_title: data.draft.title,
      p_article: data.draft.article,
      p_reason: data.reason,
      p_editor: auth.userId,
      p_status: data.status,
    })
    if (error) {
      if (error.code === "40001")
        return json(
          {
            error:
              "다른 창에서 먼저 수정했습니다. 작성 내용은 유지됩니다. 새로 불러온 기사와 비교한 뒤 다시 저장해 주세요.",
          },
          409
        )
      if (error.code === "P0002") return json({ error: "기사를 찾을 수 없습니다." }, 404)
      throw error
    }
    if (saved.changed && saved.revision_id)
      after(async () => {
        await learnDeskRevision(db, saved.revision_id)
      })
    return json(saved)
  } catch {
    return json(
      { error: "요청을 완료하지 못했습니다. 편집 내용을 복사해 보관한 뒤 다시 시도해 주세요." },
      503
    )
  }
}

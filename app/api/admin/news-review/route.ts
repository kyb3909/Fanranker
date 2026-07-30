import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/admin/roles"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { publishNewsDraft, type NewsReservoirItem } from "@/lib/news/publish"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/news-review  — admin·editor 허용 (레이아웃 + requireStaff 이중 보호). 검수는 editor 의 본업이다.
 * body: { id, action: "publish" | "reject" | "save", title?, content? }
 *  - publish: news_reservoir(drafted) → posts 발행(공놀이봇) + reservoir status=published
 *  - save   : 검수 중 수정본을 draft 에 저장 (발행 안 함)
 *  - reject : reservoir status=rejected (발행 안 함)
 *  - title/content 가 오면(검수 편집) 그 수정본으로 저장/발행한다.
 */
const BodySchema = z.object({
  id: z.string().min(1),
  action: z.enum(["publish", "reject", "save"]),
  title: z.string().min(1).max(300).optional(),
  content: z.unknown().optional(),
  // 말머리(다중): 미전달(undefined)이면 제목 기반 자동 추천, 배열이면 그대로(빈 배열=없음)
  flair_ids: z.array(z.string().uuid()).optional(),
  // VS 쟁점 결정 — enabled 미전달이면 confidence 기본값(0.7↑ 켜짐)을 따른다
  vs: z
    .object({
      enabled: z.boolean().optional(),
      question: z.string().min(1).max(80).optional(),
      optionA: z.string().min(1).max(24).optional(),
      optionB: z.string().min(1).max(24).optional(),
    })
    .optional(),
})

type DraftReservoirRow = NewsReservoirItem & { status: string }

export async function POST(req: NextRequest) {
  try {
    await requireStaff()
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
  const { id, action, title: editTitle, content: editContent } = parsed.data

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data: item } = await supabase
    .from("news_reservoir")
    .select("id, status, urls, draft, entities, tags")
    .eq("id", id)
    .maybeSingle<DraftReservoirRow>()
  if (!item) return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 })
  if (item.status !== "drafted") {
    return NextResponse.json(
      { error: `이미 처리된 초안입니다 (status=${item.status}).` },
      { status: 409 }
    )
  }

  if (action === "reject") {
    await supabase
      .from("news_reservoir")
      .update({ status: "rejected", updated_at: now })
      .eq("id", id)
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // save/publish 공통 — 검수 편집본(title/content)이 오면 그걸, 아니면 기존 draft 사용
  const finalTitle = (editTitle ?? item.draft?.title)?.trim()
  const finalContent = sanitizeTipTapJSON(editContent ?? item.draft?.content)
  if (!finalTitle || !finalContent) {
    return NextResponse.json({ error: "제목/본문이 유효하지 않습니다." }, { status: 400 })
  }
  const nextDraft = { ...(item.draft ?? {}), title: finalTitle, content: finalContent }

  // 수정 저장만 (발행 안 함)
  if (action === "save") {
    await supabase.from("news_reservoir").update({ draft: nextDraft, updated_at: now }).eq("id", id)
    return NextResponse.json({ ok: true, status: "drafted", saved: true })
  }

  // publish — 발행 본체는 lib/news/publish 공용 로직 (자동발행 cron 과 공유).
  // 검수자가 제목/본문을 고쳤으면 수정 전 원본(pre_edit)을 넘겨 교정 학습을 태운다.
  const wasEdited =
    (editTitle !== undefined && editTitle?.trim() !== item.draft?.title) ||
    (editContent !== undefined &&
      JSON.stringify(sanitizeTipTapJSON(editContent)) !== JSON.stringify(item.draft?.content))

  const result = await publishNewsDraft(supabase, item, {
    title: finalTitle,
    content: finalContent,
    flairIds: parsed.data.flair_ids,
    vs: parsed.data.vs,
    preEdit: wasEdited
      ? { title: item.draft?.title ?? null, content: item.draft?.content ?? null }
      : null,
  })
  if (result.error || !result.postId) {
    return NextResponse.json({ error: "발행 실패", detail: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status: "published",
    post_id: result.postId,
    // 검수자에게 "이 수정은 학습된다"를 알려주는 신호 (실제 결과는 after 에서 처리)
    learning: wasEdited,
  })
}

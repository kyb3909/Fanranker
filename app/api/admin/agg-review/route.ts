import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdmin } from "@/lib/supabase/admin"
import { createServiceRoleClient } from "@/lib/supabase/server"
import aggConfig from "@/data/agents/config/aggregator.json"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/agg-review — 관리자 전용 (admin layout + requireAdmin 이중 보호).
 * 애그리게이터 페르소나 초안 검수·발행 (agg_reservoir drafted → published | rejected).
 * data/agents/scripts/agg-publish-run.js 의 발행 로직 이식 — 페이지 단건 발행용.
 *
 * body: { id, action: "publish" | "reject", title?, body?, reason? }
 *  - publish: 페르소나 계정으로 free-board 발행. title/body(편집본)가 오면 그걸로.
 *             편집 발행이면 (AI초안, 편집본) 쌍을 agg_training_entries 에 자동 적재 → F15 학습 회수
 *  - reject : reservoir 반려 + 반려 사유를 학습 신호로 자동 적재
 * 출처는 공개 표기하지 않는다 (운영자 방침 2026-07-22) — source_url 은 내부 전용.
 */
const BodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["publish", "reject"]),
  title: z.string().min(1).max(300).optional(),
  body: z.string().min(1).max(8000).optional(),
  reason: z.string().max(300).optional(),
})

interface MediaItem {
  type: string
  url: string
  rehosted_url?: string | null
}

interface ReservoirRow {
  id: string
  source: string
  source_title: string
  category: string | null
  body_excerpt: string | null
  status: string
  rewritten: { title?: string; paragraphs?: string[]; intro?: string; persona_user_id?: string }
  media: MediaItem[] | null
  audit: unknown[] | null
}

/** 문단 배열 + 미디어 → TipTap doc (agg-publish-run.js 와 동일 레이아웃: 첫 문단 → 미디어 → 나머지) */
function buildTipTapDoc(paragraphs: string[], media: MediaItem[]) {
  const para = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text: String(text).slice(0, 2000) }],
  })
  const content: Record<string, unknown>[] = []
  if (paragraphs[0]) content.push(para(paragraphs[0]))
  for (const m of media) {
    if (m.type === "image" && m.rehosted_url) {
      content.push({ type: "image", attrs: { src: m.rehosted_url } })
    } else if (m.type === "youtube") {
      const yt = m.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
      content.push({
        type: "embed",
        attrs: {
          provider: "youtube",
          url: m.url,
          thumbnail_url: yt ? `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` : undefined,
        },
      })
    } else if (m.type === "x") {
      content.push({ type: "embed", attrs: { provider: "x", url: m.url } })
    }
  }
  for (const text of paragraphs.slice(1)) content.push(para(text))
  return { type: "doc", content }
}

function personaNickname(userId: string): string {
  return aggConfig.personas.find((p) => p.userId === userId)?.nickname ?? userId
}

/** KST 자정 기준 오늘 발행 수 (전체 + 페르소나별) */
async function todayPublishCounts(supabase: ReturnType<typeof createServiceRoleClient>) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
  const { data } = await supabase
    .from("agg_reservoir")
    .select("rewritten")
    .eq("status", "published")
    .gte("published_at", kstMidnightUtc)
  const rows = (data ?? []) as { rewritten: { persona_user_id?: string } | null }[]
  const byPersona: Record<string, number> = {}
  for (const row of rows) {
    const p = row.rewritten?.persona_user_id
    if (p) byPersona[p] = (byPersona[p] || 0) + 1
  }
  return { total: rows.length, byPersona }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "id/action 필요" }, { status: 400 })
  const { id, action, title: editTitle, body: editBody, reason } = parsed.data

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  const { data: item } = await supabase
    .from("agg_reservoir")
    .select("id, source, source_title, category, body_excerpt, status, rewritten, media, audit")
    .eq("id", id)
    .maybeSingle<ReservoirRow>()
  if (!item) return NextResponse.json({ error: "초안을 찾을 수 없습니다." }, { status: 404 })
  if (item.status !== "drafted") {
    // 다중 관리자 동시 검수 — 다른 관리자가 먼저 처리한 경우
    return NextResponse.json(
      { error: `이미 처리된 초안입니다 (status=${item.status}).`, code: "already_processed" },
      { status: 409 }
    )
  }

  const rw = item.rewritten
  const aiTitle = rw?.title ?? ""
  const aiParagraphs = Array.isArray(rw?.paragraphs) ? rw.paragraphs : rw?.intro ? [rw.intro] : []
  const aiBody = aiParagraphs.join("\n\n")
  const personaId = rw?.persona_user_id
  const nickname = personaId ? personaNickname(personaId) : ""

  /** 검수 결과를 F15 학습 신호로 적재 (round 0 = 운영 검수 출처). 실패해도 본 동작엔 영향 없음 */
  async function logTraining(
    status: "corrected" | "rejected",
    fix?: { title: string; body: string },
    rejectReason?: string
  ) {
    await supabase.from("agg_training_entries").insert({
      round: 0,
      source_title: item!.source_title,
      category: item!.category,
      body_excerpt: item!.body_excerpt,
      media: item!.media ?? [],
      persona: nickname,
      structure: "live-review",
      ai_title: aiTitle,
      ai_body: aiBody,
      ...(fix ? { fix_title: fix.title, fix_body: fix.body } : {}),
      ...(rejectReason !== undefined ? { reject_reason: rejectReason || null } : {}),
      status,
      reviewed_at: now,
    })
  }

  if (action === "reject") {
    await supabase
      .from("agg_reservoir")
      .update({
        status: "rejected",
        reject_reason: `admin: ${reason?.trim() || "검수 반려"}`.slice(0, 200),
        audit: [...(item.audit ?? []), { at: now, stage: "review", action: "reject" }],
      })
      .eq("id", id)
    if (aiTitle) await logTraining("rejected", undefined, reason?.trim())
    return NextResponse.json({ ok: true, status: "rejected" })
  }

  // publish
  if (!aiTitle || !personaId) {
    return NextResponse.json({ error: "rewritten 데이터가 유효하지 않습니다." }, { status: 400 })
  }
  const finalTitle = (editTitle ?? aiTitle).trim()
  const finalParagraphs = (editBody ?? aiBody)
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (!finalTitle || finalParagraphs.length === 0) {
    return NextResponse.json({ error: "제목/본문이 유효하지 않습니다." }, { status: 400 })
  }

  // 일일 cap + 페르소나별 cap (agg-publish-run 과 동일 정책)
  const { dailyPublishCap, publishPerPersonaPerDay } = aggConfig.limits
  const counts = await todayPublishCounts(supabase)
  if (counts.total >= dailyPublishCap) {
    return NextResponse.json(
      { error: `오늘 발행 cap(${dailyPublishCap}건)에 도달했습니다.` },
      { status: 409 }
    )
  }
  if ((counts.byPersona[personaId] || 0) >= publishPerPersonaPerDay) {
    return NextResponse.json(
      { error: `${nickname} 오늘 발행 cap(${publishPerPersonaPerDay}건)에 도달했습니다.` },
      { status: 409 }
    )
  }

  const content = buildTipTapDoc(finalParagraphs, item.media ?? [])
  const { data: postRow, error: insErr } = await supabase
    .from("posts")
    .insert({
      user_id: personaId,
      community_slug: aggConfig.board.communitySlug,
      title: finalTitle,
      content,
    })
    .select("id")
    .single<{ id: string }>()
  if (insErr || !postRow) {
    return NextResponse.json({ error: "발행 실패", detail: insErr?.message }, { status: 500 })
  }

  await supabase
    .from("agg_reservoir")
    .update({
      status: "published",
      post_id: postRow.id,
      published_at: now,
      rewritten: { ...rw, title: finalTitle, paragraphs: finalParagraphs },
      audit: [
        ...(item.audit ?? []),
        { at: now, stage: "review", action: "publish", post_id: postRow.id },
      ],
    })
    .eq("id", id)

  // 편집 발행 = 교정 학습 신호 (운영 검수가 그대로 F15 few-shot 이 된다)
  const edited = finalTitle !== aiTitle.trim() || finalParagraphs.join("\n\n") !== aiBody.trim()
  if (edited) {
    await logTraining("corrected", { title: finalTitle, body: finalParagraphs.join("\n\n") })
  }

  return NextResponse.json({ ok: true, status: "published", post_id: postRow.id, edited })
}

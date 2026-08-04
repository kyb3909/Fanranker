import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import type { createServiceRoleClient } from "@/lib/supabase/server"
import { requireStaffApi } from "@/lib/admin/roles"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { learnFromDeskEdit } from "@/lib/news/learn-corrections"
import { NEWS_BOT_USER_ID } from "@/lib/news/publish"

export const dynamic = "force-dynamic"

/**
 * 발행된 것 고치기 — 봇 기사·사가 연표를 발행 후에 교정하는 유일한 문
 * (2026-08-04 운영자: "이미 발행된 사가와 기사를 수정할 수 있는 메뉴").
 *
 * posts PATCH 는 작성자만이라 봇 글은 운영자가 못 고쳤고, admin content API 는
 * 삭제/복구뿐이었다 — 학습 루프(수정 → 표기 사전)가 있는데 수정할 문이 없던 것.
 *
 * 학습 연동:
 * - 기사·엔트리 수정 → learnFromDeskEdit (LLM 추출 + 환각 가드) 즉시 실행.
 *   밤의 news-learn-edits cron 이 같은 diff 를 다시 봐도 사전 upsert 가 멱등이라 무해.
 * - 사가 한글명 교정 → 사전에 **무LLM 직접 등재** (player_key ↔ 한글, 결정론이라
 *   환각이 원천 불가능한 가장 안전한 학습 경로).
 */

const GET_KINDS = new Set(["articles", "sagas"])
const LOOKBACK_MS = 72 * 3600 * 1000

export async function GET(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const kind = req.nextUrl.searchParams.get("kind") ?? "articles"
  if (!GET_KINDS.has(kind)) return NextResponse.json({ error: "kind 오류" }, { status: 400 })
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString()

  if (kind === "articles") {
    const { data } = await supabase
      .from("posts")
      .select("id, title, content, image, created_at")
      .eq("user_id", NEWS_BOT_USER_ID)
      .is("deleted_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30)
    return NextResponse.json({ items: data ?? [] })
  }

  const { data } = await supabase
    .from("saga_entries")
    .select("id, headline, tier, occurred_at, sagas!inner(id, slug, title, saga_type, subject)")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(50)
  return NextResponse.json({ items: data ?? [] })
}

const BodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("article"),
    post_id: z.string().uuid(),
    title: z.string().min(1).max(300),
    content: z.unknown(),
  }),
  z.object({
    kind: z.literal("entry"),
    entry_id: z.string().uuid(),
    headline: z.string().min(1).max(200),
    tier: z.enum(["official", "tier1", "rumor"]).optional(),
  }),
  z.object({
    kind: z.literal("saga"),
    saga_id: z.string().uuid(),
    title: z.string().min(1).max(100).optional(),
    player_kr: z.string().min(1).max(40).optional(),
  }),
])

/** 사가 한글명 교정 → 표기 사전 직접 등재 (무LLM — 운영자 입력 그대로, 환각 불가) */
async function registerPlayerAlias(
  supabase: ReturnType<typeof createServiceRoleClient>,
  playerKey: string,
  preferredKo: string
) {
  const surface = playerKey.toLowerCase()
  const { data: rows } = await supabase
    .from("news_alias_dictionary")
    .select("id, preferred_ko, surfaces, romanized")
    .eq("category", "player")
    .or(`romanized.eq.${playerKey},preferred_ko.eq.${preferredKo}`)
    .limit(2)

  const exact = (rows ?? []).find((r) => r.preferred_ko === preferredKo)
  if (exact) {
    if (!(exact.surfaces ?? []).includes(surface)) {
      await supabase
        .from("news_alias_dictionary")
        .update({
          surfaces: [...(exact.surfaces ?? []), surface],
          updated_at: new Date().toISOString(),
        })
        .eq("id", exact.id)
    }
    return
  }
  const byRoman = (rows ?? []).find((r) => r.romanized === playerKey)
  if (byRoman) {
    // 사전이 다른(옛) 한글 표기를 갖고 있던 경우 — 대표값 교정, 옛 표기는 surface 로 보존
    await supabase
      .from("news_alias_dictionary")
      .update({
        preferred_ko: preferredKo,
        surfaces: [
          ...new Set([...(byRoman.surfaces ?? []), surface, byRoman.preferred_ko.toLowerCase()]),
        ],
        updated_at: new Date().toISOString(),
      })
      .eq("id", byRoman.id)
    return
  }
  await supabase.from("news_alias_dictionary").insert({
    id: `player_learned_${playerKey.replace(/-/g, "_")}`,
    category: "player",
    preferred_ko: preferredKo,
    romanized: playerKey,
    surfaces: [surface],
    confidence: 0.9,
    notes: `learned-from-saga-rename at=${new Date().toISOString()}`,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 JSON" }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "요청 형식 오류" }, { status: 400 })
  const body = parsed.data
  const now = new Date().toISOString()

  if (body.kind === "article") {
    const { data: post } = await supabase
      .from("posts")
      .select("id, user_id, title, content")
      .eq("id", body.post_id)
      .maybeSingle()
    if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 })
    if (post.user_id !== NEWS_BOT_USER_ID) {
      return NextResponse.json({ error: "봇 기사만 여기서 고칠 수 있습니다." }, { status: 403 })
    }
    const content = sanitizeTipTapJSON(body.content)
    if (!content) return NextResponse.json({ error: "본문이 유효하지 않습니다." }, { status: 400 })

    const image = extractFirstImageSrcFromTipTapJSON(content)
    const { error } = await supabase
      .from("posts")
      .update({ title: body.title, content, image: image ?? null })
      .eq("id", post.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const old = { title: post.title as string, content: post.content }
    after(async () => {
      await learnFromDeskEdit(supabase, {
        postId: post.id,
        originalTitle: old.title,
        originalContent: old.content,
        finalTitle: body.title,
        finalContent: content,
      })
    })
    return NextResponse.json({ ok: true, learning: true })
  }

  if (body.kind === "entry") {
    const { data: entry } = await supabase
      .from("saga_entries")
      .select("id, headline")
      .eq("id", body.entry_id)
      .maybeSingle()
    if (!entry) return NextResponse.json({ error: "엔트리를 찾을 수 없습니다." }, { status: 404 })

    const { error } = await supabase
      .from("saga_entries")
      .update({ headline: body.headline, ...(body.tier ? { tier: body.tier } : {}) })
      .eq("id", entry.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const oldHeadline = entry.headline as string
    if (oldHeadline !== body.headline) {
      after(async () => {
        await learnFromDeskEdit(supabase, {
          postId: `saga-entry:${entry.id}`,
          originalTitle: oldHeadline,
          originalContent: null,
          finalTitle: body.headline,
          finalContent: null,
        })
      })
    }
    return NextResponse.json({ ok: true, learning: oldHeadline !== body.headline })
  }

  // saga — 제목·한글명 교정
  const { data: saga } = await supabase
    .from("sagas")
    .select("id, title, saga_type, subject, anchor_post_id")
    .eq("id", body.saga_id)
    .maybeSingle()
  if (!saga) return NextResponse.json({ error: "사가를 찾을 수 없습니다." }, { status: 404 })

  const subject = (saga.subject ?? {}) as Record<string, unknown>
  const nextTitle = body.title ?? (saga.title as string)
  const nextSubject = body.player_kr ? { ...subject, player_name_kr: body.player_kr } : subject

  const { error } = await supabase
    .from("sagas")
    .update({ title: nextTitle, subject: nextSubject, updated_at: now })
    .eq("id", saga.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 앵커 포스트 제목도 동기화 (검색·알림에서 옛 제목이 남지 않게)
  if (body.title && saga.anchor_post_id) {
    await supabase.from("posts").update({ title: body.title }).eq("id", saga.anchor_post_id)
  }

  // 한글명 교정은 사전에 결정론 등재 — 이후 모든 기사·사가가 이 표기를 쓴다
  let learned = false
  const playerKey = typeof subject.player_key === "string" ? subject.player_key : null
  if (body.player_kr && playerKey && saga.saga_type === "transfer") {
    await registerPlayerAlias(supabase, playerKey, body.player_kr)
    learned = true
  }
  return NextResponse.json({ ok: true, learning: learned })
}

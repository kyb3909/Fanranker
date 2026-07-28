import { NextRequest, NextResponse } from "next/server"
import { after } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/admin/roles"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { notifyNewsPublished, resolveNewsChannel } from "@/lib/discord/news-notify"
import { suggestFlairs } from "@/lib/news/suggest-flair"
import { learnFromDeskEdit } from "@/lib/news/learn-corrections"
import type { TipTapNode } from "@/types/post"

export const dynamic = "force-dynamic"

/** 발행 뉴스 작성자 = 공놀이봇(user_bot_soccer_kr). football 게시판. 봇 글은 전부 이 계정. */
const NEWS_BOT_USER_ID = "user_bot_soccer_kr"
const FOOTBALL_CATEGORY_ID = "22105623-6c99-487d-975f-15073e0990fc"
const FOOTBALL_SLUG = "football"

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
})

interface DraftReservoirRow {
  id: string
  status: string
  urls: { source?: string | null } | null
  draft: { title?: string; content?: unknown; tags?: string[] } | null
  entities: {
    teams?: { surface?: string | null; preferred_ko?: string | null }[]
  } | null
  tags: string[] | null
}

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

  // publish
  const image = extractFirstImageSrcFromTipTapJSON(finalContent)
  const sourceUrl = item.urls?.source ?? null

  // 말머리(다중) — 검수자가 지정(flair_ids)했으면 그대로, 미지정이면 제목 기반 자동 추천.
  // 대표 말머리(posts.flair_id)는 첫 번째(팀 우선 정렬), 나머지는 post_flair_map 에 담는다.
  let flairIds = parsed.data.flair_ids
  if (flairIds === undefined) {
    const { data: flairOpts } = await supabase
      .from("post_flairs")
      .select("id, name, team_id")
      .eq("community_slug", FOOTBALL_SLUG)
      .eq("is_active", true)
    flairIds = suggestFlairs(finalTitle, flairOpts ?? []).flairIds
  }
  // 담벼락엔 대표 말머리 1개만 표시된다(posts.flair_id). 대표는 팀/리그를 우선하고
  // 성격(이적/뉴스)은 뒤로 민다 — 검수자가 누른 순서와 무관하게 팀/리그가 대표가 되도록.
  if (flairIds.length > 1) {
    const { data: meta } = await supabase.from("post_flairs").select("id, name").in("id", flairIds)
    const isKind = (fid: string) => {
      const n = meta?.find((m) => m.id === fid)?.name
      return n === "이적" || n === "뉴스"
    }
    flairIds = [...flairIds].sort((a, b) => Number(isKind(a)) - Number(isKind(b)))
  }
  const primaryFlairId = flairIds[0] ?? null

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      user_id: NEWS_BOT_USER_ID,
      category_id: FOOTBALL_CATEGORY_ID,
      community_slug: FOOTBALL_SLUG,
      title: finalTitle,
      content: finalContent,
      ...(image ? { image } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      ...(primaryFlairId ? { flair_id: primaryFlairId } : {}),
    })
    .select("id")
    .single<{ id: string }>()
  if (postErr || !post) {
    return NextResponse.json({ error: "발행 실패", detail: postErr?.message }, { status: 500 })
  }

  // 다중 말머리 — post_flair_map 에 전체 기록 (대표 포함). 실패해도 발행은 유지.
  if (flairIds.length > 0) {
    await supabase
      .from("post_flair_map")
      .insert(flairIds.map((fid) => ({ post_id: post.id, flair_id: fid })))
  }

  // 검수자가 제목/본문을 고쳐서 발행하면 수정 전 원본을 publish.pre_edit 에 보존한다.
  // 교정 학습기(data/agents/scripts/learn-from-edits.js)가 원본↔발행본 diff 에서
  // 표기 교정(선수명·매체명·음차)을 추출해 사전에 등록하는 재료다 — draft 는
  // 아래에서 편집본으로 덮어쓰므로 여기 남기지 않으면 원본이 사라진다.
  const wasEdited =
    (editTitle !== undefined && editTitle?.trim() !== item.draft?.title) ||
    (editContent !== undefined &&
      JSON.stringify(sanitizeTipTapJSON(editContent)) !== JSON.stringify(item.draft?.content))
  await supabase
    .from("news_reservoir")
    .update({
      status: "published",
      publish: {
        post_id: post.id,
        published_at: now,
        ...(wasEdited
          ? { pre_edit: { title: item.draft?.title ?? null, content: item.draft?.content ?? null } }
          : {}),
      },
      draft: nextDraft,
      updated_at: now,
    })
    .eq("id", id)

  // 디스코드 뉴스봇 채널 발송 — 웹훅 미설정 시 no-op, 실패해도 발행에는 영향 없음.
  // 라우팅: 제목 + 태그 + 팀 엔티티로 팀 채널 결정 (두 팀 이상 매칭 시 종합).
  const teamTexts = (item.entities?.teams ?? []).flatMap((t) => [t.surface, t.preferred_ko])
  const teaser = extractTextFromTipTapJSON(finalContent as TipTapNode)
    .slice(0, 200)
    .trim()
  await notifyNewsPublished({
    channel: resolveNewsChannel([finalTitle, ...(item.tags ?? []), ...teamTexts]),
    postId: post.id,
    title: finalTitle,
    teaser,
    imageUrl: image,
  })

  // 데스킹 학습 — 검수자가 고친 표기(선수명·음차·매체명)를 사전에 반영해
  // 다음 기사부터 자동 적용한다. 응답을 막지 않도록 after() 로 뒤로 미루고,
  // 실패해도 발행에는 영향이 없다 (learnFromDeskEdit 는 throw 하지 않음).
  if (wasEdited) {
    after(async () => {
      await learnFromDeskEdit(supabase, {
        postId: post.id,
        originalTitle: item.draft?.title ?? "",
        originalContent: item.draft?.content ?? null,
        finalTitle,
        finalContent,
      })
    })
  }

  return NextResponse.json({
    ok: true,
    status: "published",
    post_id: post.id,
    // 검수자에게 "이 수정은 학습된다"를 알려주는 신호 (실제 결과는 after 에서 처리)
    learning: wasEdited,
  })
}

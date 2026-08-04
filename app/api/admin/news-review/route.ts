import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { requireStaff } from "@/lib/admin/roles"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { publishNewsDraft, type NewsReservoirItem } from "@/lib/news/publish"
import { learnFromDeskEdit } from "@/lib/news/learn-corrections"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/news-review  — admin·editor 허용 (레이아웃 + requireStaff 이중 보호). 검수는 editor 의 본업이다.
 * body: { id, action: "publish" | "reject" | "save", title?, content? }
 *  - publish: news_reservoir(drafted) → posts 발행(공놀이봇) + reservoir status=published
 *  - save   : 검수 중 수정본을 draft 에 저장 (발행 안 함)
 *  - reject : reservoir status=rejected (발행 안 함). title/content 가 함께 오면
 *             "고치고 반려" — 기사는 버리되 교정만 표기 사전에 학습시킨다
 *             (심한 오타 기사를 발행 없이 가르치는 경로).
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
  // 사가 연결 지정 — 미전달이면 자동(LLM 추출). none=연결 안 함 / existing=기존 사가 /
  // new=새 사가 생성 (동일인 가드가 있어 같은 선수 사가가 있으면 거기로 합류)
  saga: z
    .object({
      mode: z.enum(["none", "existing", "new"]),
      saga_id: z.string().uuid().optional(),
      player: z.string().max(80).optional(),
      player_kr: z.string().max(40).optional(),
      direction: z.enum(["in", "out"]).optional(),
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

  // 교정 학습의 기준점 = 봇 원본. "수정 저장"이 draft 를 덮어도 첫 편집 전 스냅샷
  // (draft.original)이 남아 있어, 저장→발행/반려 순서와 무관하게 diff 가 항상 잡힌다.
  const original = item.draft?.original ?? {
    title: item.draft?.title,
    content: item.draft?.content,
  }

  if (action === "reject") {
    // "고치고 반려" — 수정본이 왔고 원본과 실제로 다르면, 기사는 버려도 교정은 학습.
    // 수정본을 draft 에도 남겨 배치 안전망(learn-from-edits)이 재발견할 수 있게 한다.
    const rejectTitle = editTitle?.trim() ?? item.draft?.title
    const rejectContent =
      editContent !== undefined ? sanitizeTipTapJSON(editContent) : item.draft?.content
    const rejectEdited =
      (rejectTitle !== undefined && rejectTitle !== original.title) ||
      (rejectContent !== undefined &&
        JSON.stringify(rejectContent) !== JSON.stringify(original.content))

    await supabase
      .from("news_reservoir")
      .update({
        status: "rejected",
        updated_at: now,
        ...(rejectEdited
          ? {
              draft: {
                ...(item.draft ?? {}),
                title: rejectTitle,
                content: rejectContent,
                original,
              },
            }
          : {}),
      })
      .eq("id", id)

    if (rejectEdited) {
      after(async () => {
        await learnFromDeskEdit(supabase, {
          postId: `reservoir:${id}`,
          originalTitle: original.title ?? "",
          originalContent: original.content ?? null,
          finalTitle: rejectTitle ?? "",
          finalContent: rejectContent ?? null,
        })
      })
    }
    return NextResponse.json({ ok: true, status: "rejected", learning: rejectEdited })
  }

  // save/publish 공통 — 검수 편집본(title/content)이 오면 그걸, 아니면 기존 draft 사용
  const finalTitle = (editTitle ?? item.draft?.title)?.trim()
  const finalContent = sanitizeTipTapJSON(editContent ?? item.draft?.content)
  if (!finalTitle || !finalContent) {
    return NextResponse.json({ error: "제목/본문이 유효하지 않습니다." }, { status: 400 })
  }
  // 저장 시에도 original 을 함께 심어 봇 원본이 유실되지 않게 한다
  const nextDraft = { ...(item.draft ?? {}), title: finalTitle, content: finalContent, original }

  // 수정 저장만 (발행 안 함)
  if (action === "save") {
    await supabase.from("news_reservoir").update({ draft: nextDraft, updated_at: now }).eq("id", id)
    return NextResponse.json({ ok: true, status: "drafted", saved: true })
  }

  // publish — 발행 본체는 lib/news/publish 공용 로직 (자동발행 cron 과 공유).
  // 최종본이 봇 원본과 다르면(이번 편집이든 이전 "수정 저장"이든) 교정 학습을 태운다.
  const wasEdited =
    finalTitle !== original.title ||
    JSON.stringify(finalContent) !== JSON.stringify(original.content)

  // publishNewsDraft 가 draft 를 다시 저장하므로, original 을 심어두면 발행 후에도
  // "봇 원본 → 검수 최종" 쌍이 reservoir 에 남는다 (correction-examples 재작성 few-shot 재료)
  if (wasEdited) item.draft = nextDraft

  const sagaChoice = parsed.data.saga
  const result = await publishNewsDraft(supabase, item, {
    title: finalTitle,
    content: finalContent,
    flairIds: parsed.data.flair_ids,
    vs: parsed.data.vs,
    saga: sagaChoice
      ? {
          mode: sagaChoice.mode,
          sagaId: sagaChoice.saga_id,
          player: sagaChoice.player,
          playerKr: sagaChoice.player_kr,
          direction: sagaChoice.direction,
        }
      : null,
    preEdit: wasEdited
      ? { title: original.title ?? null, content: original.content ?? null }
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
    // 검수자 지정 사가 연결 결과 (자동 연결은 응답 후 처리라 여기 없음)
    saga: result.saga ?? null,
    ...(result.sagaError ? { saga_error: result.sagaError } : {}),
  })
}

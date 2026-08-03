import { after } from "next/server"
import type { createServiceRoleClient } from "@/lib/supabase/server"
import { rehostExternalImage, isSelfHostedImageUrl } from "@/lib/images/rehost"
import { isContentFreeText } from "@/lib/news/content-quality"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { extractTextFromTipTapJSON } from "@/lib/tiptap/extract-text"
import { notifyNewsPublished, resolveNewsChannel } from "@/lib/discord/news-notify"
import { suggestFlairs } from "@/lib/news/suggest-flair"
import { learnFromDeskEdit } from "@/lib/news/learn-corrections"
import {
  createVsPollFromDraft,
  type VsDraftProposal,
  type VsReviewDecision,
} from "@/lib/news/vs-issue"
import { linkArticleToSaga } from "@/lib/saga/publish"
import { splitLongParagraphs } from "@/lib/tiptap/split-paragraphs"
import type { TipTapNode } from "@/types/post"

/**
 * 뉴스 발행 공용 로직 — 검수 API(/api/admin/news-review)와 자동발행 cron 이 공유.
 * lib/agg/publish.ts 와 같은 패턴: 발행 경로가 두 곳이 되는 순간 로직을 lib 로 모은다.
 * 한쪽만 고쳐지는 드리프트가 나면 학습 루프(pre_edit 보존)까지 깨지기 때문.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** 발행 뉴스 작성자 = 공놀이봇(user_bot_soccer_kr). football 게시판. 봇 글은 전부 이 계정. */
export const NEWS_BOT_USER_ID = "user_bot_soccer_kr"
export const FOOTBALL_CATEGORY_ID = "22105623-6c99-487d-975f-15073e0990fc"
export const FOOTBALL_SLUG = "football"

export interface NewsReservoirItem {
  id: string
  urls: { source?: string | null } | null
  draft: {
    title?: string
    content?: unknown
    tags?: string[]
    vs?: VsDraftProposal
    /** 봇 원본 스냅샷 — 검수 편집("수정 저장")이 draft 를 덮기 전에 보존. 교정 학습의 기준점 */
    original?: { title?: string; content?: unknown }
  } | null
  entities: {
    teams?: { surface?: string | null; preferred_ko?: string | null }[]
  } | null
  tags: string[] | null
}

export interface PublishNewsOptions {
  /** 발행할 제목/본문 (본문은 sanitize 완료본) */
  title: string
  content: unknown
  /** 검수자가 지정한 말머리. undefined 면 제목 기반 자동 추천 */
  flairIds?: string[]
  /** 검수 편집이 있었으면 수정 전 원본 — 교정 학습기의 diff 재료 (publish.pre_edit 에 보존) */
  preEdit?: { title: string | null; content: unknown } | null
  /** 자동발행 여부 — publish.auto 로 기록해 자동/수동 발행을 사후 구분·회수 가능하게 */
  auto?: boolean
  /** 검수 화면의 VS 결정 (켜기/끄기/문구 수정). 미전달이면 confidence 기본값 */
  vs?: VsReviewDecision | null
}

/**
 * 본문 TipTap 트리의 외부 이미지 src 를 우리 Storage 로 재호스팅해 바꿔 쓴다 (in-place 아님 — 복사본 반환).
 * 외부 핫링크는 원본 해상도(수 MB)·핫링크 차단·서드파티 쿠키(FIFA 사례)를 그대로 피드에 실어 나르므로
 * 발행 시점에 WebP 1200px 로 내린다. 개별 실패는 원본 유지(fail-open) — 이미지 때문에 발행을 막지 않는다.
 */
async function rehostContentImages(content: unknown): Promise<unknown> {
  if (!content || typeof content !== "object") return content
  const clone = structuredClone(content)
  const walk = async (node: unknown): Promise<void> => {
    if (!node || typeof node !== "object") return
    const n = node as { type?: string; attrs?: { src?: string }; content?: unknown[] }
    if (n.type === "image" && typeof n.attrs?.src === "string") {
      const src = n.attrs.src
      if (/^https?:\/\//i.test(src) && !isSelfHostedImageUrl(src)) {
        try {
          n.attrs.src = await rehostExternalImage(src, NEWS_BOT_USER_ID)
        } catch (e) {
          console.error("[news-publish] 이미지 재호스팅 실패, 원본 유지:", src, e)
        }
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) await walk(child)
    }
  }
  await walk(clone)
  return clone
}

/**
 * news_reservoir 초안 1건을 posts 로 발행한다.
 * 성공 시 reservoir status=published + publish 메타 기록까지 완료.
 */
export async function publishNewsDraft(
  supabase: ServiceClient,
  item: NewsReservoirItem,
  opts: PublishNewsOptions
): Promise<{ postId?: string; error?: string }> {
  const now = new Date().toISOString()
  // 긴 단일 문단 → 2~3문장 단위 문단 분할 (가독성, 2026-08-04 운영자)
  const content = splitLongParagraphs(await rehostContentImages(opts.content))
  const image = extractFirstImageSrcFromTipTapJSON(content)
  const sourceUrl = item.urls?.source ?? null

  // 말머리(다중) — 지정(flairIds)이 있으면 그대로, 미지정이면 제목 기반 자동 추천.
  // 대표 말머리(posts.flair_id)는 첫 번째(팀 우선 정렬), 나머지는 post_flair_map 에 담는다.
  let flairIds = opts.flairIds
  if (flairIds === undefined) {
    const { data: flairOpts } = await supabase
      .from("post_flairs")
      .select("id, name, team_id")
      .eq("community_slug", FOOTBALL_SLUG)
      .eq("is_active", true)
    flairIds = suggestFlairs(opts.title, flairOpts ?? []).flairIds
  }
  // 담벼락엔 대표 말머리 1개만 표시된다(posts.flair_id). 대표는 팀/리그를 우선하고
  // 성격(이적/뉴스)은 뒤로 민다 — 지정 순서와 무관하게 팀/리그가 대표가 되도록.
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
      title: opts.title,
      content,
      ...(image ? { image } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      ...(primaryFlairId ? { flair_id: primaryFlairId } : {}),
    })
    .select("id")
    .single<{ id: string }>()
  if (postErr || !post) {
    return { error: postErr?.message ?? "posts insert 실패" }
  }

  // 다중 말머리 — post_flair_map 에 전체 기록 (대표 포함). 실패해도 발행은 유지.
  if (flairIds.length > 0) {
    await supabase
      .from("post_flair_map")
      .insert(flairIds.map((fid) => ({ post_id: post.id, flair_id: fid })))
  }

  // 수정 전 원본(pre_edit)은 교정 학습기(learn-from-edits)가 원본↔발행본 diff 에서
  // 표기 교정을 추출하는 재료 — draft 는 편집본으로 덮어쓰므로 여기 남기지 않으면 사라진다.
  await supabase
    .from("news_reservoir")
    .update({
      status: "published",
      publish: {
        post_id: post.id,
        published_at: now,
        ...(opts.auto ? { auto: true } : {}),
        ...(opts.preEdit ? { pre_edit: opts.preEdit } : {}),
      },
      draft: { ...(item.draft ?? {}), title: opts.title, content },
      updated_at: now,
    })
    .eq("id", item.id)

  // 디스코드 뉴스봇 채널 발송 — 웹훅 미설정 시 no-op, 실패해도 발행에는 영향 없음.
  const teamTexts = (item.entities?.teams ?? []).flatMap((t) => [t.surface, t.preferred_ko])
  const teaser = extractTextFromTipTapJSON(content as TipTapNode)
    .slice(0, 200)
    .trim()
  await notifyNewsPublished({
    channel: resolveNewsChannel([opts.title, ...(item.tags ?? []), ...teamTexts]),
    postId: post.id,
    // 자동발행분은 디스코드에서 한눈에 구분 — 사후 감시(오류 발견→회수)의 눈
    title: opts.auto ? `🤖 ${opts.title}` : opts.title,
    teaser,
    imageUrl: image,
  })

  // 이적설 사가 연동 — 이적 기사면 해당 선수의 사가 위키에 엔트리로 쌓인다 (없으면
  // 사가 자동 생성). 기사 발행 = 사람 검수 통과 시점이므로 무검수 자동발행이 아니다.
  // 이적 기사가 아니면 내부에서 no-op, 실패해도 발행에는 영향 없음.
  after(async () => {
    await linkArticleToSaga(supabase, {
      postId: post.id,
      title: opts.title,
      sourceUrl,
      occurredAt: now,
    })
  })

  // VS 쟁점 폴 — 스캐너가 초안 단계에서 판정·제안한 것(draft.vs)을 검수 결정과 합쳐
  // 확정한다 (2026-07-31, 3인 회의: 발행 시 LLM 생성 제거 — 사람 눈이 노출 전에
  // 지나가는 구조). 제안이 없으면 폴 없는 기사로 남는다.
  const vsProposal = item.draft?.vs
  if (vsProposal) {
    after(async () => {
      await createVsPollFromDraft(supabase, post.id, vsProposal, opts.vs)
    })
  }

  // 데스킹 학습 — 검수자가 고친 표기(선수명·음차·매체명)를 사전에 반영해
  // 다음 기사부터 자동 적용. 응답을 막지 않도록 after() 로 미루고 실패해도 무해.
  if (opts.preEdit) {
    const preEdit = opts.preEdit
    after(async () => {
      await learnFromDeskEdit(supabase, {
        postId: post.id,
        originalTitle: preEdit.title ?? "",
        originalContent: preEdit.content ?? null,
        finalTitle: opts.title,
        finalContent: content,
      })
    })
  }

  return { postId: post.id }
}

/**
 * 무내용 초안 판정 — 원문 0자로 생성돼 "세부 사항은 기사에서 확인할 수 있습니다"류
 * 필러만 있는 초안 (2026-07-30 hermes-reddit-1vank7k 사례). 본문이 이런 글은
 * 자동발행 금지 + 검수 화면에서도 경고 대상. 판정 규칙은 lib/news/content-quality 공유.
 */
export function isContentFreeDraft(content: unknown): boolean {
  return isContentFreeText(extractTextFromTipTapJSON(content as TipTapNode))
}

/**
 * 자동발행 게이트: 시각 자료(이미지 또는 X/유튜브 임베드)가 있는가.
 * 검수 화면의 "사진 없음(떡밥 제외)" 경고와 같은 기준 — 글만 있는 기사는
 * 담벼락 품질을 깎으므로 자동으로는 내보내지 않는다 (수동 발행은 가능).
 */
export function hasVisualContent(content: unknown): boolean {
  if (!content || typeof content !== "object") return false
  const node = content as { type?: string; content?: unknown[] }
  if (node.type === "image") return true
  if (node.type === "embed") return true
  if (Array.isArray(node.content)) {
    return node.content.some((child) => hasVisualContent(child))
  }
  return false
}

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { notifyNewsPublished } from "@/lib/discord/news-notify"
import aggConfig from "@/data/agents/config/aggregator.json"

/**
 * 애그리게이터 발행 공용 로직 — 검수 API(즉시 검증)와 발행 큐 cron(실제 게시)이 공유.
 * data/agents/scripts/agg-publish-run.js 의 TipTap 조립·cap 정책과 동일.
 */

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export interface AggMediaItem {
  type: string
  url: string
  rehosted_url?: string | null
}

export interface AggQueueItem {
  id: string
  rewritten: { title?: string; paragraphs?: string[]; intro?: string; persona_user_id?: string }
  media: AggMediaItem[] | null
  audit: unknown[] | null
}

export function personaNickname(userId: string): string {
  return aggConfig.personas.find((p) => p.userId === userId)?.nickname ?? userId
}

/**
 * 게시 가능한 미디어가 있는가 — rehost 완료 이미지 또는 임베드(X/유튜브).
 * 자동승인 cron 의 품질 게이트: rehost 실패 이미지는 원본 핫링크 금지라 제외.
 */
export function hasPublishableMedia(media: AggMediaItem[] | null): boolean {
  if (!media) return false
  return media.some(
    (m) => (m.type === "image" && !!m.rehosted_url) || m.type === "x" || m.type === "youtube"
  )
}

/** 문단 배열 + 미디어 → TipTap doc (첫 문단 → 미디어 → 나머지 문단) */
export function buildTipTapDoc(paragraphs: string[], media: AggMediaItem[]) {
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

/** KST 자정 기준 오늘 발행 수 + 큐 대기(approved) 수 — cap 은 "오늘 발행분 + 예약분" 합산으로 검증 */
export async function todayCounts(supabase: ServiceClient) {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
  const [{ data: published }, { data: queued }] = await Promise.all([
    supabase
      .from("agg_reservoir")
      .select("rewritten")
      .eq("status", "published")
      .gte("published_at", kstMidnightUtc),
    supabase.from("agg_reservoir").select("rewritten").eq("status", "approved"),
  ])
  const byPersona: Record<string, number> = {}
  let total = 0
  for (const row of [...(published ?? []), ...(queued ?? [])] as {
    rewritten: { persona_user_id?: string } | null
  }[]) {
    total++
    const p = row.rewritten?.persona_user_id
    if (p) byPersona[p] = (byPersona[p] || 0) + 1
  }
  return { total, byPersona, queued: (queued ?? []).length }
}

/** 큐 다음 슬롯 계산 — 큐 마지막 예약 시각(없으면 지금) + 20~60분 랜덤 */
export async function nextSlot(supabase: ServiceClient): Promise<string> {
  const { data } = await supabase
    .from("agg_reservoir")
    .select("scheduled_at")
    .eq("status", "approved")
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ scheduled_at: string | null }>()
  const base = Math.max(Date.now(), data?.scheduled_at ? Date.parse(data.scheduled_at) : 0)
  const gapMs = (20 + Math.random() * 40) * 60 * 1000
  return new Date(base + gapMs).toISOString()
}

/** approved 항목 1건을 실제 게시 (posts insert + reservoir published). 실패 시 에러 문자열 반환 */
export async function publishQueueItem(
  supabase: ServiceClient,
  item: AggQueueItem
): Promise<{ postId?: string; error?: string }> {
  const rw = item.rewritten
  const paragraphs = Array.isArray(rw?.paragraphs) ? rw.paragraphs : rw?.intro ? [rw.intro] : []
  if (!rw?.title || !rw?.persona_user_id || paragraphs.length === 0) {
    return { error: "rewritten 누락" }
  }
  const content = buildTipTapDoc(paragraphs, item.media ?? [])
  const now = new Date().toISOString()
  const { data: postRow, error: insErr } = await supabase
    .from("posts")
    .insert({
      user_id: rw.persona_user_id,
      community_slug: aggConfig.board.communitySlug,
      title: rw.title,
      content,
    })
    .select("id")
    .single<{ id: string }>()
  if (insErr || !postRow) return { error: insErr?.message ?? "posts insert 실패" }

  await supabase
    .from("agg_reservoir")
    .update({
      status: "published",
      post_id: postRow.id,
      published_at: now,
      audit: [...(item.audit ?? []), { at: now, stage: "queue-publish", post_id: postRow.id }],
    })
    .eq("id", item.id)

  // 디스코드 떡밥 채널 전파 — 티저+링크만 (웹훅 env 미설정 시 no-op, 실패해도 발행 유지)
  const firstImage = (item.media ?? []).find((m) => m.type === "image" && m.rehosted_url)
  await notifyNewsPublished({
    channel: "snack",
    postId: postRow.id,
    title: rw.title,
    teaser: paragraphs[0]?.slice(0, 200) ?? null,
    imageUrl: firstImage?.rehosted_url ?? null,
  })

  return { postId: postRow.id }
}

import { NextResponse } from "next/server"
import { XMLParser } from "fast-xml-parser"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError } from "@/lib/api-error"
import { ALL_CREATORS } from "@/lib/constants/creators"

export const runtime = "nodejs"

/**
 * GET/POST /api/cron/sync-videos
 *
 * 크리에이터 유튜브 RSS 를 파싱해 creator_videos 에 upsert.
 * Vercel Cron 이 1시간 간격 GET 호출 (CRON_SECRET 헤더로 보호).
 * 수동/단일 트리거: ?creator=catsenal
 *
 * RSS 는 서버에서만 fetch (클라이언트 호출 금지).
 */
interface RssEntry {
  "yt:videoId"?: string
  title?: string
  published?: string
  "media:group"?: { "media:thumbnail"?: { "@_url"?: string } }
}

async function syncCreatorVideos(
  supabase: ReturnType<typeof createServiceRoleClient>,
  creatorId: string,
  channelId: string
): Promise<{ creatorId: string; upserted: number; error?: string }> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      cache: "no-store",
    })
    if (!res.ok) return { creatorId, upserted: 0, error: `RSS ${res.status}` }

    const feed = new XMLParser({ ignoreAttributes: false }).parse(await res.text())
    const raw = feed?.feed?.entry ?? []
    const entries: RssEntry[] = Array.isArray(raw) ? raw : [raw]

    const rows = entries
      .map((e) => {
        const videoId = e["yt:videoId"]
        const thumb = e["media:group"]?.["media:thumbnail"]?.["@_url"]
        if (!videoId || !e.title || !thumb || !e.published) return null
        return {
          creator_id: creatorId,
          youtube_video_id: String(videoId),
          title: String(e.title),
          thumbnail_url: String(thumb),
          published_at: e.published,
          synced_at: new Date().toISOString(),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rows.length === 0) return { creatorId, upserted: 0 }

    const { error } = await supabase
      .from("creator_videos")
      .upsert(rows, { onConflict: "creator_id,youtube_video_id" })
    if (error) return { creatorId, upserted: 0, error: error.message }

    return { creatorId, upserted: rows.length }
  } catch (e) {
    return { creatorId, upserted: 0, error: (e as Error).message }
  }
}

async function handle(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  // 단일 크리에이터 지정 가능 (?creator=catsenal), 없으면 전체 싱크.
  const only = new URL(request.url).searchParams.get("creator")
  const targets = only
    ? ALL_CREATORS.filter((c) => c.creatorId === only || c.slug === only)
    : ALL_CREATORS

  if (targets.length === 0) {
    return NextResponse.json(
      { success: false, error: `대상 크리에이터 없음: ${only}` },
      { status: 400 }
    )
  }

  try {
    const supabase = createServiceRoleClient()
    const results = await Promise.all(
      targets.map((c) => syncCreatorVideos(supabase, c.creatorId, c.channelId))
    )
    const upserted = results.reduce((sum, r) => sum + r.upserted, 0)
    return NextResponse.json({
      success: true,
      message: `${results.length}개 채널 싱크, 영상 ${upserted}건 upsert`,
      results,
    })
  } catch (e) {
    return apiError("영상 싱크 중 오류가 발생했습니다.", 500, e)
  }
}

export async function GET(request: Request) {
  return handle(request)
}
export async function POST(request: Request) {
  return handle(request)
}

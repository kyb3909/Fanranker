import { NextRequest, NextResponse } from "next/server"
import { createServerAnonClient } from "@/lib/supabase"
import { apiError } from "@/lib/api-error"
import { getCreatorById } from "@/lib/constants/creators"
import { fetchCommunityPosts } from "@/lib/youtube/community-posts"

/**
 * GET /api/creators/[creatorId]/videos
 *
 * creator_videos 를 published_at desc 로 조회 → { hero(최신 1), recent(나머지) }.
 * 공개 읽기 (RLS: creator_videos_public_read). CDN 캐시.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ creatorId: string }> }
) {
  try {
    const { creatorId } = await params
    const supabase = createServerAnonClient()
    const creator = getCreatorById(creatorId)

    // 영상(DB) + 커뮤니티 글(YouTube 라이브 스크래핑)을 병렬로. 스크래핑 실패해도 영상은 반환.
    const [videosResult, community] = await Promise.all([
      supabase
        .from("creator_videos")
        .select("youtube_video_id, title, thumbnail_url, published_at")
        .eq("creator_id", creatorId)
        .order("published_at", { ascending: false })
        .limit(13), // hero 1 + recent 12
      creator ? fetchCommunityPosts(creator.handle) : Promise.resolve([]),
    ])

    if (videosResult.error)
      return apiError("영상 목록을 가져오지 못했습니다.", 500, videosResult.error)

    const videos = videosResult.data ?? []
    const res = NextResponse.json({
      hero: videos[0] ?? null,
      recent: videos.slice(1),
      community,
    })
    res.headers.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600")
    return res
  } catch (e) {
    return apiError("서버 오류가 발생했습니다.", 500, e)
  }
}

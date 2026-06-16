import useSWR from "swr"
import { fetcher } from "@/lib/swr"

export interface CreatorVideo {
  youtube_video_id: string
  title: string
  thumbnail_url: string
  published_at: string
}

/**
 * 크리에이터 영상 조회 — { hero(최신 1), recent(나머지) }.
 * 서버 API(/api/creators/[id]/videos)를 SWR 로 가져온다 (클라에서 supabase 직접 호출 X).
 */
export function useCreatorVideos(creatorId: string | null | undefined) {
  const { data, error, isLoading } = useSWR<{
    hero: CreatorVideo | null
    recent: CreatorVideo[]
  }>(creatorId ? `/api/creators/${creatorId}/videos` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  })

  return {
    hero: data?.hero ?? null,
    recent: data?.recent ?? [],
    isLoading,
    error,
  }
}

import useSWR from "swr"
import { useAuth } from "@clerk/nextjs"
import { fetcher } from "@/lib/swr"

/**
 * 현재 유저가 해당 게시판에 공지를 작성할 수 있는지 (admin / 글로벌 moderator / board MOD).
 * 비로그인이면 false. 게시판의 "공지 작성" 노출 판단용.
 */
export function useCanPostNotice(communitySlug: string | null | undefined) {
  const { isSignedIn } = useAuth()
  const { data } = useSWR<{ canPostNotice: boolean }>(
    isSignedIn && communitySlug ? `/api/community/${communitySlug}/notice` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  )
  return data?.canPostNotice ?? false
}

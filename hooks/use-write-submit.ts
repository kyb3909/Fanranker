import { useCallback, type Dispatch } from "react"
import type { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { trackEvent } from "@/lib/analytics/events"
import type { EditorState, EditorAction } from "@/hooks/use-write-form"

/** 이미 우리 Storage에 있는 이미지인지 — 프록시 경로(/storage/) 또는 Supabase 도메인. */
function isSelfHostedImage(url: string): boolean {
  return url.startsWith("/storage/") || /:\/\/[^/]+\.supabase\.co\//.test(url)
}

/**
 * 글 발행/수정 제출 (Phase 4b — use-write-editor 에서 추출, 동작 변경 0).
 * 검증 → 커버 이미지 업로드 → POST/PATCH → analytics → 리다이렉트.
 */
export function useWriteSubmit(
  state: EditorState,
  dispatch: Dispatch<EditorAction>,
  editId: string,
  router: ReturnType<typeof useRouter>,
  isNoticeMode = false
) {
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!state.selectedCommunity || !state.title || !state.content) {
        toast({ variant: "destructive", title: "알림", description: "모든 필드를 입력해주세요." })
        return
      }
      if (
        typeof state.content === "object" &&
        state.content !== null &&
        (!("content" in state.content) ||
          !Array.isArray((state.content as { content: unknown[] }).content) ||
          (state.content as { content: unknown[] }).content.length === 0)
      ) {
        toast({ variant: "destructive", title: "알림", description: "내용을 입력해주세요." })
        return
      }

      dispatch({ type: "SET_FIELD", field: "isSubmitting", value: true })
      try {
        let imageUrl: string | null = null
        if (state.imageFile) {
          // 새로 첨부한 로컬 파일 → 업로드
          const formData = new FormData()
          formData.append("file", state.imageFile)
          const uploadResponse = await fetch("/api/upload/image", {
            method: "POST",
            body: formData,
          })
          if (!uploadResponse.ok) {
            const error = await uploadResponse.json()
            throw new Error(error.error || "이미지 업로드에 실패했습니다.")
          }
          const { url } = await uploadResponse.json()
          imageUrl = url
        } else if (state.imagePreview) {
          const preview = state.imagePreview
          if (isSelfHostedImage(preview)) {
            // 이미 우리 Storage(프록시 경로 또는 Supabase 도메인) — 그대로 사용
            imageUrl = preview
          } else if (/^https?:\/\//i.test(preview)) {
            // 외부 이미지(기사 OG·직접 URL) → 서버에서 우리 Storage로 재호스팅.
            // 외부 URL은 허용 도메인이 아니라 그대로 저장하면 서버가 거부하기 때문.
            const rehostResponse = await fetch("/api/upload/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrl: preview }),
            })
            if (!rehostResponse.ok) {
              const error = await rehostResponse.json()
              throw new Error(
                error.error ||
                  "대표 이미지를 가져오지 못했습니다. 이미지를 제거하거나 직접 업로드해 주세요."
              )
            }
            const { url } = await rehostResponse.json()
            imageUrl = url
          }
        }
        if (!imageUrl && state.content) {
          imageUrl = extractFirstImageSrcFromTipTapJSON(state.content)
        }

        const url = editId ? `/api/posts/${editId}` : "/api/posts"
        const method = editId ? "PATCH" : "POST"
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            community_slug: state.selectedCommunity,
            title: state.title,
            content: state.content,
            image: imageUrl,
            flair_id: state.selectedFlair || null,
            flair_team_id: state.selectedTeamFlair || null,
            is_notice: isNoticeMode,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(
            error.error || (editId ? "글 수정에 실패했습니다." : "글 작성에 실패했습니다.")
          )
        }

        const result = await response.json()
        if (!editId) {
          trackEvent({ name: "first_post", params: { community: state.selectedCommunity } })
        }
        router.push(editId ? `/post/${editId}` : `/post/${result.id}`)
      } catch (error) {
        toast({
          variant: "destructive",
          title: "오류",
          description: error instanceof Error ? error.message : "글 작성 중 오류가 발생했습니다.",
        })
      } finally {
        dispatch({ type: "SET_FIELD", field: "isSubmitting", value: false })
      }
    },
    [state, dispatch, editId, router, isNoticeMode]
  )

  return { handleSubmit }
}

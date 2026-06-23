import { useCallback, type Dispatch } from "react"
import type { EditorAction } from "@/hooks/use-write-form"

/**
 * 소스 URL → OG 프리뷰 (Phase 4b — use-write-editor 에서 추출, 동작 변경 0).
 */
export function useWriteOg(title: string, dispatch: Dispatch<EditorAction>) {
  const handleFetchOg = useCallback(
    async (url: string): Promise<{ summary: string[] | null; siteName?: string } | null> => {
      if (!url.trim()) return null
      let finalUrl = url.trim()
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl

      const imageExtRegex = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico)(\?.*)?$/i
      if (imageExtRegex.test(finalUrl)) {
        dispatch({ type: "SET_IMAGE", preview: finalUrl, file: null })
        dispatch({ type: "RESET_OG" })
        return null
      }

      dispatch({ type: "SET_FIELD", field: "isFetchingOg", value: true })
      dispatch({ type: "SET_FIELD", field: "ogData", value: null })
      try {
        // summarize=1 → 서버가 본문을 gpt-4o-mini 로 3줄 요약해서 함께 반환
        const res = await fetch(`/api/og?url=${encodeURIComponent(finalUrl)}&summarize=1`)
        if (!res.ok) throw new Error("OG 정보를 가져올 수 없습니다.")
        const data = await res.json()

        if (data.image) dispatch({ type: "SET_IMAGE", preview: data.image, file: null })
        dispatch({
          type: "SET_FIELD",
          field: "ogData",
          value: { title: data.title, description: data.description, siteName: data.siteName },
        })

        if (!title && data.title) dispatch({ type: "SET_FIELD", field: "title", value: data.title })

        return {
          summary: Array.isArray(data.summary) ? data.summary : null,
          siteName: data.siteName,
        }
      } catch {
        return null
      } finally {
        dispatch({ type: "SET_FIELD", field: "isFetchingOg", value: false })
      }
    },
    [title, dispatch]
  )

  return { handleFetchOg }
}

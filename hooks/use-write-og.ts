import { useCallback, type Dispatch } from "react"
import type { EditorAction } from "@/hooks/use-write-form"

/**
 * 소스 URL → OG 프리뷰 (Phase 4b — use-write-editor 에서 추출, 동작 변경 0).
 */
export function useWriteOg(title: string, dispatch: Dispatch<EditorAction>) {
  const handleFetchOg = useCallback(
    async (url: string) => {
      if (!url.trim()) return
      let finalUrl = url.trim()
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl

      const imageExtRegex = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico)(\?.*)?$/i
      if (imageExtRegex.test(finalUrl)) {
        dispatch({ type: "SET_IMAGE", preview: finalUrl, file: null })
        dispatch({ type: "RESET_OG" })
        return
      }

      dispatch({ type: "SET_FIELD", field: "isFetchingOg", value: true })
      dispatch({ type: "SET_FIELD", field: "ogData", value: null })
      try {
        const res = await fetch(`/api/og?url=${encodeURIComponent(finalUrl)}`)
        if (!res.ok) throw new Error("OG 정보를 가져올 수 없습니다.")
        const data = await res.json()

        if (data.image) dispatch({ type: "SET_IMAGE", preview: data.image, file: null })
        dispatch({
          type: "SET_FIELD",
          field: "ogData",
          value: { title: data.title, description: data.description, siteName: data.siteName },
        })

        if (!title && data.title) dispatch({ type: "SET_FIELD", field: "title", value: data.title })
      } catch {
        // 실패해도 무시
      } finally {
        dispatch({ type: "SET_FIELD", field: "isFetchingOg", value: false })
      }
    },
    [title, dispatch]
  )

  return { handleFetchOg }
}

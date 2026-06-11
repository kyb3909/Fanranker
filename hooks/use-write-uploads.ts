import { useCallback, type Dispatch } from "react"
import { toast } from "@/hooks/use-toast"
import type { EditorAction } from "@/hooks/use-write-form"

const MAX_IMAGES_PER_UPLOAD = 10

/**
 * 글쓰기 이미지 업로드 (Phase 4b — use-write-editor 에서 추출, 동작 변경 0).
 */
export function useWriteUploads(dispatch: Dispatch<EditorAction>) {
  const handleBottomImages = useCallback(
    async (fileList: File[], insertIntoEditor: (urls: string[]) => void) => {
      const files = fileList.filter((f) => f.type.startsWith("image/"))
      if (files.length === 0) return

      if (files.length > MAX_IMAGES_PER_UPLOAD) {
        toast({
          variant: "destructive",
          title: "알림",
          description: `한 번에 최대 ${MAX_IMAGES_PER_UPLOAD}장까지 업로드할 수 있습니다.`,
        })
        return
      }

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          toast({
            variant: "destructive",
            title: "알림",
            description: `"${file.name}"은(는) 10MB를 초과합니다.`,
          })
          return
        }
      }

      dispatch({ type: "SET_FIELD", field: "isUploadingImage", value: true })
      const urls: string[] = []
      try {
        for (const file of files) {
          const formData = new FormData()
          formData.append("file", file)
          const response = await fetch("/api/upload/image", { method: "POST", body: formData })
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || "이미지 업로드에 실패했습니다.")
          }
          const { url } = await response.json()
          urls.push(url)
        }
        insertIntoEditor(urls)
      } catch (error) {
        toast({
          variant: "destructive",
          title: "오류",
          description:
            error instanceof Error ? error.message : "이미지 업로드 중 오류가 발생했습니다.",
        })
      } finally {
        dispatch({ type: "SET_FIELD", field: "isUploadingImage", value: false })
      }
    },
    [dispatch]
  )

  const handleRemoveImage = useCallback(() => {
    dispatch({ type: "SET_IMAGE", preview: null, file: null })
  }, [dispatch])

  return { handleBottomImages, handleRemoveImage }
}

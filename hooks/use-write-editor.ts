import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { useWriteForm } from "@/hooks/use-write-form"
import { useWriteUploads } from "@/hooks/use-write-uploads"
import { useWriteOg } from "@/hooks/use-write-og"
import { useWriteSubmit } from "@/hooks/use-write-submit"

/**
 * 글쓰기 합성 루트 (Phase 4b 분해 — 반환 API 불변).
 * 경계: use-write-form(폼 상태/reducer 소유) · use-write-uploads(업로드)
 * · use-write-og(OG 프리뷰) · use-write-submit(제출).
 */
export function useWriteEditor() {
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()

  const {
    state,
    dispatch,
    editId,
    isNoticeMode,
    communities,
    canSubmit,
    setSelectedCommunity,
    setTitle,
    setContent,
    setSourceUrl,
    setSelectedFlair,
    setSelectedTeamFlair,
    setIsEmbedLoading,
  } = useWriteForm()

  const { handleBottomImages, handleRemoveImage } = useWriteUploads(dispatch)
  const { handleFetchOg } = useWriteOg(state.title, dispatch)
  const { handleSubmit } = useWriteSubmit(state, dispatch, editId, router, isNoticeMode)

  return {
    isSignedIn,
    isLoaded,
    editId,
    isNoticeMode,
    communities,
    selectedCommunity: state.selectedCommunity,
    setSelectedCommunity,
    title: state.title,
    setTitle,
    content: state.content,
    setContent,
    imagePreview: state.imagePreview,
    sourceUrl: state.sourceUrl,
    setSourceUrl,
    ogData: state.ogData,
    flairs: state.flairs,
    selectedFlair: state.selectedFlair,
    setSelectedFlair,
    teamFlairs: state.teamFlairs,
    selectedTeamFlair: state.selectedTeamFlair,
    setSelectedTeamFlair,
    isSubmitting: state.isSubmitting,
    isUploadingImage: state.isUploadingImage,
    isEmbedLoading: state.isEmbedLoading,
    setIsEmbedLoading,
    isLoadingEdit: state.isLoadingEdit,
    editLoadError: state.editLoadError,
    isFetchingOg: state.isFetchingOg,
    canSubmit,
    handleBottomImages,
    handleRemoveImage,
    handleFetchOg,
    handleSubmit,
    router,
  }
}

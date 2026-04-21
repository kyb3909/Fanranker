import { useReducer, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { trackEvent } from "@/lib/analytics/events"

const MAX_IMAGES_PER_UPLOAD = 10

interface Category {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  description: string | null
  parent_slug: string | null
}

interface Flair {
  id: string
  name: string
  color: string
}

interface TeamFlair {
  teamId: string
  teamName: string
  teamShortName: string
  color: string | null
  leagueId: string
}

interface OgData {
  title?: string
  description?: string
  siteName?: string
}

// ── State & Reducer ──

interface EditorState {
  selectedCommunity: string
  title: string
  content: unknown
  imagePreview: string | null
  imageFile: File | null
  sourceUrl: string
  ogData: OgData | null
  flairs: Flair[]
  selectedFlair: string | null
  teamFlairs: TeamFlair[]
  selectedTeamFlair: string | null
  isSubmitting: boolean
  isUploadingImage: boolean
  isEmbedLoading: boolean
  isLoadingEdit: boolean
  isFetchingOg: boolean
  editLoadError: string | null
}

type EditorAction =
  | { type: "SET_FIELD"; field: keyof EditorState; value: unknown }
  | { type: "SET_IMAGE"; preview: string | null; file: File | null }
  | {
      type: "LOAD_EDIT_SUCCESS"
      community: string
      title: string
      content: unknown
      image: string | null
    }
  | { type: "LOAD_EDIT_ERROR"; error: string }
  | { type: "SET_FLAIRS"; flairs: Flair[] }
  | { type: "SET_TEAM_FLAIRS"; teamFlairs: TeamFlair[] }
  | { type: "RESET_OG" }

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value }
    case "SET_IMAGE":
      return { ...state, imagePreview: action.preview, imageFile: action.file }
    case "LOAD_EDIT_SUCCESS":
      return {
        ...state,
        selectedCommunity: action.community,
        title: action.title,
        content: action.content,
        imagePreview: action.image,
        isLoadingEdit: false,
        editLoadError: null,
      }
    case "LOAD_EDIT_ERROR":
      return { ...state, isLoadingEdit: false, editLoadError: action.error }
    case "SET_FLAIRS":
      return { ...state, flairs: action.flairs, selectedFlair: null }
    case "SET_TEAM_FLAIRS":
      return { ...state, teamFlairs: action.teamFlairs, selectedTeamFlair: null }
    case "RESET_OG":
      return { ...state, ogData: null, isFetchingOg: false }
    default:
      return state
  }
}

// ── Hook ──

export function useWriteEditor() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isSignedIn, isLoaded } = useAuth()
  const communitySlug = searchParams.get("community") || ""
  const editId = searchParams.get("edit") || ""

  const { data: catData } = useSWR<{ categories: Category[] }>("/api/categories", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  const communities = catData?.categories || []

  const [state, dispatch] = useReducer(editorReducer, {
    selectedCommunity: communitySlug,
    title: "",
    content: null,
    imagePreview: null,
    imageFile: null,
    sourceUrl: "",
    ogData: null,
    flairs: [],
    selectedFlair: null,
    teamFlairs: [],
    selectedTeamFlair: null,
    isSubmitting: false,
    isUploadingImage: false,
    isEmbedLoading: false,
    isLoadingEdit: !!editId,
    isFetchingOg: false,
    editLoadError: null,
  })

  useEffect(() => {
    if (communitySlug)
      dispatch({ type: "SET_FIELD", field: "selectedCommunity", value: communitySlug })
  }, [communitySlug])

  // 게시판 변경 시 말머리 + 팀 플레어 목록 병렬 로드
  useEffect(() => {
    if (!state.selectedCommunity) {
      dispatch({ type: "SET_FLAIRS", flairs: [] })
      dispatch({ type: "SET_TEAM_FLAIRS", teamFlairs: [] })
      return
    }
    fetch(`/api/flairs?community_slug=${state.selectedCommunity}`)
      .then((res) => res.json())
      .then((data) => dispatch({ type: "SET_FLAIRS", flairs: data.flairs || [] }))
      .catch(() => dispatch({ type: "SET_FLAIRS", flairs: [] }))

    // 팀 플레어 — 스포츠 커뮤니티만 대응 (API가 빈 배열 반환 시 드롭다운 숨김)
    fetch(`/api/metaverse/teams?community_slug=${state.selectedCommunity}`)
      .then((res) => res.json())
      .then((data) => dispatch({ type: "SET_TEAM_FLAIRS", teamFlairs: data.teams || [] }))
      .catch(() => dispatch({ type: "SET_TEAM_FLAIRS", teamFlairs: [] }))
  }, [state.selectedCommunity])

  // 수정 모드: 기존 글 로드
  useEffect(() => {
    if (!editId) return
    dispatch({ type: "SET_FIELD", field: "isLoadingEdit", value: true })
    fetch(`/api/posts/${editId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("글을 불러올 수 없습니다."))))
      .then((data) => {
        const p = data.post
        dispatch({
          type: "LOAD_EDIT_SUCCESS",
          community: p.community_slug || "",
          title: p.title || "",
          content: p.content || null,
          image: p.image || null,
        })
      })
      .catch((err) =>
        dispatch({
          type: "LOAD_EDIT_ERROR",
          error: err.message || "글을 불러오는 데 실패했습니다.",
        })
      )
  }, [editId])

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
    []
  )

  const handleRemoveImage = useCallback(() => {
    dispatch({ type: "SET_IMAGE", preview: null, file: null })
  }, [])

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

        if (!state.title && data.title)
          dispatch({ type: "SET_FIELD", field: "title", value: data.title })
      } catch {
        // 실패해도 무시
      } finally {
        dispatch({ type: "SET_FIELD", field: "isFetchingOg", value: false })
      }
    },
    [state.title]
  )

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
        if (state.imagePreview) {
          if (
            state.imagePreview.startsWith("http://") ||
            state.imagePreview.startsWith("https://")
          ) {
            imageUrl = state.imagePreview
          } else if (state.imageFile) {
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
    [state, editId, router]
  )

  const canSubmit =
    !state.isSubmitting &&
    !state.isEmbedLoading &&
    !!state.selectedCommunity &&
    !!state.title &&
    !!state.content &&
    !(
      typeof state.content === "object" &&
      state.content !== null &&
      "content" in state.content &&
      (!Array.isArray((state.content as { content: unknown[] }).content) ||
        (state.content as { content: unknown[] }).content.length === 0)
    )

  // Setter helpers for external components
  const setSelectedCommunity = (v: string) =>
    dispatch({ type: "SET_FIELD", field: "selectedCommunity", value: v })
  const setTitle = (v: string) => dispatch({ type: "SET_FIELD", field: "title", value: v })
  const setContent = (v: unknown) => dispatch({ type: "SET_FIELD", field: "content", value: v })
  const setSourceUrl = (v: string) => dispatch({ type: "SET_FIELD", field: "sourceUrl", value: v })
  const setSelectedFlair = (v: string | null) =>
    dispatch({ type: "SET_FIELD", field: "selectedFlair", value: v })
  const setSelectedTeamFlair = (v: string | null) =>
    dispatch({ type: "SET_FIELD", field: "selectedTeamFlair", value: v })
  const setIsEmbedLoading = (v: boolean) =>
    dispatch({ type: "SET_FIELD", field: "isEmbedLoading", value: v })

  return {
    isSignedIn,
    isLoaded,
    editId,
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

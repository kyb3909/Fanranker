import { useReducer, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

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

export interface EditorState {
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

export type EditorAction =
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

/**
 * 에디터 폼 상태 (Phase 4b — use-write-editor 에서 추출, 동작 변경 0).
 * 단일 reducer 소유자 — 다른 write 서브 훅은 (state, dispatch) 를 받는다.
 */
export function useWriteForm() {
  const searchParams = useSearchParams()
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
    state,
    dispatch,
    editId,
    communities,
    canSubmit,
    setSelectedCommunity,
    setTitle,
    setContent,
    setSourceUrl,
    setSelectedFlair,
    setSelectedTeamFlair,
    setIsEmbedLoading,
  }
}

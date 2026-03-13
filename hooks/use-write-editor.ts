import { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
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

interface OgData {
  title?: string
  description?: string
  siteName?: string
}

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

  const [selectedCommunity, setSelectedCommunity] = useState(communitySlug)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState<unknown>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isEmbedLoading, setIsEmbedLoading] = useState(false)
  const [isLoadingEdit, setIsLoadingEdit] = useState(!!editId)
  const [editLoadError, setEditLoadError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState("")
  const [isFetchingOg, setIsFetchingOg] = useState(false)
  const [ogData, setOgData] = useState<OgData | null>(null)
  const [flairs, setFlairs] = useState<Flair[]>([])
  const [selectedFlair, setSelectedFlair] = useState<string | null>(null)

  useEffect(() => {
    if (communitySlug) setSelectedCommunity(communitySlug)
  }, [communitySlug])

  // 게시판 변경 시 말머리 목록 로드
  useEffect(() => {
    if (!selectedCommunity) {
      setFlairs([])
      setSelectedFlair(null)
      return
    }
    fetch(`/api/flairs?community_slug=${selectedCommunity}`)
      .then((res) => res.json())
      .then((data) => {
        setFlairs(data.flairs || [])
        setSelectedFlair(null)
      })
      .catch(() => setFlairs([]))
  }, [selectedCommunity])

  useEffect(() => {
    if (!editId) return
    setIsLoadingEdit(true)
    setEditLoadError(null)
    fetch(`/api/posts/${editId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("글을 불러올 수 없습니다."))))
      .then((data) => {
        const p = data.post
        setSelectedCommunity(p.community_slug || "")
        setTitle(p.title || "")
        setContent(p.content || null)
        setImagePreview(p.image || null)
      })
      .catch((err) => {
        setEditLoadError(err.message || "글을 불러오는 데 실패했습니다.")
      })
      .finally(() => setIsLoadingEdit(false))
  }, [editId])

  const handleImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("파일 크기는 10MB를 초과할 수 없습니다.")
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(file)
    setImageFile(file)

    setIsUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/upload/image", { method: "POST", body: formData })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "이미지 업로드에 실패했습니다.")
      }
      const { url } = await response.json()
      setImagePreview(url)
    } catch (error) {
      alert(error instanceof Error ? error.message : "이미지 업로드 중 오류가 발생했습니다.")
      setImagePreview(null)
      setImageFile(null)
    } finally {
      setIsUploadingImage(false)
    }
  }, [])

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null)
    setImageFile(null)
  }, [])

  const handleFetchOg = useCallback(
    async (url: string) => {
      if (!url.trim()) return
      let finalUrl = url.trim()
      if (!/^https?:\/\//i.test(finalUrl)) finalUrl = "https://" + finalUrl

      const imageExtRegex = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico)(\?.*)?$/i
      if (imageExtRegex.test(finalUrl)) {
        setImagePreview(finalUrl)
        setImageFile(null)
        setOgData(null)
        return
      }

      setIsFetchingOg(true)
      setOgData(null)
      try {
        const res = await fetch(`/api/og?url=${encodeURIComponent(finalUrl)}`)
        if (!res.ok) throw new Error("OG 정보를 가져올 수 없습니다.")
        const data = await res.json()

        if (data.image) {
          setImagePreview(data.image)
          setImageFile(null)
        }
        setOgData({ title: data.title, description: data.description, siteName: data.siteName })

        if (!title && data.title) setTitle(data.title)
      } catch {
        // 실패해도 무시 - 사용자가 직접 이미지 업로드 가능
      } finally {
        setIsFetchingOg(false)
      }
    },
    [title]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedCommunity || !title || !content) {
        alert("모든 필드를 입력해주세요.")
        return
      }
      if (
        typeof content === "object" &&
        content !== null &&
        (!("content" in content) ||
          !Array.isArray((content as { content: unknown[] }).content) ||
          (content as { content: unknown[] }).content.length === 0)
      ) {
        alert("내용을 입력해주세요.")
        return
      }

      setIsSubmitting(true)
      try {
        let imageUrl = null
        if (imagePreview) {
          if (imagePreview.startsWith("http://") || imagePreview.startsWith("https://")) {
            imageUrl = imagePreview
          } else if (imageFile) {
            const formData = new FormData()
            formData.append("file", imageFile)
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

        const url = editId ? `/api/posts/${editId}` : "/api/posts"
        const method = editId ? "PATCH" : "POST"
        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            community_slug: selectedCommunity,
            title,
            content,
            image: imageUrl,
            flair_id: selectedFlair || null,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(
            error.error || (editId ? "글 수정에 실패했습니다." : "글 작성에 실패했습니다.")
          )
        }

        router.push(editId ? `/post/${editId}` : `/community/${selectedCommunity}`)
      } catch (error) {
        alert(error instanceof Error ? error.message : "글 작성 중 오류가 발생했습니다.")
      } finally {
        setIsSubmitting(false)
      }
    },
    [selectedCommunity, title, content, imagePreview, imageFile, editId, selectedFlair, router]
  )

  const canSubmit =
    !isSubmitting &&
    !isEmbedLoading &&
    !!selectedCommunity &&
    !!title &&
    !!content &&
    !(
      typeof content === "object" &&
      content !== null &&
      "content" in content &&
      (!Array.isArray((content as { content: unknown[] }).content) ||
        (content as { content: unknown[] }).content.length === 0)
    )

  return {
    // Auth
    isSignedIn,
    isLoaded,
    // Data
    editId,
    communities,
    // Form state
    selectedCommunity,
    setSelectedCommunity,
    title,
    setTitle,
    content,
    setContent: setContent as (v: unknown) => void,
    imagePreview,
    sourceUrl,
    setSourceUrl,
    ogData,
    flairs,
    selectedFlair,
    setSelectedFlair,
    // Loading states
    isSubmitting,
    isUploadingImage,
    isEmbedLoading,
    setIsEmbedLoading,
    isLoadingEdit,
    editLoadError,
    isFetchingOg,
    canSubmit,
    // Handlers
    handleImageChange,
    handleRemoveImage,
    handleFetchOg,
    handleSubmit,
    router,
  }
}

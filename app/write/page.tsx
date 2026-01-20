"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/header"
import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Image as ImageIcon, X, Loader2 } from "lucide-react"
import Image from "next/image"
import { TipTapEditor } from "@/components/tiptap-editor"

const COMMUNITIES = [
  { slug: "overseas-football", name: "해외축구" },
  { slug: "baseball", name: "야구" },
  { slug: "basketball", name: "농구" },
  { slug: "free-board", name: "자유게시판" },
  { slug: "esports", name: "e스포츠" },
  { slug: "domestic-football", name: "국내축구" },
  { slug: "volleyball", name: "배구" },
  { slug: "tips", name: "정보게시판" },
]

export default function WritePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const communitySlug = searchParams.get("community") || ""
  
  const [selectedCommunity, setSelectedCommunity] = useState(communitySlug)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState<any>(null) // TipTap JSON content
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null) // 원본 파일
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  useEffect(() => {
    if (communitySlug) {
      setSelectedCommunity(communitySlug)
    }
  }, [communitySlug])

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 타입 검증
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB를 초과할 수 없습니다.')
      return
    }

    // 미리보기를 위한 base64 변환
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    // 원본 파일 저장
    setImageFile(file)

    // 자동으로 Supabase Storage에 업로드
    setIsUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '이미지 업로드에 실패했습니다.')
      }

      const { url } = await response.json()
      setImagePreview(url) // URL로 교체 (업로드된 이미지 URL)
    } catch (error) {
      console.error('Image upload error:', error)
      alert(error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.')
      setImagePreview(null)
      setImageFile(null)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleRemoveImage = () => {
    setImagePreview(null)
    setImageFile(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 유효성 검사
    if (!selectedCommunity || !title || !content) {
      alert("모든 필드를 입력해주세요.")
      return
    }

    // TipTap JSON이 비어있는지 확인
    if (typeof content === 'object' && (!content.content || content.content.length === 0)) {
      alert("내용을 입력해주세요.")
      return
    }

    setIsSubmitting(true)

    try {
      // imagePreview가 이미 URL인지 base64인지 확인
      // Supabase Storage URL인 경우 그대로 사용, base64인 경우는 업로드 필요
      let imageUrl = null
      if (imagePreview) {
        if (imagePreview.startsWith('http://') || imagePreview.startsWith('https://')) {
          // 이미 업로드된 URL
          imageUrl = imagePreview
        } else if (imageFile) {
          // base64인 경우 업로드
          const formData = new FormData()
          formData.append('file', imageFile)

          const uploadResponse = await fetch('/api/upload/image', {
            method: 'POST',
            body: formData,
          })

          if (!uploadResponse.ok) {
            const error = await uploadResponse.json()
            throw new Error(error.error || '이미지 업로드에 실패했습니다.')
          }

          const { url } = await uploadResponse.json()
          imageUrl = url
        } else {
          // base64 데이터 URL (구버전 호환성)
          console.warn('Base64 이미지가 감지되었습니다. 파일을 다시 선택해주세요.')
          imageUrl = null
        }
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          community_slug: selectedCommunity,
          title,
          content, // TipTap JSON
          image: imageUrl, // 이미지 URL
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '글 작성에 실패했습니다.')
      }

      const data = await response.json()
      console.log('글 작성 성공:', data)

      // 목록 페이지로 리다이렉트
      router.push(`/community/${selectedCommunity}`)
    } catch (error) {
      console.error('글 작성 오류:', error)
      alert(error instanceof Error ? error.message : '글 작성 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto px-4 sm:px-6 py-5 sm:py-6 max-w-full sm:max-w-[600px] lg:max-w-[1280px]">
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 lg:col-span-9 space-y-4">
            <BackButton />

            <Card className="border border-border bg-card p-6">
              <h1 className="text-2xl font-bold text-foreground mb-6">글쓰기</h1>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 게시판 선택 */}
                <div className="space-y-2">
                  <Label htmlFor="community" className="text-sm font-semibold text-foreground">
                    게시판 선택
                  </Label>
                  <Select value={selectedCommunity} onValueChange={setSelectedCommunity}>
                    <SelectTrigger id="community" className="h-10">
                      <SelectValue placeholder="게시판을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMUNITIES.map((community) => (
                        <SelectItem key={community.slug} value={community.slug}>
                          {community.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 제목 */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-foreground">
                    제목
                  </Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="제목을 입력하세요"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10"
                    required
                  />
                </div>

                {/* 내용 */}
                <div className="space-y-2">
                  <Label htmlFor="content" className="text-sm font-semibold text-foreground">
                    내용
                  </Label>
                  <TipTapEditor
                    content={content}
                    onChange={(json) => setContent(json)}
                    placeholder="내용을 입력하세요. YouTube, Instagram, X 링크를 붙여넣으면 자동으로 임베드됩니다."
                  />
                </div>

                {/* 이미지 업로드 */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">이미지</Label>
                  {!imagePreview ? (
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                      <label
                        htmlFor="image-upload"
                        className={`cursor-pointer flex flex-col items-center gap-2 ${isUploadingImage ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        {isUploadingImage ? (
                          <>
                            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                            <span className="text-sm text-muted-foreground">
                              이미지 업로드 중...
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              이미지를 클릭하거나 드래그하여 업로드
                            </span>
                          </>
                        )}
                        <input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          disabled={isUploadingImage}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
                      <Image
                        src={imagePreview}
                        alt="Preview"
                        fill
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={handleRemoveImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* 버튼 */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => window.history.back()}>
                    취소
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={
                      isSubmitting || 
                      !selectedCommunity || 
                      !title || 
                      !content || 
                      (typeof content === 'object' && (!content.content || content.content.length === 0))
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        작성 중...
                      </>
                    ) : (
                      '작성하기'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}


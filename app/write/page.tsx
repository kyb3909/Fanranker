"use client"

import { Suspense, useRef, useCallback } from "react"
import dynamic from "next/dynamic"
import type { TipTapEditorHandle } from "@/components/editor/tiptap-editor"
import { BackButton } from "@/components/back-button"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Image as ImageIcon, X, Loader2, Link as LinkIcon } from "lucide-react"
import Image from "next/image"
import { useWriteEditor } from "@/hooks/use-write-editor"
import { SignIn } from "@clerk/nextjs"

const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((mod) => ({ default: mod.TipTapEditor })),
  { ssr: false, loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" /> }
)

function WriteContent() {
  const editor = useWriteEditor()
  const tiptapRef = useRef<TipTapEditorHandle>(null)

  const insertBodyImages = useCallback((urls: string[]) => {
    tiptapRef.current?.insertImagesFromUrls(urls)
  }, [])

  const onBottomImageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      e.target.value = ""
      void editor.handleBottomImages(files, insertBodyImages)
    },
    [editor, insertBodyImages]
  )

  const onBottomImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const files = Array.from(e.dataTransfer.files)
      void editor.handleBottomImages(files, insertBodyImages)
    },
    [editor, insertBodyImages]
  )

  const onBottomImageDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  if (!editor.isLoaded) {
    return (
      <main
        id="main-content"
        className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">로딩 중...</p>
        </div>
      </main>
    )
  }

  if (!editor.isSignedIn) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/write"
          signUpUrl="/sign-up"
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-md",
            },
          }}
        />
      </div>
    )
  }

  if (editor.isLoadingEdit) {
    return (
      <main
        id="main-content"
        className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">글을 불러오는 중...</p>
        </div>
      </main>
    )
  }

  if (editor.editLoadError) {
    return (
      <main
        id="main-content"
        className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="bg-card border-border rounded-lg border p-8 text-center">
          <p className="text-destructive mb-2 text-sm">{editor.editLoadError}</p>
          <Button variant="outline" onClick={() => editor.router.push("/")}>
            홈으로
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main
      id="main-content"
      className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
      tabIndex={-1}
    >
      <div className="grid grid-cols-12 gap-5 lg:gap-6">
        <div className="col-span-12 space-y-4 lg:col-span-9">
          <BackButton />

          <Card className="border-border bg-card border p-6">
            <h1 className="text-foreground mb-6 text-2xl font-bold">
              {editor.editId ? "글 수정" : "글쓰기"}
            </h1>

            <form onSubmit={editor.handleSubmit} className="space-y-6">
              {/* 게시판 선택 */}
              <div className="space-y-2">
                <Label htmlFor="community" className="text-foreground text-sm font-semibold">
                  게시판 선택
                </Label>
                <Select
                  value={editor.selectedCommunity}
                  onValueChange={editor.setSelectedCommunity}
                >
                  <SelectTrigger id="community" className="h-10">
                    <SelectValue placeholder="게시판을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {editor.communities
                      .filter((c) => !c.parent_slug)
                      .map((parent) => {
                        const channels = editor.communities.filter(
                          (c) => c.parent_slug === parent.slug
                        )
                        return (
                          <div key={parent.slug}>
                            <SelectItem value={parent.slug}>
                              {parent.icon ? `${parent.icon} ` : ""}
                              {parent.name}
                            </SelectItem>
                            {channels.map((ch) => (
                              <SelectItem key={ch.slug} value={ch.slug} className="pl-8">
                                <span className="text-muted-foreground mr-1">└</span>
                                {ch.icon ? `${ch.icon} ` : ""}
                                {ch.name}
                              </SelectItem>
                            ))}
                          </div>
                        )
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* 말머리 선택 */}
              {editor.flairs.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-foreground text-sm font-semibold">
                    말머리 <span className="text-muted-foreground font-normal">(선택)</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {editor.flairs.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          editor.setSelectedFlair(editor.selectedFlair === f.id ? null : f.id)
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                          editor.selectedFlair === f.id
                            ? "text-white shadow-sm"
                            : "hover:opacity-80"
                        }`}
                        style={{
                          backgroundColor: editor.selectedFlair === f.id ? f.color : `${f.color}15`,
                          color: editor.selectedFlair === f.id ? "white" : f.color,
                        }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 소스 URL */}
              <div className="space-y-2">
                <Label htmlFor="source-url" className="text-foreground text-sm font-semibold">
                  소스 URL <span className="text-muted-foreground font-normal">(선택)</span>
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                      id="source-url"
                      type="text"
                      placeholder="뉴스나 기사 URL을 붙여넣으면 이미지를 자동으로 가져옵니다"
                      value={editor.sourceUrl}
                      onChange={(e) => editor.setSourceUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          editor.handleFetchOg(editor.sourceUrl)
                        }
                      }}
                      onPaste={(e) => {
                        const pasted = e.clipboardData.getData("text")
                        if (pasted && /^https?:\/\//i.test(pasted.trim())) {
                          setTimeout(() => editor.handleFetchOg(pasted.trim()), 100)
                        }
                      }}
                      className="h-10 pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => editor.handleFetchOg(editor.sourceUrl)}
                    disabled={editor.isFetchingOg || !editor.sourceUrl.trim()}
                    className="shrink-0"
                  >
                    {editor.isFetchingOg ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "가져오기"
                    )}
                  </Button>
                </div>
                {editor.ogData?.siteName && (
                  <p className="text-muted-foreground text-xs">출처: {editor.ogData.siteName}</p>
                )}
              </div>

              {/* 제목 */}
              <div className="space-y-2">
                <Label htmlFor="title" className="text-foreground text-sm font-semibold">
                  제목
                </Label>
                <Input
                  id="title"
                  type="text"
                  placeholder="제목을 입력하세요"
                  value={editor.title}
                  onChange={(e) => editor.setTitle(e.target.value)}
                  className="h-10"
                  required
                />
              </div>

              {/* 내용 */}
              <div className="space-y-2">
                <Label htmlFor="content" className="text-foreground text-sm font-semibold">
                  내용
                </Label>
                <TipTapEditor
                  ref={tiptapRef}
                  content={editor.content}
                  onChange={(json: unknown) => editor.setContent(json)}
                  onEmbedLoading={editor.setIsEmbedLoading}
                  placeholder="내용을 입력하세요. YouTube, Instagram, X 링크를 붙여넣으면 자동으로 임베드됩니다."
                />
              </div>

              {/* 이미지: 소스 URL 등으로 지정한 대표 이미지 + 본문 삽입용 업로드 */}
              <div className="space-y-2">
                <Label className="text-foreground text-sm font-semibold">이미지</Label>
                {editor.imagePreview && (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs">
                      대표 이미지 (소스 URL·수정 시 기존 썸네일)
                    </p>
                    <div className="border-border relative aspect-video w-full max-w-md overflow-hidden rounded-lg border">
                      <Image
                        src={editor.imagePreview}
                        alt="대표 이미지"
                        fill
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={editor.handleRemoveImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <div
                  className="border-border rounded-lg border-2 border-dashed p-6 text-center"
                  onDragOver={onBottomImageDragOver}
                  onDrop={onBottomImageDrop}
                >
                  <label
                    htmlFor="image-upload"
                    className={`flex cursor-pointer flex-col items-center gap-2 ${editor.isUploadingImage ? "pointer-events-none opacity-50" : ""}`}
                  >
                    {editor.isUploadingImage ? (
                      <>
                        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                        <span className="text-muted-foreground text-sm">이미지 업로드 중...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="text-muted-foreground h-8 w-8" />
                        <span className="text-muted-foreground text-sm">
                          클릭 또는 드래그로 본문에 이미지 삽입
                        </span>
                        <span className="text-muted-foreground text-xs">
                          한 번에 최대 10장 · 각 파일 10MB 이하
                        </span>
                      </>
                    )}
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={onBottomImageInputChange}
                      disabled={editor.isUploadingImage}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* 버튼 */}
              <div className="border-border flex items-center justify-end gap-3 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => window.history.back()}>
                  취소
                </Button>
                <Button type="submit" disabled={!editor.canSubmit}>
                  {editor.isEmbedLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      임베드 로딩 중...
                    </>
                  ) : editor.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      작성 중...
                    </>
                  ) : editor.editId ? (
                    "수정하기"
                  ) : (
                    "작성하기"
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </main>
  )
}

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
          tabIndex={-1}
        >
          <div className="bg-card border-border rounded-lg border p-8 text-center">
            <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">로딩 중...</p>
          </div>
        </main>
      }
    >
      <WriteContent />
    </Suspense>
  )
}

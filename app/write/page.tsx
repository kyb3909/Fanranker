"use client"

import { Suspense, useRef, useCallback, useState, useEffect } from "react"
import dynamic from "next/dynamic"
import type { TipTapEditorHandle } from "@/components/editor/tiptap-editor"
import { BackButton } from "@/components/back-button"
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
import { Image as ImageIcon, X, Loader2, Link as LinkIcon, Megaphone } from "lucide-react"
import { useWriteEditor } from "@/hooks/use-write-editor"
import { NoticeToggleButton } from "@/components/write/notice-toggle-button"
import { useCanPostNotice } from "@/hooks/use-board-moderator"

const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((mod) => ({ default: mod.TipTapEditor })),
  { ssr: false, loading: () => <div className="bg-muted h-64 animate-pulse rounded-lg" /> }
)

// SignIn form은 비로그인 분기에서만 필요 — 로그인한 일반 사용자는 로드하지 않음.
const SignIn = dynamic(() => import("@clerk/nextjs").then((m) => ({ default: m.SignIn })), {
  ssr: false,
  loading: () => <div className="bg-muted h-96 w-full max-w-md animate-pulse rounded-lg" />,
})

function WriteContent() {
  const editor = useWriteEditor()
  const canPostNotice = useCanPostNotice(editor.selectedCommunity)
  const noticeMode = editor.isNoticeMode && canPostNotice
  const tiptapRef = useRef<TipTapEditorHandle>(null)

  const insertBodyImages = useCallback((urls: string[]) => {
    tiptapRef.current?.insertImagesFromUrls(urls)
  }, [])

  // 대표 이미지 미리보기 로드 실패 (외부 핫링킹 차단 등) → placeholder 로 폴백
  const [previewError, setPreviewError] = useState(false)
  useEffect(() => setPreviewError(false), [editor.imagePreview])

  // 소스 URL "가져오기" → OG 메타 + 본문 3줄 요약을 빈 본문에 자동 삽입
  const fetchOgAndSummarize = useCallback(
    async (rawUrl: string) => {
      const result = await editor.handleFetchOg(rawUrl)
      if (result?.summary && result.summary.length > 0) {
        tiptapRef.current?.insertSummary(result.summary)
      }
    },
    [editor]
  )

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
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <Loader2
            className="mx-auto mb-2 h-8 w-8 animate-spin"
            style={{ color: "var(--wc-mute)" }}
          />
          <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
            로딩 중...
          </p>
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
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <Loader2
            className="mx-auto mb-2 h-8 w-8 animate-spin"
            style={{ color: "var(--wc-mute)" }}
          />
          <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
            글을 불러오는 중...
          </p>
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
        <div
          className="rounded-xl p-8 text-center"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <p className="text-destructive mb-2 text-sm">{editor.editLoadError}</p>
          <Button variant="outline" onClick={() => editor.router.push("/")}>
            홈으로
          </Button>
        </div>
      </main>
    )
  }

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <main
        id="main-content"
        className="mx-auto max-w-full px-4 py-5 sm:max-w-[600px] sm:px-6 sm:py-6 lg:max-w-[1280px]"
        tabIndex={-1}
      >
        <div className="grid grid-cols-12 gap-5 lg:gap-6">
          <div className="col-span-12 space-y-4 lg:col-span-9">
            <BackButton />

            <div
              className="rounded-xl"
              style={{
                background: "var(--wc-card)",
                boxShadow: "var(--wc-shadow-1)",
                padding: "20px 22px 24px",
              }}
            >
              <form onSubmit={editor.handleSubmit} className="space-y-6">
                {noticeMode && (
                  <div
                    className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--wc-burgundy) 10%, transparent)",
                      color: "var(--wc-burgundy)",
                      border: "1px solid color-mix(in srgb, var(--wc-burgundy) 30%, transparent)",
                    }}
                  >
                    <Megaphone className="h-4 w-4" />이 글은 공지로 등록됩니다 — 게시판 상단 고정
                  </div>
                )}
                {/* 게시판 선택 */}
                <div className="space-y-2">
                  <Label
                    htmlFor="community"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--wc-mute)" }}
                  >
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
                    <Label className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
                      말머리 <span className="text-muted-foreground font-normal">(선택)</span>
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {editor.flairs.map((f) => {
                        const selected = editor.selectedFlair === f.id
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => editor.setSelectedFlair(selected ? null : f.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                              selected ? "text-white shadow-sm" : "hover:opacity-80"
                            }`}
                            style={{
                              backgroundColor: selected ? "var(--wc-ink)" : "var(--wc-card, #fff)",
                              color: selected ? "white" : "var(--wc-ink)",
                              border: "1px solid",
                              borderColor: selected ? "var(--wc-ink)" : "var(--wc-line)",
                            }}
                          >
                            {f.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 소스 URL */}
                <div className="space-y-2">
                  <Label
                    htmlFor="source-url"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    소스 URL <span className="text-muted-foreground font-normal">(선택)</span>
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                      <Input
                        id="source-url"
                        type="text"
                        placeholder="뉴스나 기사 링크를 붙여넣으면 대표 이미지를 자동으로 가져와요"
                        value={editor.sourceUrl}
                        onChange={(e) => editor.setSourceUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            fetchOgAndSummarize(editor.sourceUrl)
                          }
                        }}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData("text")
                          if (pasted && /^https?:\/\//i.test(pasted.trim())) {
                            setTimeout(() => fetchOgAndSummarize(pasted.trim()), 100)
                          }
                        }}
                        className="h-10 pl-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fetchOgAndSummarize(editor.sourceUrl)}
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
                  <Label
                    htmlFor="title"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    제목
                  </Label>
                  <input
                    id="title"
                    type="text"
                    placeholder="제목을 입력하세요"
                    value={editor.title}
                    onChange={(e) => editor.setTitle(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      height: 52,
                      padding: "0 16px",
                      fontSize: 17,
                      fontWeight: 700,
                      fontFamily: "var(--font-sans)",
                      border: "1px solid var(--wc-line-2)",
                      borderRadius: 12,
                      outline: "none",
                      background: "var(--wc-paper)",
                      color: "var(--wc-ink)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--wc-burgundy)"
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--wc-line-2)"
                    }}
                  />
                </div>

                {/* 내용 */}
                <div className="space-y-2">
                  <Label
                    htmlFor="content"
                    className="text-[12px] font-bold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    내용
                  </Label>
                  <TipTapEditor
                    ref={tiptapRef}
                    content={editor.content}
                    onChange={(json: unknown) => editor.setContent(json)}
                    onEmbedLoading={editor.setIsEmbedLoading}
                    placeholder="글을 입력하세요. YouTube, Instagram, X 링크를 붙여넣으면 자동으로 임베드돼요."
                  />
                </div>

                {/* 이미지: 소스 URL 등으로 지정한 대표 이미지 + 본문 삽입용 업로드 */}
                <div className="space-y-2">
                  <Label className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
                    이미지
                  </Label>
                  {editor.imagePreview && (
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground text-xs">
                        대표 이미지 (소스 URL·수정 시 기존 썸네일)
                      </p>
                      <div
                        className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl"
                        style={{ border: "1px solid var(--wc-line-2)" }}
                      >
                        {previewError ? (
                          <div className="bg-muted absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
                            <ImageIcon className="h-8 w-8" style={{ color: "var(--wc-mute)" }} />
                            <span
                              className="text-center text-xs leading-relaxed"
                              style={{ color: "var(--wc-mute)" }}
                            >
                              미리보기를 불러올 수 없어요
                              <br />
                              발행하면 정상 표시됩니다
                            </span>
                          </div>
                        ) : (
                          <>
                            {/* 외부(기사 OG) 도메인은 핫링킹 차단으로 미리보기가 깨질 수 있음 —
                                onError 시 placeholder. 발행 시 use-write-submit 이 우리 Storage 로 재호스팅 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={editor.imagePreview}
                              alt="대표 이미지"
                              onError={() => setPreviewError(true)}
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          </>
                        )}
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
                    className="rounded-xl p-6 text-center"
                    style={{ border: "1px dashed var(--wc-line-2)", background: "var(--wc-paper)" }}
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
                            클릭하거나 드래그해서 본문에 이미지를 넣을 수 있어요
                          </span>
                          <span className="text-muted-foreground text-xs">
                            한 번에 최대 10장, 파일당 10MB까지 가능합니다
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
                <div
                  className="flex items-center justify-between gap-3 pt-4"
                  style={{ borderTop: "1px solid var(--wc-line)" }}
                >
                  <div>{editor.editId && <NoticeToggleButton postId={editor.editId} />}</div>
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" onClick={() => window.history.back()}>
                      취소
                    </Button>
                    <Button
                      type="submit"
                      disabled={!editor.canSubmit}
                      style={{ background: "var(--wc-burgundy)", color: "#fff", border: "none" }}
                    >
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
                      ) : noticeMode ? (
                        "공지 등록"
                      ) : (
                        "작성하기"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
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
          <div
            className="rounded-xl p-8 text-center"
            style={{
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
              boxShadow: "var(--wc-shadow-1)",
            }}
          >
            <Loader2
              className="mx-auto mb-2 h-8 w-8 animate-spin"
              style={{ color: "var(--wc-mute)" }}
            />
            <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
              로딩 중...
            </p>
          </div>
        </main>
      }
    >
      <WriteContent />
    </Suspense>
  )
}

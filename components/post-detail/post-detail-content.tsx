"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Search, Ban, Pencil, Trash2, User, Flag, ExternalLink } from "lucide-react"
import Link from "@/components/ui/app-link"
import Image from "next/image"
import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useUser } from "@clerk/nextjs"
import { toast } from "@/hooks/use-toast"
import { reportClientError } from "@/lib/client-error"
import { usePostViewTracker } from "@/hooks/use-post-view-tracker"
import { HeroPinButton } from "./hero-pin-button"
import { TitleBadge } from "@/components/profile/title-badge"
import { ImageLightbox } from "@/components/ui/image-lightbox"
import { PostActions } from "./post-actions"
import { CommentSection } from "./comment-section"
import { VsIssueWidget, IssueSummary } from "@/components/post-detail/vs-issue-widget"
import { ArticleTarotHook } from "@/components/tarot/article-tarot-hook"
import type { VsPollData } from "@/lib/news/vs-issue"
import { openReport } from "@/hooks/use-report-dialog"
import { useBlockedUsers } from "@/hooks/use-blocked-users"
import type { Post } from "@/types/post-detail"

const TipTapContent = dynamic(
  () =>
    import("@/components/editor/tiptap-content").then((mod) => ({ default: mod.TipTapContent })),
  // 스켈레톤 제거 — 본문은 서버 HTML(contentHtml)이 이미 그리고 있다. 스켈레톤을
  // 남기면 정적 본문 아래 회색 박스가 같이 떠서 이중으로 보인다.
  { ssr: false, loading: () => null }
)

interface InitialCommentsData {
  comments: {
    id: string
    user_id: string
    parent_id: string | null
    content: string
    vote_count: number
    created_at: string
    sticker_id?: string | null
    stickers?: { id: string; name: string; image_url: string } | null
  }[]
  profiles: { user_id: string; nickname: string; avatar_url: string | null }[]
  equippedTitles: {
    user_id: string
    board_slug: string
    adj_titles: { title: string; rarity: string } | null
    noun_titles: { title: string } | null
  }[]
}

export function PostDetailContent({
  post,
  initialCommentsData,
  vsPoll,
  contentHtml,
  scoreboard,
  commentsPollMs,
}: {
  post: Post
  initialCommentsData?: InitialCommentsData
  /** VS 쟁점 폴 (뉴스 게시물에만) — 3줄 요약 + 찬반 투표 + 댓글 진영 칩 */
  vsPoll?: VsPollData | null
  /** 불판 전광판 (match_game_id 글에만) — 서버가 렌더해 내려주는 슬롯 (2026-08-20) */
  scoreboard?: React.ReactNode
  /** 댓글 라이브 폴링 간격 ms (불판 라이브 창에만, A2) */
  commentsPollMs?: number
  /**
   * 서버에서 미리 렌더한 본문 HTML (lib/tiptap/render-html) — 첫 HTML 부터 본문이
   * 실리게 해 SEO 절단·스켈레톤 첫인상을 없앤다 (2026-07-30 워룸). 클라이언트
   * TipTap 이 서면(onReady) 이쪽을 내려 임베드 인터랙션으로 교대한다.
   */
  contentHtml?: string | null
}) {
  const router = useRouter()
  const { user } = useUser()
  const isAuthor = post.userId === user?.id
  const { toggleBlock } = useBlockedUsers()
  const [commentCount, setCommentCount] = useState(0)
  const [rteReady, setRteReady] = useState(false)
  const handleRteReady = useCallback(() => setRteReady(true), [])

  // 조회수 증가 (서버가 IP 기반 1시간 중복 제한 처리)
  usePostViewTracker(post.id)

  const handleCommentCountChange = useCallback((count: number) => {
    setCommentCount(count)
  }, [])

  const handleSearchByAuthor = () => {
    router.push(`/search?q=${encodeURIComponent(post.author)}&type=nickname`)
  }

  const handleBlockUser = async () => {
    if (!post.userId) return
    if (!confirm(`${post.author}님을 차단하시겠습니까?\n차단하면 이 사용자의 글이 보이지 않아요.`))
      return
    try {
      const result = await toggleBlock(post.userId)
      if (!result) {
        toast({ variant: "destructive", title: "오류", description: "차단에 실패했습니다." })
        return
      }
      toast({
        title: result.blocked ? "차단 완료" : "차단 해제",
        description: result.blocked
          ? `${post.author}님을 차단했어요.`
          : `${post.author}님 차단을 해제했어요.`,
      })
    } catch (error) {
      reportClientError("post.block", error)
      toast({ variant: "destructive", title: "오류", description: "차단 중 오류가 발생했습니다." })
    }
  }

  const handleEditPost = () => {
    router.push(`/write?edit=${post.id}`)
  }

  const handleDeletePost = async () => {
    if (!confirm("이 글을 삭제하시겠습니까?")) return
    try {
      const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "오류",
          description: data.error || "삭제에 실패했습니다.",
        })
        return
      }
      router.push("/")
      router.refresh()
    } catch (error) {
      reportClientError("post.delete", error)
      toast({ variant: "destructive", title: "오류", description: "삭제 중 오류가 발생했습니다." })
    }
  }

  // 퍼온(OG) 글 출처 — http(s) 만 링크 허용(저장형 XSS 방지). 언론사명 없으면 도메인으로 폴백.
  const sourceUrl = post.sourceUrl && /^https?:\/\//i.test(post.sourceUrl) ? post.sourceUrl : null
  const sourceLabel =
    sourceUrl &&
    (post.sourceName ||
      (() => {
        try {
          return new URL(sourceUrl).hostname.replace(/^www\./, "")
        } catch {
          return sourceUrl
        }
      })())

  return (
    <div className="space-y-4">
      <ImageLightbox />
      {/* Post Detail Card */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--wc-card)",
          border: "1px solid var(--wc-line)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex shrink-0 cursor-pointer items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={post.avatar || "/placeholder.svg"} alt={post.author} />
                      <AvatarFallback>{post.author?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span
                      className="text-[14.5px] font-extrabold hover:underline"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {post.author}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {post.userId && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href={`/profile/${post.userId}`}>
                        <User className="mr-2 h-4 w-4" />
                        <span>프로필 보기</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                    <Search className="mr-2 h-4 w-4" />
                    <span>해당 아이디로 검색</span>
                  </DropdownMenuItem>
                  {!isAuthor && (
                    <DropdownMenuItem
                      onClick={handleBlockUser}
                      className="text-destructive cursor-pointer"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      <span>차단하기</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {post.titleDisplay && (post.titleDisplay.adjTitle || post.titleDisplay.nounTitle) && (
                <TitleBadge
                  adjTitle={post.titleDisplay.adjTitle}
                  nounTitle={post.titleDisplay.nounTitle}
                  rarity={post.titleDisplay.rarity}
                  size="sm"
                />
              )}
              <span className="text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
                {post.timestamp}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full px-3 text-[12px] font-bold"
                style={{ border: "1px solid var(--wc-line-2)", color: "var(--wc-mute)" }}
              >
                {post.community}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="더보기 메뉴">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {isAuthor ? (
                    <>
                      <DropdownMenuItem onClick={handleEditPost} className="cursor-pointer">
                        <Pencil className="mr-2 h-4 w-4" />
                        수정
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleDeletePost}
                        className="text-destructive cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        삭제
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      {post.userId && (
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/profile/${post.userId}`}>
                            <User className="mr-2 h-4 w-4" />
                            프로필 보기
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={handleSearchByAuthor} className="cursor-pointer">
                        <Search className="mr-2 h-4 w-4" />
                        해당 아이디로 검색
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleBlockUser}
                        className="text-destructive cursor-pointer"
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        차단하기
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openReport("post", String(post.id))}
                        className="text-destructive cursor-pointer"
                      >
                        <Flag className="mr-2 h-4 w-4" />
                        신고하기
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-3">
            <h2
              className="font-black tracking-tight text-pretty"
              style={{
                fontSize: "clamp(20px, 3.2vw, 26px)",
                color: "var(--wc-ink)",
                letterSpacing: "-0.02em",
                lineHeight: 1.35,
                wordBreak: "keep-all",
              }}
            >
              {post.title}
            </h2>
            {/* 불판 전광판 — 제목 바로 아래, 본문 위 (2026-08-20 운영자: "게시물 안에") */}
            {scoreboard}
            {vsPoll?.summary && vsPoll.summary.length > 0 && (
              <IssueSummary summary={vsPoll.summary} />
            )}
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-80"
                style={{
                  background: "var(--wc-soft)",
                  color: "var(--wc-burgundy)",
                  border: "1px solid var(--wc-line)",
                }}
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">출처: {sourceLabel} · 원문 보기</span>
              </a>
            )}
            <div>
              {typeof post.content === "string" ? (
                <p
                  className="max-w-none"
                  style={{
                    // TipTap 본문(prose-base)과 같은 규격 — 두 분기가 달라 보이면 안 된다
                    fontSize: 16,
                    lineHeight: 1.75,
                    color: "var(--wc-ink)",
                    wordBreak: "keep-all",
                  }}
                >
                  {post.content}
                </p>
              ) : (
                // TipTap JSON 렌더링 (임베드 포함) — 서버 HTML 이 있으면 그걸 먼저
                // 보여주고, 클라이언트 에디터가 서면 교대 (스켈레톤 구간 제거)
                <>
                  {contentHtml && !rteReady && (
                    <div
                      className="prose prose-base max-w-none"
                      // 저장 시 sanitize 된 JSON → generateHTML 이스케이프 출력이라 안전
                      dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                  )}
                  <TipTapContent content={post.content} size="base" onReady={handleRteReady} />
                </>
              )}
            </div>
            {/* Image — 본문에 이미 포함된 이미지는 중복 표시하지 않음.
                봇 기사(user_bot_*)는 아예 표시하지 않는다 (2026-08-16 운영자 — 저작권:
                수집 기사 이미지는 피드 썸네일까지만, 본문에는 싣지 않는다) */}
            {!post.userId?.startsWith("user_bot_") &&
              post.image &&
              (() => {
                // 본문 JSON을 문자열화하여 이미지 URL이 포함되어 있는지 확인
                if (typeof post.content !== "string") {
                  try {
                    const bodyStr = JSON.stringify(post.content)
                    if (bodyStr.includes(post.image)) return null
                  } catch {
                    // ignore
                  }
                }
                return (
                  <div className="post-body-image mt-2 inline-block max-w-[60%] cursor-zoom-in overflow-hidden rounded-lg transition-opacity hover:opacity-90">
                    <Image
                      src={post.image}
                      alt={`${post.title} 첨부 이미지`}
                      width={700}
                      height={700}
                      className="h-auto w-full object-contain"
                      sizes="(max-width: 640px) 60vw, 420px"
                    />
                  </div>
                )
              })()}
          </div>

          {/* Actions */}
          <PostActions
            postId={post.id}
            postTitle={post.title}
            initialUpvotes={post.upvotes}
            initialIsUpvoted={post.isUpvoted}
            commentCount={commentCount}
          />

          {/* 관리자 전용 — 홈 히어로 수동 큐레이션 (권한 없으면 null 렌더) */}
          <div className="mt-2">
            <HeroPinButton postId={String(post.id)} />
          </div>

          {/* 타로 훅 — 이적설·프리뷰 제목일 때만 (2026-08-20 운영자: "이적 기사에서
              점 보는 걸로"). 본문을 다 읽은 자리, VS·댓글로 내려가기 직전 */}
          <div className="mt-3">
            <ArticleTarotHook title={post.title} />
          </div>
        </div>
      </div>

      {/* VS 쟁점 투표 — 본문을 읽고 내려온 지점에서 진영을 고르게 한다 */}
      {vsPoll && <VsIssueWidget vs={vsPoll} />}

      {/* Comments Section */}
      <CommentSection
        postId={post.id}
        onCommentCountChange={handleCommentCountChange}
        initialData={initialCommentsData}
        pollMs={commentsPollMs}
        vsFaction={
          vsPoll
            ? {
                voterMap: vsPoll.voterMap,
                labels: Object.fromEntries(vsPoll.options.map((o) => [o.key, o.label])),
              }
            : null
        }
      />
    </div>
  )
}

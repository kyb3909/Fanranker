"use client"

import { useUser, useClerk } from "@clerk/nextjs"
import { ArrowUpDown } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { EmptyScene } from "@/components/empty-scene"
import { toast } from "@/hooks/use-toast"
import { CommentItem } from "./comment-item"
import { CommentForm } from "./comment-form"
import { countAllComments } from "@/types/post-detail"
import { useBlockedUsers } from "@/hooks/use-blocked-users"
import { useComments } from "@/hooks/use-comments"
import { useIsAdmin } from "@/hooks/use-is-admin"
import type { CommentsInitialData } from "@/hooks/use-comments"

import type { VsFactionInfo } from "./comment-item"

interface CommentSectionProps {
  postId: string | number
  vsFaction?: VsFactionInfo | null
  onCommentCountChange?: (count: number) => void
  initialData?: CommentsInitialData
  /** 라이브 폴링 간격 ms (불판 전용, A2) — use-comments 로 그대로 전달 */
  pollMs?: number
  /**
   * "embedded" = 카드 프레임(면·보더·그림자·패딩) 없이 내용만. 이미 프레임이 있는 표면(떡밥 요약
   * 모달, 2026-09-18) 안에 넣을 때 — 카드 안 카드가 되지 않게. 기본은 종전 "card".
   */
  variant?: "card" | "embedded"
  /**
   * 최상위 댓글을 이 개수까지만 그린다 (요약 모달, 2026-09-18). 넘치는 만큼은 `moreHref`
   * 로 안내한다 — 모달은 반응을 붙이는 입구이고 긴 토론은 글 페이지 몫.
   */
  limit?: number
  /** limit 초과분을 이어 볼 곳 (글 페이지 #comments) */
  moreHref?: string
}

export function CommentSection({
  postId,
  onCommentCountChange,
  initialData,
  vsFaction,
  pollMs,
  variant = "card",
  limit,
  moreHref,
}: CommentSectionProps) {
  const { user, isLoaded } = useUser()
  const clerk = useClerk()
  const isAdmin = useIsAdmin()
  const { isBlocked, toggleBlock } = useBlockedUsers()

  const {
    comments,
    isLoadingComments,
    loadFailed,
    retryLoadComments,
    reloadComments,
    isSubmittingComment,
    handleCommentSubmit,
    replyingTo,
    setReplyingTo,
    replyText,
    setReplyText,
    isSubmittingReply,
    handleReplySubmit,
    commentSort,
    setCommentSort,
  } = useComments(postId, onCommentCountChange, initialData, pollMs)

  return (
    <div
      className={variant === "card" ? "rounded-xl" : undefined}
      style={
        variant === "card"
          ? {
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
              boxShadow: "var(--wc-shadow-1)",
              padding: "18px 24px 22px",
            }
          : undefined
      }
    >
      <div className="space-y-4">
        {/* embedded 표면은 바깥이 제목("이 글의 댓글 N")을 이미 달았다 — 여기선 정렬 버튼만 */}
        <div
          className={variant === "card" ? "flex items-center justify-between" : "flex justify-end"}
        >
          {variant === "card" && (
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              댓글{" "}
              <span className="tnum" style={{ color: "var(--wc-burgundy)" }}>
                {countAllComments(comments)}
              </span>
            </h2>
          )}
          {comments.length > 1 && (
            <button
              onClick={() => setCommentSort((s) => (s === "newest" ? "popular" : "newest"))}
              className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors"
              style={{
                color: "var(--wc-mute)",
                background: "var(--wc-soft)",
              }}
            >
              <ArrowUpDown className="h-3 w-3" />
              {commentSort === "newest" ? "최신순" : "인기순"}
            </button>
          )}
        </div>

        {/* 비로그인 판정은 isLoaded 이후에만 — 로딩 중엔 기본(로그인) 모양을 유지해
            hydration mismatch(#418 전례)를 피한다 */}
        <CommentForm
          onSubmit={handleCommentSubmit}
          isSubmitting={isSubmittingComment}
          isAdmin={isAdmin}
          signedIn={isLoaded ? !!user : true}
          onRequireSignIn={() => clerk.openSignIn()}
        />

        <Separator />

        {/* Comment List */}
        <div className="space-y-6">
          {isLoadingComments ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                댓글을 불러오는 중...
              </p>
            </div>
          ) : loadFailed ? (
            <div className="py-8 text-center">
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                댓글을 불러오지 못했습니다.
              </p>
              <button
                onClick={retryLoadComments}
                className="mt-3 rounded-md px-3 py-1.5 text-xs font-bold transition-colors"
                style={{ color: "var(--wc-ink)", background: "var(--wc-soft)" }}
              >
                다시 시도
              </button>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-4 text-center">
              <EmptyScene scene="chat" size={96} />
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                아직 댓글이 없습니다.
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--wc-mute-2)" }}>
                첫 이야기를 남겨보세요.
              </p>
            </div>
          ) : (
            [...comments]
              .filter((c) => !c.userId || !isBlocked(c.userId))
              .sort((a, b) => {
                if (commentSort === "popular") return (b.upvotes || 0) - (a.upvotes || 0)
                // 최신순: createdAt 내림차순 (최신이 위)
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              })
              .slice(0, limit ?? Number.POSITIVE_INFINITY)
              .map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.id}
                  vsFaction={vsFaction}
                  replyingTo={replyingTo}
                  replyText={replyText}
                  onReplyTextChange={setReplyText}
                  onSetReplyingTo={setReplyingTo}
                  onReplySubmit={handleReplySubmit}
                  onCommentUpdated={reloadComments}
                  depth={0}
                  isSubmittingReply={isSubmittingReply}
                  onBlockUser={async (userId) => {
                    await toggleBlock(userId)
                    toast({
                      title: "차단되었습니다",
                      description: "해당 유저의 글과 댓글이 숨겨집니다.",
                    })
                  }}
                />
              ))
          )}
        </div>
        {limit != null && comments.length > limit && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[13px]"
            style={{ borderColor: "var(--wc-line)", color: "var(--wc-mute)" }}
          >
            <span>
              여기까지 {limit}개 ·{" "}
              <b style={{ color: "var(--wc-ink-2)" }}>나머지 {comments.length - limit}개</b>
            </span>
            {moreHref && (
              <a
                href={moreHref}
                className="font-bold underline-offset-4 hover:underline"
                style={{ color: "var(--wc-burgundy)" }}
              >
                글에서 이어 보기 ›
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { memo } from "react"
import { useUser } from "@clerk/nextjs"
import { openReport } from "@/hooks/use-report-dialog"
import {
  extractAllImageSrcsFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
  extractFirstVideoSrcFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"
import { usePostCardActions } from "@/hooks/use-post-card-actions"
import { PostCardContent } from "@/components/post-card/post-card-content"
import { PostCardMeta } from "@/components/post-card/post-card-meta"

export type { TipTapNode } from "@/types/post"
import type { Post as BasePost, TipTapNode } from "@/types/post"

interface Post extends BasePost {
  views?: number
  userId?: string
  createdAt?: Date | string
  titleDisplay?: {
    adjTitle?: string | null
    nounTitle?: string | null
    rarity?: "common" | "rare" | "epic" | "legendary" | null
  } | null
  flairTitle?: string | null
}

interface PostCardProps {
  post: Post
  /** 첫 번째 게시물인 경우 true - LCP 이미지 최적화 */
  priority?: boolean
  /**
   * 껍데기(chrome)만 고르는 스위치 — 안쪽 내용·상호작용은 완전히 동일하다.
   *
   * - `card`(기본): 둥근 흰 카드 + 테두리 + 그림자. **프로덕션 홈의 현재 모습.**
   * - `row`: 테두리·그림자·라운드를 걷어낸 목록 행. 구분선은 부모(.gnp-rows)가 긋는다.
   *   게시물마다 박스를 씌우면 제목보다 박스가 먼저 읽혀서, 편집형 피드에서는 껍데기를
   *   지우고 타이포에 위계를 준다.
   *
   * ⚠️ 기본값이 `card` 라 이 prop 을 넘기지 않는 기존 호출부는 동작이 그대로다.
   *    (2026-08-15 홈 리디자인 프리뷰에서만 `row` 를 쓴다)
   */
  variant?: "card" | "row"
}

export const PostCard = memo(function PostCard({
  post,
  priority = false,
  variant = "card",
}: PostCardProps) {
  const { user } = useUser()
  const isAuthor = post.userId === user?.id

  const {
    voteCount,
    myVote,
    isBookmarked,
    handleEditPost,
    handleDeletePost,
    handleSearchByAuthor,
    handleBlockUser,
    handleVote,
    handleBookmark,
    checkBookmarkStatus,
  } = usePostCardActions({
    postId: post.id,
    author: post.author,
    authorId: post.userId,
    upvotes: post.upvotes,
    isUpvoted: post.isUpvoted,
  })

  const communityLink = post.communitySlug || post.community
  const firstEmbed =
    typeof post.content === "object" ? extractFirstEmbedFromTipTapJSON(post.content) : null
  const firstVideoSrc =
    typeof post.content === "object" ? extractFirstVideoSrcFromTipTapJSON(post.content) : null
  const contentImages =
    typeof post.content === "object" ? extractAllImageSrcsFromTipTapJSON(post.content) : []
  const imageSources = contentImages.length > 0 ? contentImages : post.image ? [post.image] : []
  const displayImage = imageSources[0] || firstEmbed?.attrs.thumbnail_url || null
  // 본문에 삽입된 이미지가 없고 대표 이미지만 있으면 = 링크에서 퍼온 글 → 작은 링크 프리뷰 썸네일.
  // 본문에 이미지가 있으면 = 직접 올린 글 → 큰 이미지(1장이어도). 임베드/동영상 글은 제외.
  const isLinkPreview = contentImages.length === 0 && !!post.image && !firstEmbed && !firstVideoSrc

  return (
    <article>
      <div
        className={
          variant === "row"
            ? "gnp-row group overflow-hidden"
            : "group gn-card-lift overflow-hidden rounded-xl"
        }
        style={
          variant === "row"
            ? undefined // 면·구분선은 .gnp-row / .gnp-rows 가 담당
            : {
                background: "var(--wc-card)",
                border: "1px solid var(--wc-line)",
                boxShadow: "0 1px 2px rgba(24,18,21,.05)",
              }
        }
      >
        <div
          className="relative"
          style={{ padding: variant === "row" ? "20px 22px" : "18px 20px" }}
        >
          <PostCardContent
            postId={post.id}
            title={post.title}
            content={post.content}
            displayImage={displayImage}
            imageSources={imageSources}
            isLinkPreview={isLinkPreview}
            firstEmbed={firstEmbed}
            firstVideoSrc={firstVideoSrc}
            image={post.image}
            priority={priority}
            category={post.community}
            categoryLink={communityLink}
            flair={post.flair}
            temperature={post.temperature}
            timestamp={post.timestamp}
          />
          <PostCardMeta
            postId={post.id}
            postTitle={post.title}
            author={post.author}
            avatar={post.avatar}
            userId={post.userId}
            titleDisplay={post.titleDisplay}
            flairTitle={post.flairTitle}
            timestamp={post.timestamp}
            voteCount={voteCount}
            myVote={myVote}
            comments={post.comments}
            viewCount={post.views}
            isBookmarked={isBookmarked}
            isAuthor={isAuthor}
            onVote={handleVote}
            onBookmark={handleBookmark}
            onBookmarkHover={checkBookmarkStatus}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            onSearchByAuthor={handleSearchByAuthor}
            onBlockUser={handleBlockUser}
            onReport={() => openReport("post", String(post.id))}
          />
        </div>
      </div>
    </article>
  )
})

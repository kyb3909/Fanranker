"use client"

import { memo } from "react"
import { useUser } from "@clerk/nextjs"
import { openReport } from "@/hooks/use-report-dialog"
import {
  extractAllImageSrcsFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
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
}

export const PostCard = memo(function PostCard({ post, priority = false }: PostCardProps) {
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
    upvotes: post.upvotes,
    isUpvoted: post.isUpvoted,
  })

  const communityLink = post.communitySlug || post.community
  const firstEmbed =
    typeof post.content === "object" ? extractFirstEmbedFromTipTapJSON(post.content) : null
  const contentImages =
    typeof post.content === "object" ? extractAllImageSrcsFromTipTapJSON(post.content) : []
  const imageSources = contentImages.length > 0 ? contentImages : post.image ? [post.image] : []
  const displayImage = imageSources[0] || firstEmbed?.attrs.thumbnail_url || null

  return (
    <article>
      <div
        className="gn-card-lift overflow-hidden rounded-xl"
        style={{
          background: "var(--wc-card)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="relative px-4 py-3 sm:px-5">
          <PostCardContent
            postId={post.id}
            title={post.title}
            content={post.content}
            displayImage={displayImage}
            imageSources={imageSources}
            firstEmbed={firstEmbed}
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

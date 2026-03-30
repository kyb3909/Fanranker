"use client"

import { memo } from "react"
import { Card } from "@/components/ui/card"
import { useUser } from "@clerk/nextjs"
import { openReport } from "@/hooks/use-report-dialog"
import {
  extractAllImageSrcsFromTipTapJSON,
  extractFirstEmbedFromTipTapJSON,
} from "@/lib/utils/tiptap-embeds"
import { usePostCardActions } from "@/hooks/use-post-card-actions"
import { PostCardHeader } from "@/components/post-card/post-card-header"
import { PostCardContent } from "@/components/post-card/post-card-content"
import { PostCardFooter } from "@/components/post-card/post-card-footer"

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
      <Card className="border-border hover:border-muted-foreground/30 overflow-hidden border transition-all duration-300 hover:shadow-md">
        <div className="relative px-4 py-3 sm:px-5">
          <PostCardHeader
            community={post.community}
            communityLink={communityLink}
            timestamp={post.timestamp}
            author={post.author}
            avatar={post.avatar}
            userId={post.userId}
            titleDisplay={post.titleDisplay}
            isAuthor={isAuthor}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            onSearchByAuthor={handleSearchByAuthor}
            onBlockUser={handleBlockUser}
            onReport={() => openReport("post", String(post.id))}
          />
          <PostCardContent
            postId={post.id}
            title={post.title}
            content={post.content}
            displayImage={displayImage}
            imageSources={imageSources}
            firstEmbed={firstEmbed}
            image={post.image}
            priority={priority}
          />
          <PostCardFooter
            postId={post.id}
            postTitle={post.title}
            voteCount={voteCount}
            myVote={myVote}
            comments={post.comments}
            temperature={post.temperature}
            isBookmarked={isBookmarked}
            onVote={handleVote}
            onBookmark={handleBookmark}
            onBookmarkHover={checkBookmarkStatus}
          />
        </div>
      </Card>
    </article>
  )
})

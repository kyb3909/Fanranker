"use client"

import { memo } from "react"
import { Card } from "@/components/ui/card"
import { useUser } from "@clerk/nextjs"
import { ReportDialog } from "@/components/report-dialog"
import { extractFirstEmbedFromTipTapJSON } from "@/lib/utils/tiptap-embeds"
import { getDisplayTemperature } from "@/lib/temperature"
import { usePostCardActions } from "@/hooks/use-post-card-actions"
import { PostCardHeader } from "@/components/post-card/post-card-header"
import { PostCardContent } from "@/components/post-card/post-card-content"
import { PostCardFooter } from "@/components/post-card/post-card-footer"

export interface TipTapNode {
  type?: string
  content?: TipTapNode[]
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

interface Post {
  id: number | string
  community: string
  communitySlug?: string
  author: string
  avatar: string
  timestamp: string
  title: string
  content: string | TipTapNode
  image?: string
  upvotes: number
  comments: number
  temperature?: number
  isUpvoted: boolean
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
    reportOpen,
    setReportOpen,
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

  const rawTemperature =
    post.temperature ??
    Math.min(100, Math.floor((Math.max(0, voteCount) * 2 + post.comments * 3) / 10))
  const temperature = post.createdAt
    ? getDisplayTemperature(rawTemperature, post.createdAt)
    : rawTemperature
  const communityLink = post.communitySlug || post.community
  const firstEmbed =
    typeof post.content === "object" ? extractFirstEmbedFromTipTapJSON(post.content) : null
  const displayImage = post.image || firstEmbed?.attrs.thumbnail_url || null

  return (
    <article>
      <Card className="border-border hover:border-muted-foreground/30 overflow-hidden border transition-colors">
        <div className="relative px-4 py-3 sm:px-5">
          <PostCardHeader
            community={post.community}
            communityLink={communityLink}
            timestamp={post.timestamp}
            isAuthor={isAuthor}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
            onSearchByAuthor={handleSearchByAuthor}
            onBlockUser={handleBlockUser}
            onReport={() => setReportOpen(true)}
          />
          <PostCardContent
            postId={post.id}
            title={post.title}
            content={post.content}
            displayImage={displayImage}
            firstEmbed={firstEmbed}
            image={post.image}
            priority={priority}
          />
          <PostCardFooter
            postId={post.id}
            postTitle={post.title}
            author={post.author}
            avatar={post.avatar}
            userId={post.userId}
            temperature={temperature}
            voteCount={voteCount}
            myVote={myVote}
            comments={post.comments}
            isBookmarked={isBookmarked}
            onVote={handleVote}
            onBookmark={handleBookmark}
            onBookmarkHover={checkBookmarkStatus}
            titleDisplay={post.titleDisplay}
            onSearchByAuthor={handleSearchByAuthor}
            onBlockUser={handleBlockUser}
          />
        </div>
      </Card>
      <ReportDialog
        targetType="post"
        targetId={String(post.id)}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </article>
  )
})

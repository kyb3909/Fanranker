import Link from "@/components/ui/app-link"
import { MessageSquare, ThumbsUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { formatRelativeTime } from "@/lib/utils/date"

interface RecentPost {
  id: string
  title: string
  comment_count: number
  vote_count: number
  created_at: string
  profile: { nickname: string } | null
}

interface BoardRecentPostsProps {
  posts: RecentPost[]
  boardName: string
  boardSlug: string
  currentPostId: string
}

export function BoardRecentPosts({
  posts,
  boardName,
  boardSlug,
  currentPostId,
}: BoardRecentPostsProps) {
  if (posts.length === 0) return null

  return (
    <Card className="border-border bg-card overflow-hidden border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{boardName} 최근 글</h3>
        <Link
          href={`/community/${boardSlug}`}
          className="text-primary text-xs font-medium hover:underline"
        >
          더보기
        </Link>
      </div>
      <div className="divide-border divide-y">
        {posts.map((post) => {
          const isCurrent = post.id === currentPostId
          return (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className={`hover:bg-muted/50 flex items-center gap-3 px-4 py-2.5 transition-colors ${
                isCurrent ? "bg-primary/5" : ""
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-[13px] ${
                  isCurrent ? "text-primary font-semibold" : "text-foreground"
                }`}
              >
                {post.title}
              </span>
              <div className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-[11px]">
                <span className="flex items-center gap-0.5">
                  <ThumbsUp className="h-3 w-3" />
                  {post.vote_count || 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" />
                  {post.comment_count || 0}
                </span>
                <span className="hidden sm:inline">
                  {formatRelativeTime(new Date(post.created_at))}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

import Link from "@/components/ui/app-link"
import { MessageSquare, ThumbsUp } from "lucide-react"
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
    <div
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--wc-card)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: "#F7F7F8",
          borderBottom: "1px solid var(--wc-line)",
        }}
      >
        <h3
          className="text-[11px] font-bold uppercase"
          style={{
            color: "var(--wc-burgundy)",
            letterSpacing: "0.18em",
          }}
        >
          {boardName} 최근 글
        </h3>
        <Link
          href={`/community/${boardSlug}`}
          className="text-xs font-bold hover:underline"
          style={{ color: "var(--wc-burgundy)" }}
        >
          더보기
        </Link>
      </div>
      <div>
        {posts.map((post) => {
          const isCurrent = post.id === currentPostId
          return (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className={
                isCurrent
                  ? "flex items-center gap-3 px-4 py-2.5 transition-colors"
                  : "wc-recent-row flex items-center gap-3 px-4 py-2.5 transition-colors"
              }
              style={{
                borderBottom: "1px solid var(--wc-line)",
                background: isCurrent ? "rgba(150,30,55,0.06)" : undefined,
              }}
            >
              <span
                className="min-w-0 flex-1 truncate text-[13px]"
                style={{
                  color: isCurrent ? "var(--wc-burgundy)" : "var(--wc-ink)",
                  fontWeight: isCurrent ? 700 : 600,
                }}
              >
                {post.title}
              </span>
              <div
                className="flex shrink-0 items-center gap-2.5 text-[11px] tabular-nums"
                style={{ color: "var(--wc-mute)" }}
              >
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
    </div>
  )
}

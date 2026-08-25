import Link from "@/components/ui/app-link"
import { MessageSquare, ThumbsUp, TrendingUp } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"

interface RecentPost {
  id: string
  title: string
  comment_count: number
  vote_count: number
  created_at: string
  profile: { nickname: string } | null
  /** 전 판 모드(담벼락)에서 행별 판 이름 — 같은 판 모드에선 불필요 */
  community?: string
}

interface BoardRecentPostsProps {
  posts: RecentPost[]
  boardName: string
  boardSlug: string
  currentPostId: string
  /** 헤더 문구 오버라이드 — 기본 "{boardName} 최근 글" */
  title?: string
  /** 더보기 목적지 오버라이드 — 기본 /community/{boardSlug} */
  moreHref?: string
  /** 행 링크에 붙일 utm_source (담벼락 동선 계측용) */
  utmSource?: string
}

export function BoardRecentPosts({
  posts,
  boardName,
  boardSlug,
  currentPostId,
  title,
  moreHref,
  utmSource,
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
          background: "var(--wc-card)",
          borderBottom: "1px solid var(--wc-line)",
        }}
      >
        <h3
          className="flex items-center gap-2 text-[12px] font-bold uppercase"
          style={{
            color: "var(--wc-ink)",
            letterSpacing: "0.18em",
          }}
        >
          <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
          {title ?? `${boardName} 최근 글`}
        </h3>
        <Link
          href={moreHref ?? `/community/${boardSlug}`}
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
              href={`/post/${post.id}${utmSource ? `?utm_source=${utmSource}` : ""}`}
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
                className="gn-num flex shrink-0 items-center gap-2.5 text-[12px]"
                style={{ color: "var(--wc-mute)" }}
              >
                {/* 0 카운트는 아이콘째 숨긴다 — "0의 행렬 = 죽은 사이트 신호" (2026-08-20 수정) */}
                {post.vote_count > 0 && (
                  <span className="flex items-center gap-0.5">
                    <ThumbsUp className="h-3 w-3" />
                    {post.vote_count}
                  </span>
                )}
                {post.comment_count > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" />
                    {post.comment_count}
                  </span>
                )}
                {post.community ? (
                  <span className="hidden sm:inline">{post.community}</span>
                ) : (
                  <span className="hidden sm:inline">
                    {formatRelativeTime(new Date(post.created_at))}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

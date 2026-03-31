"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { PostCard, type TipTapNode } from "@/components/post-card"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, FileText, ArrowLeft, Trash2 } from "lucide-react"
import Link from "@/components/ui/app-link"
import { useRouter } from "next/navigation"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

interface Post {
  id: string
  community: string
  communitySlug: string
  author: string
  avatar: string
  userId: string
  timestamp: string
  title: string
  content: string | TipTapNode // TipTap JSON
  image?: string
  upvotes: number
  comments: number
  isUpvoted: boolean
  views: number
  createdAt: Date
}

export default function MyPostsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (isLoaded && !isSignedIn) return

    async function fetchMyPosts() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        const response = await fetch("/api/posts/my")
        if (response.ok) {
          const { posts: fetchedPosts, profiles } = await response.json()

          const profileMap = new Map<
            string,
            { user_id: string; nickname: string; avatar_url: string | null }
          >(
            profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [
              p.user_id,
              p,
            ]) || []
          )

          const transformedPosts: Post[] = fetchedPosts.map(
            (post: {
              id: string
              user_id: string
              community_slug: string
              title: string
              content: string | TipTapNode
              image?: string
              vote_count?: number
              comment_count?: number
              view_count?: number
              created_at: string
            }) => {
              const profile = profileMap.get(post.user_id)
              return {
                id: post.id,
                community: COMMUNITY_NAMES[post.community_slug] || post.community_slug,
                communitySlug: post.community_slug,
                author: profile?.nickname || "나",
                avatar: profile?.avatar_url || "/placeholder-user.jpg",
                userId: post.user_id,
                timestamp: formatRelativeTime(new Date(post.created_at)),
                title: post.title,
                content: post.content,
                image: post.image,
                upvotes: post.vote_count || 0,
                comments: post.comment_count || 0,
                isUpvoted: false,
                views: post.view_count || 0,
                createdAt: new Date(post.created_at),
              }
            }
          )

          setPosts(transformedPosts)
        }
      } catch {
        setErrorMessage("글 목록을 불러오는데 실패했습니다.")
      } finally {
        setIsLoading(false)
      }
    }

    if (isSignedIn) {
      fetchMyPosts()
    }
  }, [isSignedIn, isLoaded, router])

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-card border-border max-w-sm rounded-xl border p-8 text-center">
          <FileText className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h2 className="mb-2 text-lg font-bold">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            내 작성글을 보려면 먼저 로그인해주세요.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              홈으로
            </Button>
            <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-[800px] px-4 py-6" tabIndex={-1}>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold">내 작성글</h1>
        </div>
        <span className="text-muted-foreground ml-auto text-sm">총 {posts.length}개</span>
      </div>

      {/* 글 목록 */}
      {errorMessage ? (
        <Card className="p-8 text-center">
          <p className="text-primary mb-3 text-sm">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        </Card>
      ) : isLoading ? (
        <Card className="p-8 text-center">
          <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">글 목록을 불러오는 중...</p>
        </Card>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <FileText className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">작성한 글이 없습니다</h3>
          <p className="text-muted-foreground mb-4 text-sm">커뮤니티에 첫 글을 작성해보세요!</p>
          <Link href="/write">
            <Button>글 작성하기</Button>
          </Link>
        </Card>
      )}
    </main>
  )
}

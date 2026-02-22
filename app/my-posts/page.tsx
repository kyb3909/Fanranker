"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Header } from "@/components/header"
import { PostCard, type TipTapNode } from "@/components/post-card"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, FileText, ArrowLeft, Trash2 } from "lucide-react"
import Link from "next/link"
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
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/")
      return
    }

    async function fetchMyPosts() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        const response = await fetch('/api/posts/my')
        if (response.ok) {
          const { posts: fetchedPosts, profiles } = await response.json()

          const profileMap = new Map<string, { user_id: string; nickname: string; avatar_url: string | null }>(profiles?.map((p: { user_id: string; nickname: string; avatar_url: string | null }) => [p.user_id, p]) || [])

          const transformedPosts: Post[] = fetchedPosts.map((post: { id: string; user_id: string; community_slug: string; title: string; content: string | TipTapNode; image?: string; vote_count?: number; comment_count?: number; view_count?: number; created_at: string }) => {
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
          })

          setPosts(transformedPosts)
        }
      } catch {
        setErrorMessage('글 목록을 불러오는데 실패했습니다.')
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
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 py-6 max-w-[800px]" tabIndex={-1}>
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">내 작성글</h1>
          </div>
          <span className="text-sm text-muted-foreground ml-auto">
            총 {posts.length}개
          </span>
        </div>

        {/* 글 목록 */}
        {errorMessage ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-red-500 mb-3">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>다시 시도</Button>
          </Card>
        ) : isLoading ? (
          <Card className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">글 목록을 불러오는 중...</p>
          </Card>
        ) : posts.length > 0 ? (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">작성한 글이 없습니다</h3>
            <p className="text-sm text-muted-foreground mb-4">
              커뮤니티에 첫 글을 작성해보세요!
            </p>
            <Link href="/write">
              <Button>글 작성하기</Button>
            </Link>
          </Card>
        )}
      </main>
    </div>
  )
}

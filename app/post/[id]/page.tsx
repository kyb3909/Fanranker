import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ActivitySidebar } from "@/components/sidebar/activity-sidebar"
import { PostDetailContent } from "@/components/post-detail/post-detail-content"
import { BoardRecentPosts } from "@/components/board-recent-posts"
import { BackButton } from "@/components/back-button"
import { createServerAnonClient } from "@/lib/supabase"
import { auth } from "@clerk/nextjs/server"
import { fetchVisibleComments } from "@/lib/comments/visible-comments"
import { computeTemperature } from "@/lib/temperature"
import { jsonLd } from "@/lib/seo"
import { COMMUNITY_NAMES } from "@/lib/constants/communities"
import { formatRelativeTime } from "@/lib/utils/date"

// Supabase에서 글 상세 정보 가져오기
async function fetchPost(id: string) {
  const supabase = createServerAnonClient()

  // 1. 게시글 조회
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select(
      `
      id,
      user_id,
      community_slug,
      title,
      content,
      image,
      view_count,
      vote_count,
      comment_count,
      temperature,
      created_at,
      updated_at,
      source_url,
      source_name
    `
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single()

  if (postError || !post) {
    return null
  }

  // 2. 작성자 프로필 + 장착 칭호 조회
  // Note: 조회수 증가는 클라이언트에서 /api/posts/[id]/view 엔드포인트를 호출하여 처리
  const [{ data: profile }, { data: equippedTitles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .eq("user_id", post.user_id)
      .single(),
    supabase
      .from("user_equipped_titles")
      .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
      .eq("user_id", post.user_id)
      .eq("board_slug", post.community_slug),
  ])

  const equipped = (equippedTitles?.[0] || null) as {
    adj_titles: unknown
    noun_titles: unknown
  } | null
  const adjTitlesRaw = equipped?.adj_titles as
    | { title: string; rarity: string }[]
    | { title: string; rarity: string }
    | null
  const adjTitle = adjTitlesRaw
    ? Array.isArray(adjTitlesRaw)
      ? adjTitlesRaw[0]
      : adjTitlesRaw
    : null
  const nounTitlesRaw = equipped?.noun_titles as { title: string }[] | { title: string } | null
  const nounTitle = nounTitlesRaw
    ? Array.isArray(nounTitlesRaw)
      ? nounTitlesRaw[0]
      : nounTitlesRaw
    : null

  return {
    ...post,
    profile: profile || null,
    titleDisplay: equipped
      ? {
          adjTitle: adjTitle?.title || null,
          nounTitle: nounTitle?.title || null,
          rarity: (adjTitle?.rarity as "common" | "rare" | "epic" | "legendary") || null,
        }
      : null,
  }
}

async function fetchBoardRecentPosts(communitySlug: string, excludePostId: string) {
  const supabase = createServerAnonClient()
  const { data } = await supabase
    .from("posts")
    .select("id, title, comment_count, vote_count, created_at")
    .eq("community_slug", communitySlug)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(16)

  if (!data) return []
  return data
    .filter((p: { id: string }) => p.id !== excludePostId)
    .slice(0, 15)
    .map((p) => ({
      id: p.id,
      title: p.title,
      comment_count: p.comment_count ?? 0,
      vote_count: p.vote_count ?? 0,
      created_at: p.created_at,
      profile: null,
    }))
}

async function fetchComments(postId: string) {
  // 비밀댓글 필터를 SSR/클라 API가 공유(단일 출처). 원글 작성자·운영자는 초기 렌더에서도
  // 비밀댓글을 본다. auth() 로 현재 뷰어를 넘겨 권한 판정.
  const { userId } = await auth()
  return fetchVisibleComments(postId, userId ?? null)
}

function extractDescription(content: unknown): string {
  if (!content) return ""
  // Supabase jsonb columns return parsed objects, not strings
  const parsed =
    typeof content === "string"
      ? (() => {
          try {
            return JSON.parse(content)
          } catch {
            return null
          }
        })()
      : content
  if (parsed && typeof parsed === "object") {
    const texts: string[] = []
    interface TipTapNode {
      text?: string
      content?: TipTapNode[]
    }
    function walk(node: TipTapNode) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(walk)
    }
    walk(parsed)
    const plain = texts.join(" ").replace(/\s+/g, " ").trim()
    return plain.length > 160 ? plain.slice(0, 157) + "..." : plain
  }
  if (typeof content === "string") {
    const plain = content
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
    return plain.length > 160 ? plain.slice(0, 157) + "..." : plain
  }
  return ""
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const post = await fetchPost(id)

  // 글이 없으면 metadata 시점에 notFound() — title이 "게시글 | gongnori.fan"로
  // 엉뚱하게 노출되는 SEO 문제 방지. not-found.tsx 메타데이터가 적용됨.
  if (!post) {
    notFound()
  }

  const description = extractDescription(post.content)
  return {
    title: post.title || "게시글",
    description,
    openGraph: {
      type: "article",
      title: post.title,
      description,
      images: post.image ? [post.image] : undefined,
    },
    twitter: {
      card: post.image ? "summary_large_image" : "summary",
      title: post.title || "게시글",
      description,
      images: post.image ? [post.image] : undefined,
    },
    alternates: { canonical: `/post/${id}` },
  }
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Supabase에서 글 데이터 가져오기
  const postData = await fetchPost(id)

  if (!postData) {
    notFound()
  }

  const [recentPosts, commentsData] = await Promise.all([
    fetchBoardRecentPosts(postData.community_slug, id),
    fetchComments(id),
  ])
  const boardName = COMMUNITY_NAMES[postData.community_slug] || postData.community_slug

  // 데이터 변환 (반감기 적용 온도 포함)
  const post = {
    id: postData.id,
    community: COMMUNITY_NAMES[postData.community_slug] || postData.community_slug,
    communitySlug: postData.community_slug,
    author: postData.profile?.nickname || "익명",
    avatar: postData.profile?.avatar_url || "/placeholder-user.jpg",
    userId: postData.user_id, // Clerk user_id 추가
    timestamp: formatRelativeTime(new Date(postData.created_at)),
    title: postData.title,
    content: postData.content, // TipTap JSON
    image: postData.image,
    upvotes: postData.vote_count || 0,
    comments: postData.comment_count || 0,
    temperature:
      postData.temperature ||
      computeTemperature({
        vote_count: postData.vote_count || 0,
        comment_count: postData.comment_count || 0,
        created_at: postData.created_at,
      }),
    isUpvoted: false,
    createdAt: new Date(postData.created_at),
    titleDisplay: postData.titleDisplay || null,
    sourceUrl: postData.source_url,
    sourceName: postData.source_name,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: postData.title,
            datePublished: postData.created_at,
            dateModified: postData.updated_at,
            author: { "@type": "Person", name: postData.profile?.nickname || "익명" },
            ...(postData.image ? { image: postData.image } : {}),
          }),
        }}
      />

      <div className="worldcup-scope min-h-[100dvh]">
        <main
          id="main-content"
          className="container mx-auto max-w-[1280px] px-4 py-6"
          tabIndex={-1}
        >
          <div className="grid grid-cols-12 gap-6">
            {/* Main Content - 9 columns */}
            <div className="col-span-12 space-y-4 lg:col-span-9">
              <BackButton fallbackHref={`/community/${postData.community_slug}`} />

              {/* Post Detail Content */}
              <PostDetailContent post={post} initialCommentsData={commentsData} />

              {/* Board Recent Posts */}
              <BoardRecentPosts
                posts={recentPosts}
                boardName={boardName}
                boardSlug={postData.community_slug}
                currentPostId={id}
              />
            </div>

            {/* Right Sidebar - 3 columns - Only recent comments */}
            <aside className="col-span-3 hidden lg:block">
              <ActivitySidebar />
            </aside>
          </div>
        </main>
      </div>
    </>
  )
}

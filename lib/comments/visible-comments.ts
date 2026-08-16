import { createServiceRoleClient } from "@/lib/supabase/server"

interface VisibleCommentRow {
  id: string
  post_id: string
  user_id: string
  parent_id: string | null
  content: string
  vote_count: number
  created_at: string
  updated_at?: string
  sticker_id: string | null
  is_secret: boolean
  stickers: { id: string; name: string; image_url: string } | null
}

interface VisibleCommentsResult {
  comments: VisibleCommentRow[]
  profiles: { user_id: string; nickname: string; avatar_url: string | null }[]
  equippedTitles: {
    user_id: string
    board_slug: string
    adj_titles: { title: string; rarity: string } | null
    noun_titles: { title: string } | null
  }[]
}

/**
 * 게시글 댓글 조회 (비밀댓글 필터 포함) — 단일 출처.
 *
 * 비밀댓글(is_secret=true)은 {원글 작성자, 운영자, 작성한 본인}에게만 포함한다.
 * service role로 읽고 코드에서 필터하며, RLS는 anon 직접조회를 원천 차단(is_secret=false만
 * 공개)해 이중으로 방어한다. SSR(post 페이지)과 클라 API GET 양쪽이 이 함수를 공유하므로
 * 필터 로직이 한 곳에만 존재한다 (두 벌이면 드리프트로 유출 위험).
 */
export async function fetchVisibleComments(
  postId: string,
  viewerId: string | null
): Promise<VisibleCommentsResult> {
  const supabase = createServiceRoleClient()

  const { data: rawComments } = await supabase
    .from("comments")
    .select(
      `id, post_id, user_id, parent_id, content, vote_count, created_at, updated_at, sticker_id, is_secret,
       stickers ( id, name, image_url, media_type )`
    )
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200)

  if (!rawComments || rawComments.length === 0) {
    return { comments: [], profiles: [], equippedTitles: [] }
  }

  // 비밀댓글이 하나라도 있을 때만 열람 권한(원글 작성자/운영자) 판정용 추가 조회.
  let postAuthorId: string | null = null
  let viewerIsAdmin = false
  if (viewerId && rawComments.some((c) => c.is_secret)) {
    const [{ data: post }, { data: profile }] = await Promise.all([
      supabase.from("posts").select("user_id").eq("id", postId).maybeSingle(),
      supabase.from("profiles").select("role").eq("user_id", viewerId).maybeSingle(),
    ])
    postAuthorId = (post as { user_id: string } | null)?.user_id ?? null
    viewerIsAdmin = (profile as { role: string } | null)?.role === "admin"
  }

  const canSeeSecret = (commentAuthorId: string) =>
    !!viewerId && (viewerId === postAuthorId || viewerIsAdmin || viewerId === commentAuthorId)

  const visible = rawComments
    .filter((c) => !c.is_secret || canSeeSecret(c.user_id))
    .map((c) => ({
      ...c,
      stickers: Array.isArray(c.stickers) ? c.stickers[0] || null : c.stickers,
    })) as unknown as VisibleCommentRow[]

  if (visible.length === 0) {
    return { comments: [], profiles: [], equippedTitles: [] }
  }

  const userIds = [...new Set(visible.map((c) => c.user_id))]
  const [{ data: profiles }, { data: equippedTitles }] = await Promise.all([
    supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
    supabase
      .from("user_equipped_titles")
      .select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")
      .in("user_id", userIds),
  ])

  return {
    comments: visible,
    profiles: (profiles || []) as VisibleCommentsResult["profiles"],
    equippedTitles: (equippedTitles || []) as unknown as VisibleCommentsResult["equippedTitles"],
  }
}

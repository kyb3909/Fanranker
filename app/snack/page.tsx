import { createServiceRoleClient } from "@/lib/supabase/server"
import { SnackFeedClient, type SnackCard } from "./snack-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "떡밥 피드 — 오늘의 떡밥 몰아보기 | gongnori.fan",
  description: "여돌 짤, 유머, 축구 소식을 풀스크린으로 쭉쭉 넘겨보는 떡밥 피드.",
}

interface Row {
  id: string
  title: string
  image: string | null
  user_id: string
  vote_count: number | null
  comment_count: number | null
  created_at: string
}

export default async function SnackPage() {
  const supabase = createServiceRoleClient()
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, image, user_id, vote_count, comment_count, created_at")
    .is("deleted_at", null)
    .not("image", "is", null)
    .order("created_at", { ascending: false })
    .limit(30)

  const rows = (posts ?? []) as Row[]
  const userIds = [...new Set(rows.map((p) => p.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("user_id, nickname").in("user_id", userIds)
    : { data: [] }
  const nickOf = new Map((profiles ?? []).map((p) => [p.user_id, p.nickname]))

  const cards: SnackCard[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    image: p.image as string,
    nickname: nickOf.get(p.user_id) ?? "익명",
    voteCount: p.vote_count ?? 0,
    commentCount: p.comment_count ?? 0,
    createdAt: p.created_at,
  }))

  const nextCursor = rows.length === 30 ? rows[rows.length - 1].created_at : null

  return <SnackFeedClient initialCards={cards} initialCursor={nextCursor} />
}

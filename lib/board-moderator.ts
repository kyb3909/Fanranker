import { createServiceRoleClient } from "@/lib/supabase/server"

type SbClient = ReturnType<typeof createServiceRoleClient>

/**
 * 유저가 해당 게시판에 공지(is_notice)를 작성할 수 있는지.
 * admin / 글로벌 moderator / 해당 게시판 board MOD 이면 true.
 */
export async function canPostNotice(
  supabase: SbClient,
  userId: string,
  communitySlug: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single()
  if (profile?.role === "admin" || profile?.role === "moderator") return true

  const { data: mod } = await supabase
    .from("board_moderators")
    .select("id")
    .eq("user_id", userId)
    .eq("community_slug", communitySlug)
    .maybeSingle()
  return !!mod
}

/**
 * Test fixtures for member journeys whose subject is an action ON a post
 * (vote / bookmark / comment / edit / delete) rather than post creation.
 *
 * The post is inserted directly via the service-role client so each test gets
 * a clean slate (vote_count 0, no prior vote/comment). Post creation itself is
 * covered by the 글 작성 journey via the real UI.
 */
import { dbClient } from "./db-verifier"
import type { Bot } from "../setup/bot-factory"

const tiptapDoc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

/** Insert a post owned by `bot`. Returns the new post id. */
export async function createPost(bot: Bot, title: string): Promise<string> {
  const db = dbClient()
  const { data: cats, error: catErr } = await db.from("categories").select("id, slug").limit(1)
  if (catErr || !cats || cats.length === 0) {
    throw new Error("createPost: 시드 카테고리가 없습니다.")
  }
  const { data, error } = await db
    .from("posts")
    .insert({
      user_id: bot.clerkUserId,
      category_id: cats[0].id,
      community_slug: cats[0].slug,
      title,
      content: tiptapDoc("E2E 픽스처 게시글 본문입니다."),
    })
    .select("id")
    .single()
  if (error) throw new Error(`createPost 실패: ${error.message}`)
  return data.id as string
}

/**
 * 기발행 봇 기사 문단 정리 (일회성) — 한 덩어리 문단을 2~3문장 단위로 분할.
 * 실행: pnpm exec tsx scripts/format-bot-articles.ts [--write]
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { splitLongParagraphs } from "../lib/tiptap/split-paragraphs"

async function main() {
  const write = process.argv.includes("--write")
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, content")
    .eq("user_id", "user_bot_soccer_kr")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300)

  let changed = 0
  for (const p of posts ?? []) {
    const next = splitLongParagraphs(p.content)
    if (JSON.stringify(next) !== JSON.stringify(p.content)) {
      changed++
      if (write) await supabase.from("posts").update({ content: next }).eq("id", p.id)
    }
  }
  console.log(
    `검사 ${posts?.length ?? 0}건 / 문단 분할 ${changed}건 ${write ? "(적용됨)" : "(드라이런)"}`
  )
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

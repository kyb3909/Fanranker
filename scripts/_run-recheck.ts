// 일회용 — 사전 등재 후 잠금 해제 레버 수동 실행 (확인 후 삭제)
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { requeueDraftsUnblockedByDictionary } from "../lib/news/dictionary-recheck"

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const result = await requeueDraftsUnblockedByDictionary(supabase as never)
  console.log(JSON.stringify(result, null, 2))
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

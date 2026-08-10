import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { findUniqueRomanizedMatch, loadNotation } from "@/lib/news/notation"

/** 발음 부호 수정이 실사전에서 듣는지 — 로마자를 고정해 LLM 비결정성을 배제 */
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { persons } = await loadNotation(supabase)
  for (const roman of [
    "Rafael Leao",
    "Rafael Leão",
    "Bruno Guimaraes",
    "Rasmus Hojlund",
    "Benjamin Sesko",
  ]) {
    const hit = findUniqueRomanizedMatch(persons, roman)
    console.log(`  ${roman.padEnd(20)} → ${hit ? hit.preferred_ko : "(매칭 없음)"}`)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

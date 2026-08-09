/**
 * 기발행 봇 기사 제목의 출처 라벨 소급 통일 (1회성, 2026-08-09).
 *
 * 규칙을 여기 다시 쓰지 않는다 — 발행 경로와 **같은 함수**(normalizeSourceLabel)로
 * 계산하고 결과만 적용한다. 규칙이 두 벌 되는 순간 한쪽만 늙는다.
 *
 *   pnpm exec tsx scripts/_backfill-source-labels.ts          # 드라이런
 *   pnpm exec tsx scripts/_backfill-source-labels.ts --write  # 적용
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchSourceLabelMap, normalizeSourceLabel } from "@/lib/news/source-label"

const NEWS_BOT = "user_bot_soccer_kr"

async function main() {
  const write = process.argv.includes("--write")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요")
  const supabase = createClient(url, key)

  const map = await fetchSourceLabelMap(supabase)
  console.log(`출처 라벨 사전 ${map.size}개 키`)

  const { data, error } = await supabase
    .from("posts")
    .select("id, title")
    .eq("user_id", NEWS_BOT)
    .is("deleted_at", null)
    .like("title", "[%")
    .limit(2000)
  if (error) throw new Error(error.message)

  const changes = (data ?? [])
    .map((p) => ({
      id: p.id as string,
      from: p.title as string,
      to: normalizeSourceLabel(p.title as string, map),
    }))
    .filter((c) => c.from !== c.to)

  console.log(`대상 ${data?.length ?? 0}건 중 교정 ${changes.length}건`)
  for (const c of changes) {
    console.log(`  ${c.from.slice(0, 28)}  →  ${c.to.slice(0, 28)}`)
  }

  if (!write) {
    console.log("\n(드라이런 — 적용하려면 --write)")
    return
  }
  let ok = 0
  for (const c of changes) {
    const { error: e } = await supabase.from("posts").update({ title: c.to }).eq("id", c.id)
    if (e) console.error(`  실패 ${c.id}: ${e.message}`)
    else ok++
  }
  console.log(`\n적용 완료: ${ok}/${changes.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

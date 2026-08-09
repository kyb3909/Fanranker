/**
 * 기발행 봇 기사의 구단·인물 표기 소급 통일 (1회성, 2026-08-09).
 *
 * 운영자 결정 "네이버 우선" 적용 직후, 그 전에 나간 글들을 같은 규칙으로 정리한다.
 * 규칙을 여기 다시 쓰지 않는다 — 발행 경로와 **같은 함수**(loadNotation → applyNamingPairs)로
 * 계산하고 결과만 적용한다.
 *
 *   pnpm exec tsx scripts/_backfill-team-notation.ts          # 드라이런
 *   pnpm exec tsx scripts/_backfill-team-notation.ts --write  # 적용
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { applyNamingPairs, applyNamingPairsToTipTap, loadNotation } from "@/lib/news/notation"

const NEWS_BOT = "user_bot_soccer_kr"

async function main() {
  const write = process.argv.includes("--write")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요")
  const supabase = createClient(url, key)

  const notation = await loadNotation(supabase)
  console.log(`치환 쌍 ${notation.pairs.length}개 (사전 ${notation.entries.length}행)`)

  const { data, error } = await supabase
    .from("posts")
    .select("id, title, content")
    .eq("user_id", NEWS_BOT)
    .is("deleted_at", null)
    .limit(2000)
  if (error) throw new Error(error.message)

  const changes = (data ?? []).flatMap((p) => {
    const title = applyNamingPairs(p.title as string, notation.pairs)
    const content = applyNamingPairsToTipTap(p.content, notation.pairs)
    const titleChanged = title !== p.title
    const bodyChanged = JSON.stringify(content) !== JSON.stringify(p.content)
    if (!titleChanged && !bodyChanged) return []
    return [{ id: p.id as string, from: p.title as string, title, content, titleChanged }]
  })

  console.log(`대상 ${data?.length ?? 0}건 중 교정 ${changes.length}건`)
  for (const c of changes.filter((c) => c.titleChanged).slice(0, 25)) {
    console.log(`  ${c.from.slice(0, 34)}  →  ${c.title.slice(0, 34)}`)
  }
  const bodyOnly = changes.filter((c) => !c.titleChanged).length
  if (bodyOnly > 0) console.log(`  (본문만 바뀐 글 ${bodyOnly}건)`)

  if (!write) {
    console.log("\n(드라이런 — 적용하려면 --write)")
    return
  }
  let ok = 0
  for (const c of changes) {
    const { error: e } = await supabase
      .from("posts")
      .update({ title: c.title, content: c.content })
      .eq("id", c.id)
    if (e) console.error(`  실패 ${c.id}: ${e.message}`)
    else ok++
  }
  console.log(`\n적용 완료: ${ok}/${changes.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

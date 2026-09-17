/** 떡밥 글 세 줄 요약 채우기 (2026-09-18). 기본은 미리보기, --apply 로 저장.
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/summarize-ticker-posts.ts [--apply] [--limit=20] [--hours=24]
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fillMissingSummaries } from "../lib/ticker/summary-store"
import { TICKER_BOT_BY_ROOT } from "../lib/ticker/from-posts"

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const apply = process.argv.includes("--apply")
const limit = Number(arg("limit") ?? 20)
const hours = Number(arg("hours") ?? 24)
/** --kind=interview : 이미 그 종류로 저장된 글만 다시 만든다 (프롬프트 개정 후 재생성용) */
const onlyKind = arg("kind")

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const { data, error } = await db
    .from("posts")
    .select("id, title, content, source_url, source_name, created_at")
    .in("user_id", Object.values(TICKER_BOT_BY_ROOT))
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) throw new Error(error.message)
  let targets = data ?? []
  if (onlyKind) {
    const { data: kinds } = await db
      .from("post_summaries")
      .select("post_id, kind")
      .in(
        "post_id",
        targets.map((p) => p.id)
      )
    const wanted = new Set(
      (kinds ?? []).filter((k) => k.kind === onlyKind).map((k) => String(k.post_id))
    )
    targets = targets.filter((p) => wanted.has(p.id))
  }
  const result = await fillMissingSummaries(db, targets, {
    limit,
    apply,
    force: !!onlyKind || process.argv.includes("--force"),
  })
  const { previews, ...summary } = result
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "preview", posts: data?.length ?? 0, ...summary })
  )
  for (const p of previews) {
    const post = data?.find((d) => d.id === p.postId)
    console.log(`\n■ ${post?.title}\n  [${p.kind}] 출처: ${p.sourceName ?? "?"}`)
    p.lines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`))
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})

/**
 * VS 쟁점 폴 백필 — 이미 발행된 최근 뉴스에 찬반 폴 + 3줄 요약을 생성한다.
 *
 * 발행 훅(lib/news/publish.ts)은 새 글에만 걸리므로, 기능 출시 시점의
 * 기존 글(현재 히어로 포함)은 이 스크립트로 1회 백필한다.
 *
 * 사용법: pnpm exec tsx scripts/generate-vs-backfill.ts [--limit=15]
 * env: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env)
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { createVsPollForPost } from "../lib/news/vs-issue"

config()

const limitArg = process.argv.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Math.min(Number(limitArg.split("=")[1]) || 15, 40) : 15
const NEWS_BOT_USER_ID = "user_bot_soccer_kr"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !process.env.OPENAI_API_KEY) {
    console.error("env 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY")
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, title, content, created_at")
    .eq("user_id", NEWS_BOT_USER_ID)
    .is("deleted_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(LIMIT)
  if (error || !posts) {
    console.error("게시물 조회 실패:", error?.message)
    process.exit(1)
  }

  console.log(`대상 ${posts.length}건 (발행 48h 내, LLM 상한 ${LIMIT})`)
  let created = 0
  for (const p of posts) {
    const before = await supabase.from("polls").select("id").eq("post_id", p.id).maybeSingle()
    if (before.data) {
      console.log(`skip (폴 있음): ${p.title.slice(0, 40)}`)
      continue
    }
    // createVsPollForPost 는 서버용 타입이지만 런타임은 동일한 supabase-js 클라이언트
    await createVsPollForPost(
      supabase as unknown as Parameters<typeof createVsPollForPost>[0],
      p.id,
      p.title,
      p.content
    )
    const after = await supabase.from("polls").select("question").eq("post_id", p.id).maybeSingle()
    if (after.data) {
      created++
      console.log(`✓ ${p.title.slice(0, 40)} → "${after.data.question}"`)
    } else {
      console.log(`— 쟁점 없음/생성 실패: ${p.title.slice(0, 40)}`)
    }
  }
  console.log(`완료: ${created}건 생성`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

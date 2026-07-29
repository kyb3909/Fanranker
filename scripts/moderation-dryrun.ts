/**
 * 광고 룰 필터 드라이런 (P1 Phase 3) — **읽기 전용**. 어떤 조치도 실행하지 않는다.
 *
 * 최근 게시물 N건에 필터를 돌리고 점수 순 상위 20건을 출력한다.
 * 운영자가 육안으로 오탐을 확인한 뒤 임계값을 조정하는 것이 목적.
 *
 * 사용법:
 *   pnpm exec tsx scripts/moderation-dryrun.ts            # 최근 500건
 *   pnpm exec tsx scripts/moderation-dryrun.ts --limit=200
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { runAdFilter, extractAllText } from "../lib/moderation/ad-filter"
import type { TipTapNode } from "../types/post"

config()

const limitArg = process.argv.find((a) => a.startsWith("--limit="))
const LIMIT = limitArg ? Math.min(Number(limitArg.split("=")[1]) || 500, 2000) : 500

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env)")
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log(`최근 게시물 ${LIMIT}건 조회 중… (읽기 전용)`)
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, title, content, created_at, user_id, community_slug")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT)
  if (error || !posts) {
    console.error("게시물 조회 실패:", error?.message)
    process.exit(1)
  }

  // 작성자 가입일 (신규계정 신호)
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, created_at")
    .in("user_id", userIds)
  const signupAt = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.user_id, p.created_at])
  )

  // 도배 판정용: 배치 안에서 작성자별로 묶는다.
  // ⚠️ 근사치다 — 배치(최근 N건) 밖의 글은 못 본다. 실전 배선 시엔 DB 조회로 대체.
  const byAuthor = new Map<string, Array<{ text: string; createdAt: Date }>>()
  const prepared = posts.map((p) => {
    const text = [p.title, extractAllText(p.content as TipTapNode)].filter(Boolean).join(" ")
    const createdAt = new Date(p.created_at ?? 0)
    const list = byAuthor.get(p.user_id) ?? []
    list.push({ text, createdAt })
    byAuthor.set(p.user_id, list)
    return { post: p, text, createdAt }
  })

  const results = prepared.map(({ post, text, createdAt }) => {
    const signup = signupAt.get(post.user_id)
    const authorAgeDays = signup
      ? (createdAt.getTime() - new Date(signup).getTime()) / 86400_000
      : null
    const others = (byAuthor.get(post.user_id) ?? []).filter((o) => o.text !== text)
    const result = runAdFilter({
      text,
      authorAgeDays,
      createdAt,
      otherPostsBySameAuthor: others,
    })
    return { post, result }
  })

  const flagged = results.filter((r) => r.result.score > 0)
  flagged.sort((a, b) => b.result.score - a.result.score)

  console.log(`\n총 ${posts.length}건 중 신호 1개 이상: ${flagged.length}건`)
  const dist = { BLIND: 0, VISIBILITY_DOWN: 0, NO_ACTION: 0 }
  for (const r of flagged) dist[r.result.action]++
  console.log(
    `조치 분포: BLIND ${dist.BLIND} / VISIBILITY_DOWN ${dist.VISIBILITY_DOWN} / NO_ACTION(기록만) ${dist.NO_ACTION}`
  )

  console.log(`\n── 상위 20건 ──────────────────────────────`)
  for (const { post, result } of flagged.slice(0, 20)) {
    console.log(
      `\n[${result.score.toFixed(2)}] ${result.action}  ${post.title.slice(0, 60)}` +
        `\n  https://gongnori.fan/post/${post.id}  (${post.community_slug ?? "?"}, ${post.created_at})` +
        result.signals.map((s) => `\n  · ${s.id}: ${s.detail}`).join("")
    )
  }
  if (flagged.length === 0) console.log("(신호에 걸린 게시물 없음)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

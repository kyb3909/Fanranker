// 기존 봇 뉴스 글 본문에서 image 노드 제거 (2026-08-16 운영자: "본문에서는 빼줘")
// 썸네일(posts.image)은 유지 — 신규 발행분은 publish.ts stripImageNodes 가 이미 처리.
// 사용: node scripts/_strip-bot-post-images.mjs [--apply]
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function stripImageNodes(content) {
  const clone = structuredClone(content)
  const walk = (node) => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node.content)) {
      node.content = node.content.filter((c) => c?.type !== "image")
      for (const child of node.content) walk(child)
    }
  }
  walk(clone)
  return clone
}

function hasImage(node) {
  if (!node || typeof node !== "object") return false
  if (node.type === "image") return true
  return Array.isArray(node.content) && node.content.some(hasImage)
}

let scanned = 0
let withImg = 0
let updated = 0
for (let from = 0; ; from += 500) {
  const { data, error } = await sb
    .from("posts")
    .select("id, title, content")
    .eq("user_id", "user_bot_soccer_kr")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, from + 499)
  if (error) throw new Error(error.message)
  for (const p of data ?? []) {
    scanned++
    if (!hasImage(p.content)) continue
    withImg++
    if (APPLY) {
      const { error: e } = await sb
        .from("posts")
        .update({ content: stripImageNodes(p.content) })
        .eq("id", p.id)
      if (e) console.error("✗", p.id, e.message)
      else updated++
    } else if (withImg <= 5) {
      console.log("·", String(p.title).slice(0, 60))
    }
  }
  if (!data || data.length < 500) break
}
console.log(
  `스캔 ${scanned}건 / 본문 이미지 보유 ${withImg}건 / ${APPLY ? `제거 완료 ${updated}건` : "dry-run (--apply 로 적용)"}`
)

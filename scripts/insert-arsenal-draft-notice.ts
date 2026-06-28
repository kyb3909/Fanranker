/**
 * 아스날 드래프트 선수 몸값 의견 수렴 공지글 생성 (1회성).
 * public/data/arsenal-players.json → TipTap 표(포지션별) 본문으로 posts 에 INSERT.
 *   pnpm exec tsx scripts/insert-arsenal-draft-notice.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import path from "path"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(URL, KEY)

const USER_ID = "user_3APv7ZaJqtn3y54WXDHL36ZUrQz" // 몽몽이(kyb3909)
const CATEGORY_ID = "22105623-6c99-487d-975f-15073e0990fc" // football
const COMMUNITY_SLUG = "football"
const TITLE = "[드래프트] 아스날 선수 몸값 — 의견 받습니다 (GPT 1차 선정)"

interface Player {
  nameKo: string
  name: string
  position: "GK" | "DF" | "MF" | "FW"
  price: number
}
const players: Player[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/data/arsenal-players.json"), "utf8")
)

// ── TipTap 노드 헬퍼 ──
type Node = Record<string, unknown>
const t = (s: string, bold = false): Node => ({
  type: "text",
  text: s,
  ...(bold ? { marks: [{ type: "bold" }] } : {}),
})
const para = (s = ""): Node => (s ? { type: "paragraph", content: [t(s)] } : { type: "paragraph" })
const heading = (level: number, s: string): Node => ({
  type: "heading",
  attrs: { level },
  content: [t(s)],
})
const cell = (s: string, header = false): Node => ({
  type: header ? "tableHeader" : "tableCell",
  content: [{ type: "paragraph", content: s ? [t(s, header)] : [] }],
})
const row = (cells: Node[]): Node => ({ type: "tableRow", content: cells })

function positionBlock(label: string, pos: Player["position"]): Node[] {
  const list = players
    .filter((p) => p.position === pos)
    .sort((a, b) => b.price - a.price || a.nameKo.localeCompare(b.nameKo))
  const rows: Node[] = [row([cell("선수", true), cell("몸값", true)])]
  for (const p of list) rows.push(row([cell(p.nameKo), cell(String(p.price))]))
  return [heading(3, `${label} · ${list.length}명`), { type: "table", content: rows }]
}

const doc: Node = {
  type: "doc",
  content: [
    para("GPT가 자료를 모아 아스날 선수들의 드래프트 몸값을 1차로 아래처럼 매겨봤습니다."),
    para("그런데 솔직히 말이 안 되는 값이 꽤 많습니다."),
    para(
      "이 선수는 너무 높다 / 너무 낮다 싶은 게 있으면 댓글로 남겨주세요. 의견 적극 반영하겠습니다!"
    ),
    { type: "horizontalRule" },
    ...positionBlock("공격수 (FW)", "FW"),
    ...positionBlock("미드필더 (MF)", "MF"),
    ...positionBlock("수비수 (DF)", "DF"),
    ...positionBlock("골키퍼 (GK)", "GK"),
  ],
}

async function main() {
  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: USER_ID,
      category_id: CATEGORY_ID,
      community_slug: COMMUNITY_SLUG,
      title: TITLE,
      content: doc,
      is_global_notice: true,
    })
    .select("id")
    .single()
  if (error) {
    console.error("INSERT 실패:", error)
    process.exit(1)
  }
  console.log("✅ 공지글 생성:", data.id, "(선수", players.length, "명)")
}
main()

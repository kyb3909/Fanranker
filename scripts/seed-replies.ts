/**
 * 시드 글에 답글 채우기 (2026-08-23 운영자: "각각의 댓글 글에 붙여줘서 좀 채워넣어줘").
 *
 * reddit-daily-seed 로 등록된 페르소나 글 중 **댓글 0인 것**을 찾아, 글 내용에 반응하는
 * 답글 2~3개를 각색해 붙인다. 레딧을 다시 긁지 않으므로(=글 자체가 재료) 레딧 예산과
 * 무관하다 — 이미 등록된 글의 뒤늦은 보강용.
 *
 * 정책은 reddit-daily-seed 와 동일: 순한 맛 반말체, 시비조·저격 금지, 자기 팀 이야기,
 * 표기는 한국 축구 미디어 정착형. 답글 작성자는 **글쓴이를 뺀 페르소나** 로테이션
 * (자문자답 금지).
 *
 * 사용법:
 *   pnpm exec tsx scripts/seed-replies.ts [--board=arsenal] [--hours=24] [--post]
 *   기본은 미리보기(dry) — --post 를 붙여야 실제 등록.
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { resolve } from "node:path"
import { chatParams } from "../lib/llm/openai-params"
import { TEAM_BOARDS } from "../lib/constants/team-boards"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const MODEL = process.env.SEED_MODEL || "gpt-5.6-luna"
const PERSONAS = ["user_persona_light", "user_persona_meme", "user_persona_dawn"]

interface TargetPost {
  id: string
  title: string
  body: string
  userId: string
}

/** TipTap doc → 평문 (LLM 재료용) */
function tiptapToText(content: unknown): string {
  const doc = content as { content?: { content?: { text?: string }[] }[] } | null
  if (!doc?.content) return ""
  return doc.content
    .map((p) => (p.content ?? []).map((t) => t.text ?? "").join(""))
    .filter(Boolean)
    .join("\n")
}

async function writeReplies(team: string, posts: TargetPost[]): Promise<Record<string, string[]>> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY 가 .env 에 없습니다")

  const sys = `너는 한국 축구 커뮤니티 ${team} 게시판의 유저들이다. 아래 글들에 **다른 사람들이 다는 답글**을 쓴다.

## 규칙
- 글마다 답글 **2~3개**. 각 답글은 1~2문장, 글보다 짧게.
- **서로 다른 사람의 목소리**여야 한다 — 동의·다른 의견·가벼운 농담이 섞이게. 전부
  맞장구만 치면 가짜 티가 난다.
- 말투: 한국 축구 커뮤 반말체("~냐", "~임", "~지", "ㅋㅋ" 허용). 이모지 금지, 존댓말 금지.
- **톤은 순한 맛** — 시비조·저격·욕설 금지. 반대 의견도 가볍고 유쾌하게.
- 글 내용을 요약하지 말고 **반응**해라. 새 정보(이적설·기록 등 사실 주장)를 지어내지 마라.
- 선수·감독·구단 이름은 원문에 나온 표기를 그대로 쓴다. 확신 없으면 이름을 새로 만들지 마라.

JSON 으로만 답하라: {"replies":{"<글번호>":["답글1","답글2"]}}`

  const user = posts.map((p, i) => `[${i + 1}] 제목: ${p.title}\n본문: ${p.body}`).join("\n\n")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      ...chatParams(MODEL, { temperature: 0.85, max_tokens: 1500 }),
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  const parsed = JSON.parse(data.choices[0].message.content) as {
    replies?: Record<string, string[]>
  }

  // "1","2"… 인덱스 키 → post id 로 환원
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(parsed.replies ?? {})) {
    const idx = Number(k) - 1
    const target = posts[idx]
    if (!target || !Array.isArray(v)) continue
    out[target.id] = v.filter((r) => typeof r === "string" && r.trim()).slice(0, 3)
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const doPost = args.includes("--post")
  const boardArg = args.find((a) => a.startsWith("--board="))?.slice(8)
  const hours = Number(args.find((a) => a.startsWith("--hours="))?.slice(8) ?? 24)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const boards = boardArg ? [boardArg] : Object.keys(TEAM_BOARDS)
  let totalReplies = 0

  for (const board of boards) {
    const { data: rows } = await supabase
      .from("posts")
      .select("id, title, content, user_id, comment_count")
      .eq("community_slug", board)
      .like("user_id", "user_persona_%")
      .eq("comment_count", 0)
      .is("deleted_at", null)
      .gte("created_at", new Date(Date.now() - hours * 3600_000).toISOString())
      .order("created_at", { ascending: true })
    if (!rows || rows.length === 0) continue

    const targets: TargetPost[] = rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      body: tiptapToText(r.content),
      userId: String(r.user_id),
    }))
    const team = TEAM_BOARDS[board]?.name ?? board

    console.log(`\n[${board}] 댓글 0인 글 ${targets.length}건 → 답글 생성 중 (${MODEL})…`)
    const replyMap = await writeReplies(team, targets)

    for (const t of targets) {
      const replies = replyMap[t.id] ?? []
      console.log(`── ${t.title}`)
      for (const r of replies) console.log(`   └ ${r}`)
      if (!doPost || replies.length === 0) continue

      const others = PERSONAS.filter((p) => p !== t.userId)
      for (const [j, r] of replies.entries()) {
        const { error } = await supabase.from("comments").insert({
          post_id: t.id,
          user_id: others[j % others.length],
          content: r.slice(0, 1000),
        })
        if (error) {
          console.error(`   답글 실패: ${error.message}`)
          continue
        }
        totalReplies++
      }
    }
  }

  console.log(
    doPost
      ? `\n등록 완료: 답글 ${totalReplies}건`
      : `\n미리보기 — 등록하려면 --post 를 붙여 다시 실행하세요.`
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

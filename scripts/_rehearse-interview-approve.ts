/**
 * 인터뷰 카드 승인 리허설 — /api/admin/interviews POST(approve) 와 같은 경로를
 * 검수자 수정(표기 교정) 포함으로 1회 실행한다.
 *
 * 실행: pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_rehearse-interview-approve.ts
 */
import "dotenv/config"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { appendEntry } from "@/lib/saga/create"

async function main() {
  const supabase = createServiceRoleClient()

  const { data: card } = await supabase
    .from("interview_cards")
    .select("*")
    .eq("status", "ready")
    .limit(1)
    .maybeSingle()
  if (!card) {
    console.log("ready 카드 없음")
    return
  }

  // 검수자 수정 — 발행 기사와 표기 통일 (밀로스 케르케스 → 미로시 케르케즈)
  const speaker = "미로시 케르케즈"
  const headline = "케르케즈, 결혼 오해 해명"

  const { data: saga } = await supabase
    .from("sagas")
    .select("id, stage, slug")
    .eq("saga_type", "season")
    .eq("status", "active")
    .filter("subject->>team_id", "eq", card.team_id)
    .maybeSingle()
  if (!saga) throw new Error(`시즌 사가 없음: ${card.team_id}`)

  const quotes = (card.quotes ?? []) as { en: string; ko: string }[]
  const summary = quotes
    .map((q) => `“${q.ko.trim().replace(/^["“]|["”]$/g, "")}” — ${speaker}`)
    .join("\n\n")
  const outlet = card.source_url
    ? new URL(card.source_url).hostname.replace(/^www\./, "")
    : "reddit"

  const entry = await appendEntry(supabase, saga.id as string, "season", saga.stage as string, {
    clusterKey: `interview:${card.id}`,
    headline: `[인터뷰] ${headline}`,
    summary,
    tier: "tier1",
    stageAfter: null,
    origin: { outlet, url: card.source_url ?? "", reporter: speaker },
    occurredAt: card.occurred_at as string,
  })

  await supabase
    .from("interview_cards")
    .update({
      status: "published",
      speaker,
      headline_ko: headline,
      saga_id: saga.id,
      entry_id: entry?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", card.id)

  console.log(`발행 완료 → /saga/${saga.slug} (entry ${entry?.id})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

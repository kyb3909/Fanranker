/**
 * done(오피셜) 사가 재산정 — 2026-08-06 오너 확정 규칙의 소급 적용.
 *
 * 규칙: "오피셜은 말 그대로 완전 확정이라는 이야기가 나와야만 가능해" —
 * done 단계 진입은 official 티어 보도에서만 (lib/saga/stages.ts gatedStageSignal).
 *
 * 이 규칙이 생기기 전에 루머·유력의 완료 주장만으로 done 에 올라간 사가들이 있고,
 * 그중 일부는 '간주' 오분류(OFFICIAL_RE 실사고)로 official 티어까지 박제됐다.
 * 저장된 티어를 믿지 않고 **교정된 분류기로 엔트리 전수를 재분류**한 뒤, 게이트를
 * 적용한 단계 전이를 처음부터 다시 걸어 사가의 현재 단계·노출 상태를 재산정한다.
 *
 * 실행:
 *   pnpm exec tsx scripts/saga-restage-done.ts          # 드라이런 (변경 없음)
 *   pnpm exec tsx scripts/saga-restage-done.ts --apply  # 실제 적용
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { classifyTier } from "../lib/transfer/feed"
import { gatedStageSignal, nextStage, isValidStage } from "../lib/saga/stages"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("환경변수 없음: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const supabase = createClient(url, key)
const apply = process.argv.includes("--apply")

interface EntryRow {
  id: string
  headline: string
  tier: string
  stage_after: string | null
  origin: { url?: string | null } | null
  occurred_at: string
}

async function main() {
  const { data: sagas, error } = await supabase
    .from("sagas")
    .select("id, slug, title, stage, is_confirmed")
    .eq("saga_type", "transfer")
    .eq("status", "active")
    .eq("stage", "done")
    .order("slug")
  if (error) throw error

  console.log(
    `대상: active + stage=done 사가 ${sagas?.length ?? 0}건 (${apply ? "적용" : "드라이런"})\n`
  )

  let changed = 0
  for (const saga of sagas ?? []) {
    const { data: entries, error: entryError } = await supabase
      .from("saga_entries")
      .select("id, headline, tier, stage_after, origin, occurred_at")
      .eq("saga_id", saga.id)
      .order("occurred_at", { ascending: true })
    if (entryError) throw entryError

    // 엔트리 전수를 교정된 분류기로 재분류하고, 게이트 적용 전이를 처음부터 재실행
    let stage = "interest"
    let confirmed = false
    const trail: string[] = []
    for (const e of (entries ?? []) as EntryRow[]) {
      const correctedTier = classifyTier({
        category: null,
        original_title: e.headline,
        headline_kr: e.headline,
        link_url: e.origin?.url ?? null,
        source_id: null,
      })
      const signal = e.stage_after && isValidStage("transfer", e.stage_after) ? e.stage_after : null
      const effective = gatedStageSignal(signal, correctedTier)
      stage = nextStage("transfer", stage, effective)
      if (effective === "done" && correctedTier === "official") confirmed = true
      if (effective && effective !== "done") confirmed = false // 후퇴 시 재잠금 (confirmationPatch 와 동일)
      trail.push(
        `    · ${e.occurred_at.slice(5, 16)} [${e.tier}→${correctedTier}] ${signal ?? "-"}${
          effective !== signal ? "(게이트 차단)" : ""
        } | ${e.headline.slice(0, 56)}`
      )
    }

    const stageChanged = stage !== saga.stage
    const confirmedChanged = confirmed !== saga.is_confirmed
    if (!stageChanged && !confirmedChanged) {
      console.log(`= ${saga.slug} — 유지 (done, is_confirmed=${saga.is_confirmed})`)
      continue
    }

    changed++
    console.log(
      `${apply ? "✎" : "→"} ${saga.slug}: stage ${saga.stage}→${stage}, is_confirmed ${saga.is_confirmed}→${confirmed}`
    )
    for (const line of trail) console.log(line)

    if (apply) {
      const { error: updateError } = await supabase
        .from("sagas")
        .update({ stage, is_confirmed: confirmed, updated_at: new Date().toISOString() })
        .eq("id", saga.id)
        .eq("stage", "done") // 그 사이 다른 전이가 있었으면 덮지 않는다
      if (updateError) throw updateError
    }
  }

  console.log(
    `\n변경 ${changed}건 / 전체 ${sagas?.length ?? 0}건${apply ? " — 적용 완료" : " — 드라이런 (--apply 로 적용)"}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

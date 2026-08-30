/**
 * MoTM 후보판 보강 CLI (2026-08-31 일회성 브리지).
 *
 * 라인업 벤치가 뒤늦게 복구된 뒤, **이미 만들어진** 폴의 후보판을 다시 짠다.
 * 같은 일을 `/api/cron/motm-sync` 가 15분마다 하지만(sweepMotmPolls 3-b),
 * 그건 배포 후에야 돈다 — 열린 폴이 오늘 11:00 KST 에 닫히므로 그 전에 손으로 한 번.
 *
 * 판정 로직은 전부 순수 모듈(`lib/motm/options.ts`)을 그대로 부른다 — 크론과 두 벌이
 * 되지 않게 하는 것이 이 파일의 유일한 규율이다.
 *
 *   pnpm exec tsx scripts/repair-motm-options.ts          # 미리보기
 *   pnpm exec tsx scripts/repair-motm-options.ts --post   # 적용
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
import { buildMotmOptions, mergeMotmOptions, pickRichestLineup } from "@/lib/motm/options"
import type { MotmOption } from "@/lib/motm/options"
import type { LineupResponse } from "@/lib/soccerway/lineup-lookup"
import type { LfaTimelineEvent } from "@/lib/lfa/match"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function main() {
  const apply = process.argv.includes("--post")
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: polls } = await sb
    .from("polls")
    .select("id, question, match_key, game_id, options")
    .eq("kind", "motm")
    .eq("is_active", true)

  const targets = (polls ?? []).filter(
    (p) => !((p.options as MotmOption[] | null) ?? []).some((o) => o.group === "sub")
  )
  console.log(
    `열린 폴 ${polls?.length ?? 0}개 중 교체 후보 없는 폴 ${targets.length}개${apply ? "" : " — 미리보기"}`
  )

  let done = 0
  const skipped: Record<string, number> = {}
  const bump = (k: string) => (skipped[k] = (skipped[k] ?? 0) + 1)

  for (const p of targets) {
    // match_key = "홈_원정_킥오프" — 같은 경기의 betman 형제 행을 전부 모은다
    const [homeTeam, awayTeam, matchTime] = String(p.match_key).split("_")
    const { data: games } = await sb
      .from("betman_games")
      .select("id")
      .eq("home_team_name", homeTeam)
      .eq("away_team_name", awayTeam)
      .eq("match_time", matchTime)
    const gameIds = (games ?? []).map((g) => String(g.id))
    if (gameIds.length === 0) {
      bump("경기_없음")
      continue
    }

    const { data: lus } = await sb.from("match_lineups").select("payload").in("game_id", gameIds)
    const lineup = pickRichestLineup(
      (lus ?? []).map((r) => r.payload as unknown as LineupResponse | null)
    )
    if (!lineup) {
      bump("라인업_없음")
      continue
    }

    const { data: dets } = await sb
      .from("match_details_cache")
      .select("payload")
      .in("game_id", gameIds)
    // 형제 행마다 적재 시점이 달라 타임라인 길이가 다르다 — 가장 긴 것이 정본
    let timeline: LfaTimelineEvent[] = []
    for (const d of dets ?? []) {
      const t = ((d.payload as { timeline?: LfaTimelineEvent[] } | null)?.timeline ??
        []) as LfaTimelineEvent[]
      if (t.length > timeline.length) timeline = t
    }

    const enriched = timeline.length ? enrichLineupWithTimeline(lineup, timeline) : lineup
    const rebuilt = buildMotmOptions(enriched)
    if (!rebuilt) {
      bump("후보_생성실패")
      continue
    }

    const { count } = await sb
      .from("poll_votes")
      .select("id", { count: "exact", head: true })
      .eq("poll_id", p.id)
    const existing = (p.options as MotmOption[] | null) ?? []
    const merged = mergeMotmOptions(existing, rebuilt, (count ?? 0) > 0)
    if (!merged) {
      bump("변화_없음")
      continue
    }

    const subs = merged.filter((o) => o.group === "sub").length
    console.log(
      `  ${apply ? "적용" : "예정"} ${p.question} — 후보 ${existing.length} → ${merged.length} (교체 ${subs}명, 표 ${count ?? 0})`
    )
    if (apply) {
      const { error } = await sb.from("polls").update({ options: merged }).eq("id", p.id)
      if (error) {
        bump(`쓰기_${error.code ?? "실패"}`)
        continue
      }
    }
    done++
  }

  console.log(`\n${apply ? "적용" : "적용 예정"} ${done}/${targets.length}개`)
  if (Object.keys(skipped).length) console.log("건너뜀:", skipped)
  if (!apply) console.log("\n--post 를 붙이면 실제로 적용합니다.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

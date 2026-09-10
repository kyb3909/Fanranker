/**
 * 매치 워크플로우 6단계 실측 (2026-08-30).
 *
 * 운영자: "나는 저 워크플로우가 문제 없이 구현되는 게 가장 중요해."
 *
 *   ① 경기 일정          betman_games + lfa_fixtures
 *   ② 매치 ID 확보       match_details_cache.lfa_match_id
 *   ③ 라인업 → 불판      match_lineups / posts.match_game_id
 *   ④ 실시간 점수·스탯   payload.homeScore · payload.stats
 *   ⑤ MOM 투표          polls(kind='motm').match_key
 *   ⑥ 매치 리포트        match_reports
 *
 * ⚠️ 베트맨 형제 행과 명시적으로 연결된 LFA UUID를 한 경기로 묶고,
 *    하위 단계는 **그 묶음의 어느 id 로든** 걸리면 통과로 본다. 안 접으면 한 경기가
 *    5건으로 세어져 통과율이 거짓말을 한다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_check-workflow.ts
 *   ... --back 6 --hours 10
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"
import { loadAuditMatchGroups } from "@/lib/ops/match-identities"
import { inspectMatchWorkflow, type WorkflowEvidence } from "@/lib/ops/match-workflow"

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const hhmm = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
const pad = (s: string, n: number) => {
  const w = [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0)
  return s + " ".repeat(Math.max(0, n - w))
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => {
      if ((init?.method ?? "GET").toUpperCase() !== "GET") throw new Error("읽기 전용 점검")
      return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
    } } }
  )
  const back = arg("--back", 6)
  const fwd = arg("--hours", 10)
  const from = new Date(Date.now() - back * 3600_000).toISOString()
  const to = new Date(Date.now() + fwd * 3600_000).toISOString()

  const list = (await loadAuditMatchGroups(db, from, to))
    .filter((g) => MATCH_PAGE_LEAGUES.has(String(g.leagueCode)))
  console.log(
    `매치데이 점검 · ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n` +
      `대상 ${list.length}경기 (화이트리스트, -${back}h ~ +${fwd}h)\n`
  )
  if (list.length === 0) return

  const { rows, errors } = await inspectMatchWorkflow(db, list)
  const m = (b: boolean | null) => b == null ? "? " : b ? "✅" : "· "
  const now = Date.now()
  const tally = { id: 0, lineup: 0, thread: 0, score: 0, stat: 0, motm: 0, report: 0, started: 0 }

  console.log(
    `${pad("킥오프", 12)} ${pad("리그", 7)} ${pad("경기", 34)} ②ID ③라인 ③불판 ④점수 ④스탯 ⑤MOM ⑥리포트`
  )
  const unknown = { id: 0, lineup: 0, thread: 0, score: 0, stat: 0, motm: 0, report: 0 }
  for (const { group: g, evidence } of rows) {
    const { id: hasId, lineup: hasLineup, thread: hasThread, score: hasScore,
      stat: hasStat, motm: hasMotm, report: hasReport } = evidence
    for (const key of Object.keys(unknown) as (keyof WorkflowEvidence)[]) {
      if (evidence[key] == null) unknown[key]++
    }
    const started = new Date(g.matchTime).getTime() <= now

    if (started) tally.started++
    if (hasId) tally.id++
    if (hasLineup) tally.lineup++
    if (hasThread) tally.thread++
    if (hasScore) tally.score++
    if (hasStat) tally.stat++
    if (hasMotm) tally.motm++
    if (hasReport) tally.report++

    console.log(
      `${pad(hhmm(g.matchTime), 12)} ${pad(g.leagueCode ?? "?", 7)} ` +
        `${pad(`${g.homeTeam.slice(0, 10)} vs ${g.awayTeam.slice(0, 10)}`, 34)} ` +
        ` ${m(hasId)}  ${m(hasLineup)}   ${m(hasThread)}   ${m(hasScore)}  ${m(hasStat)}  ${m(hasMotm)}  ${m(hasReport)}`
    )
  }
  console.log(
    `\n합계 ${list.length}경기 (시작됨 ${tally.started}) — ` +
      `ID ${tally.id} · 라인업 ${tally.lineup} · 불판 ${tally.thread} · ` +
      `점수 ${tally.score} · 스탯 ${tally.stat} · MOM ${tally.motm} · 리포트 ${tally.report}`
  )
  console.log("표시: ✅ 저장 확인 / · 저장 없음 / ? 확인 불가")
  if (errors.length) {
    console.error("확인 불가:", errors.join(" | "))
    console.error("단계별 확인 불가 건수:", unknown)
    process.exitCode = 1
  }
}
main().catch((error) => {
  console.error("경기 목록 확인 불가:", error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

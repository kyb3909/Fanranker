/**
 * 매치 워크플로우 6단계 실측 (2026-08-30).
 *
 * 운영자: "나는 저 워크플로우가 문제 없이 구현되는 게 가장 중요해."
 *
 *   ① 베트맨 일정        betman_games 행
 *   ② 매치 ID 확보       match_details_cache.lfa_match_id
 *   ③ 라인업 → 불판      match_lineups / posts.match_game_id
 *   ④ 실시간 점수·스탯   payload.homeScore · payload.stats
 *   ⑤ MOM 투표          polls(kind='motm').match_key
 *   ⑥ 매치 리포트        match_reports
 *
 * ⚠️ betman_games 는 같은 경기가 game_type 별로 여러 행이다 — (시각·홈·원정)으로 접고,
 *    하위 단계는 **그 묶음의 어느 id 로든** 걸리면 통과로 본다. 안 접으면 한 경기가
 *    5건으로 세어져 통과율이 거짓말을 한다.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_check-workflow.ts
 *   ... --back 6 --hours 10
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const back = arg("--back", 6)
  const fwd = arg("--hours", 10)
  const from = new Date(Date.now() - back * 3600_000).toISOString()
  const to = new Date(Date.now() + fwd * 3600_000).toISOString()

  const { data: games } = await db
    .from("betman_games")
    .select("id, match_time, league_code, home_team_name, away_team_name, status")
    .eq("sport", "축구")
    .gte("match_time", from)
    .lt("match_time", to)
    .order("match_time")

  // (시각·홈·원정)으로 접는다 — 같은 경기의 모든 betman id 를 한 묶음으로
  const groups = new Map<
    string,
    { ids: string[]; time: string; league: string; home: string; away: string }
  >()
  for (const g of games ?? []) {
    if (!MATCH_PAGE_LEAGUES.has(String(g.league_code))) continue
    const key = `${g.match_time}|${g.home_team_name}|${g.away_team_name}`
    const prev = groups.get(key)
    if (prev) prev.ids.push(String(g.id))
    else
      groups.set(key, {
        ids: [String(g.id)],
        time: String(g.match_time),
        league: String(g.league_code),
        home: String(g.home_team_name),
        away: String(g.away_team_name),
      })
  }
  const list = [...groups.values()]
  console.log(
    `매치데이 점검 · ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n` +
      `대상 ${list.length}경기 (화이트리스트, -${back}h ~ +${fwd}h)\n`
  )
  if (list.length === 0) return

  const allIds = list.flatMap((g) => g.ids)
  const [details, lineups, threads, reports, polls] = await Promise.all([
    db.from("match_details_cache").select("game_id, lfa_match_id, payload").in("game_id", allIds),
    db.from("match_lineups").select("game_id").in("game_id", allIds),
    db.from("posts").select("match_game_id").in("match_game_id", allIds),
    db.from("match_reports").select("game_id").in("game_id", allIds),
    db.from("polls").select("match_key").eq("kind", "motm"),
  ])
  const detMap = new Map((details.data ?? []).map((d) => [String(d.game_id), d]))
  const lineSet = new Set((lineups.data ?? []).map((l) => String(l.game_id)))
  const threadSet = new Set((threads.data ?? []).map((t) => String(t.match_game_id)))
  const reportSet = new Set((reports.data ?? []).map((r) => String(r.game_id)))
  const pollKeys = new Set((polls.data ?? []).map((p) => String(p.match_key)))

  const m = (b: boolean) => (b ? "✅" : "· ")
  const now = Date.now()
  const tally = { id: 0, lineup: 0, thread: 0, score: 0, stat: 0, motm: 0, report: 0, started: 0 }

  console.log(
    `${pad("킥오프", 12)} ${pad("리그", 7)} ${pad("경기", 34)} ②ID ③라인 ③불판 ④점수 ④스탯 ⑤MOM ⑥리포트`
  )
  for (const g of list) {
    const det = g.ids.map((i) => detMap.get(i)).find(Boolean)
    const p = (det?.payload ?? {}) as Record<string, unknown>
    const stats = p.stats
    const hasId = !!det?.lfa_match_id
    const hasLineup = g.ids.some((i) => lineSet.has(i))
    const hasThread = g.ids.some((i) => threadSet.has(i))
    const hasScore = p.homeScore != null && p.awayScore != null
    const hasStat = Array.isArray(stats) ? stats.length > 0 : !!stats
    const hasMotm = g.ids.some((i) => pollKeys.has(i))
    const hasReport = g.ids.some((i) => reportSet.has(i))
    const started = new Date(g.time).getTime() <= now

    if (started) tally.started++
    if (hasId) tally.id++
    if (hasLineup) tally.lineup++
    if (hasThread) tally.thread++
    if (hasScore) tally.score++
    if (hasStat) tally.stat++
    if (hasMotm) tally.motm++
    if (hasReport) tally.report++

    console.log(
      `${pad(hhmm(g.time), 12)} ${pad(g.league, 7)} ` +
        `${pad(`${g.home.slice(0, 10)} vs ${g.away.slice(0, 10)}`, 34)} ` +
        ` ${m(hasId)}  ${m(hasLineup)}   ${m(hasThread)}   ${m(hasScore)}  ${m(hasStat)}  ${m(hasMotm)}  ${m(hasReport)}`
    )
  }
  console.log(
    `\n합계 ${list.length}경기 (시작됨 ${tally.started}) — ` +
      `ID ${tally.id} · 라인업 ${tally.lineup} · 불판 ${tally.thread} · ` +
      `점수 ${tally.score} · 스탯 ${tally.stat} · MOM ${tally.motm} · 리포트 ${tally.report}`
  )
}
main()

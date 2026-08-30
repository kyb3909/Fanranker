/**
 * 라이브 경로 점검 — 프리뷰 · 일정 · 라인업 · 실시간 점수 · 라이브 스탯 (2026-08-30).
 *
 * 운영자: "라이브 스탯과 중계가 가장 중요하다. 그 부분이 제대로 되는지 파악하는 게 제일 중요."
 *
 * 무엇을 보는가 (전부 화면이 실제로 읽는 자리)
 *   일정   lfa_day_cache          — lfa-warm cron(15분)이 데우는 날짜별 목록
 *   프리뷰 match_preview_cache    — 매치 페이지 렌더에서 채움 (킥오프 후 영구)
 *   라인업 match_lineups          — game_id = betman_games.id
 *   점수   match_details_cache    — payload.homeScore/awayScore/minute
 *   스탯   match_details_cache    — payload.stats
 *
 * ⚠️ betman_games 는 같은 경기가 game_type 별로 여러 행이다 — (시각·홈·원정)으로 접는다.
 * ⚠️ mapped_match_id 는 **죽은 컬럼**이다(코드에서 아무도 안 읽는다). 0% 라고 놀라지 말 것.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.server-stub.json scripts/_check-live-paths.ts
 *   ... --hours 8      (앞으로 몇 시간까지 볼지, 기본 8)
 *   ... --back 4       (지난 몇 시간까지 볼지, 기본 4 — 진행 중 경기를 잡는다)
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"

const arg = (k: string, d: number) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const back = arg("--back", 4)
  const fwd = arg("--hours", 8)
  const from = new Date(Date.now() - back * 3600_000).toISOString()
  const to = new Date(Date.now() + fwd * 3600_000).toISOString()

  // ── 일정 ──
  const { data: days } = await db
    .from("lfa_day_cache")
    .select("date_utc, updated_at, payload")
    .order("updated_at", { ascending: false })
    .limit(4)
  console.log("── 일정 (lfa_day_cache) ──")
  for (const d of days ?? []) {
    const age = Math.round((Date.now() - new Date(String(d.updated_at)).getTime()) / 60000)
    const n = Array.isArray(d.payload) ? d.payload.length : 0
    console.log(`   ${d.date_utc}  ${String(n).padStart(4)}경기  ${age}분 전 갱신`)
  }

  // ── 대상 경기 (중복 접기) ──
  const { data: games } = await db
    .from("betman_games")
    .select("id, match_time, league_code, home_team_name, away_team_name, status")
    .eq("sport", "축구")
    .gte("match_time", from)
    .lt("match_time", to)
    .order("match_time")
  const uniq = new Map<string, NonNullable<typeof games>[number]>()
  for (const g of games ?? []) {
    if (!MATCH_PAGE_LEAGUES.has(String(g.league_code))) continue
    const key = `${g.match_time}|${g.home_team_name}|${g.away_team_name}`
    if (!uniq.has(key)) uniq.set(key, g)
  }
  const list = [...uniq.values()]
  console.log(`\n── 대상 경기 ${list.length}건 (화이트리스트 리그, -${back}h ~ +${fwd}h) ──`)
  if (list.length === 0) return

  const ids = list.map((g) => String(g.id))
  const [{ data: details }, { data: lineups }] = await Promise.all([
    db.from("match_details_cache").select("game_id, lfa_match_id, payload, updated_at").in("game_id", ids),
    db.from("match_lineups").select("game_id, updated_at").in("game_id", ids),
  ])
  const dMap = new Map((details ?? []).map((d) => [String(d.game_id), d]))
  const lMap = new Map((lineups ?? []).map((l) => [String(l.game_id), l]))
  const lfaIds = (details ?? []).map((d) => String(d.lfa_match_id)).filter(Boolean)
  const { data: previews } = lfaIds.length
    ? await db.from("match_preview_cache").select("lfa_match_id").in("lfa_match_id", lfaIds)
    : { data: [] }
  const pSet = new Set((previews ?? []).map((p) => String(p.lfa_match_id)))

  const mark = (ok: boolean) => (ok ? "✅" : "❌")
  let nDet = 0, nLine = 0, nPrev = 0, nStat = 0
  for (const g of list) {
    const id = String(g.id)
    const d = dMap.get(id)
    const p = (d?.payload ?? {}) as Record<string, unknown>
    const stats = p.stats
    const hasStats = Array.isArray(stats) ? stats.length > 0 : !!stats && Object.keys(stats as object).length > 0
    const scored = p.homeScore != null && p.awayScore != null
    const age = d ? Math.round((Date.now() - new Date(String(d.updated_at)).getTime()) / 60000) : null
    const prev = d?.lfa_match_id ? pSet.has(String(d.lfa_match_id)) : false
    if (d) nDet++
    if (lMap.has(id)) nLine++
    if (prev) nPrev++
    if (hasStats) nStat++
    console.log(
      `   ${kst(String(g.match_time))} ${String(g.league_code).padEnd(5)} ` +
        `${String(g.home_team_name).slice(0, 9).padEnd(10)}vs ${String(g.away_team_name).slice(0, 9).padEnd(10)} ` +
        `상세${mark(!!d)} 라인업${mark(lMap.has(id))} 프리뷰${mark(prev)} ` +
        `점수${mark(scored)} 스탯${mark(hasStats)}` +
        (age != null ? `  (${age}분 전)` : "")
    )
  }
  const n = list.length
  console.log(
    `\n── 요약 ──\n   상세 ${nDet}/${n} · 라인업 ${nLine}/${n} · 프리뷰 ${nPrev}/${n} · 스탯 ${nStat}/${n}`
  )
}
main()

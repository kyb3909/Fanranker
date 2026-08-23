/**
 * team_dictionary 백필 — LFA 경기 목록에서 팀 영문명·팀 id 를 회수한다 (2026-08-24).
 *
 * ## 왜 필요한가
 * `lib/lfa/match.ts` 의 팀 대조는 betman 한글명을 `team_dictionary` 로 영문화한 뒤
 * LFA 축약명과 겹치는지 본다. 사전에 없으면 **한글이 그대로** 대조에 들어가는데,
 * 토큰화가 `[^a-z0-9\s]` 를 지우므로 빈 배열이 되어 **무조건 실패**한다 — 그 경기의
 * 라인업·스탯·타임라인이 통째로 사라지고, 라인업이 조건인 불판도 생성되지 않는다.
 * (2026-08-23 실사고: 브라이턴·본머스 미등재 → 두 EPL 경기 라인업 0, 불판 0)
 *
 * ## 안전 규칙
 * - **킥오프 시각이 그 리그에서 유일한 경기만** 채택한다. 동시 킥오프가 여럿이면
 *   어느 팀이 어느 팀인지 확정할 수 없으므로 건너뛴다 (남의 팀 이름 등재가 최악).
 * - 이미 `name_en` 이 있는 팀은 건드리지 않는다. 비어 있는 칸만 채운다.
 * - 기본은 미리보기 — `--post` 를 붙여야 실제 등재.
 *
 * 사용법: pnpm exec tsx scripts/backfill-team-dictionary-from-lfa.ts [--days=10] [--post]
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

/** betman league_code → LFA league id (lib/lfa/leagues.ts 와 동일 — 스크립트는 server-only 를 못 쓴다) */
const LEAGUE_IDS: Record<string, string> = {
  EPL: "2kwbbcootiqqgmrzs6o5inle5",
  라리가: "34pl8szyvrbwcmfkuocjm3r6t",
  세리에A: "1r097lpxe0xn03ihb7wi98kao",
  분데스리: "6by3h89i2eykc341oz7lv1ddd",
  프리그1: "dm5ka0os1e3dxcp3vh05kmp33",
  UCL: "4oogyu6o156iphvdvphwpck10",
  UEL: "4c1nfi2j1m731hcay25fcgndq",
  UECL: "c7b8o53flg36wbuevfzy3lb10",
}

interface LfaMatch {
  id: string
  league?: { id?: string }
  kickoff?: string
  home?: { id?: string; name?: string }
  away?: { id?: string; name?: string }
}

/** lib/lfa/match.ts teamMatches 와 같은 규칙 — 축약 방식이 달라 접두 겹침으로 본다 */
function looseMatch(lfaName: string, ourEn: string): boolean {
  const tok = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
  const a = tok(lfaName)
  const b = tok(ourEn)
  if (a.length === 0 || b.length === 0) return false
  return a.some((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)))
}

async function lfaDay(dateUtc: string, key: string): Promise<LfaMatch[]> {
  const qs = new URLSearchParams({ api_key: key, date: dateUtc, lang: "en" })
  const res = await fetch(`https://live-football-api.com/api/v1/matches?${qs}`)
  if (!res.ok) throw new Error(`LFA ${res.status}`)
  const json = (await res.json()) as { data?: { matches?: LfaMatch[] } }
  return json.data?.matches ?? []
}

async function main() {
  const args = process.argv.slice(2)
  const doPost = args.includes("--post")
  const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 10)
  const key = process.env.LIVE_FOOTBALL_API_KEY
  if (!key) throw new Error("LIVE_FOOTBALL_API_KEY 없음")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1) 사전에 영문명이 없는 팀 목록 (대상 리그, 최근 N일 경기)
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString()
  const { data: games } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, league_code, match_time")
    .eq("sport", "축구")
    .in("league_code", Object.keys(LEAGUE_IDS))
    .gte("match_time", since)
  if (!games?.length) return console.log("대상 경기 없음")

  const [{ data: dict }, { data: lfaDict }] = await Promise.all([
    supabase.from("team_dictionary").select("name_kr, name_en"),
    supabase.from("lfa_team_names").select("name_kr, name_en"),
  ])
  const dictAll = [...(dict ?? []), ...(lfaDict ?? [])]
  const known = new Set(dictAll.filter((d) => d.name_en).map((d) => String(d.name_kr)))
  const enOf = new Map(
    dictAll.filter((d) => d.name_en).map((d) => [String(d.name_kr), String(d.name_en)])
  )
  const missing = new Set<string>()
  for (const g of games) {
    for (const kr of [g.home_team_name, g.away_team_name]) {
      if (kr && kr !== "미정" && !known.has(String(kr))) missing.add(String(kr))
    }
  }
  console.log(`사전에 영문명이 없는 팀: ${missing.size}개`)
  if (missing.size === 0) return

  // 2) 날짜별 LFA 경기 — 리그+킥오프가 유일한 경기만 신뢰
  const dates = [...new Set(games.map((g) => String(g.match_time).slice(0, 10)))].sort()
  const found = new Map<string, { en: string; lfaId: string | null }>()

  for (const d of dates) {
    let matches: LfaMatch[]
    try {
      matches = await lfaDay(d, key)
    } catch (e) {
      console.log(`  ${d}: LFA 실패 (${e instanceof Error ? e.message : e}) — 건너뜀`)
      continue
    }
    // (리그, 킥오프) → 경기들
    const byKey = new Map<string, LfaMatch[]>()
    for (const m of matches) {
      const k = `${m.league?.id ?? ""}|${m.kickoff ?? ""}`
      byKey.set(k, [...(byKey.get(k) ?? []), m])
    }
    for (const g of games) {
      if (String(g.match_time).slice(0, 10) !== d) continue
      const lid = LEAGUE_IDS[String(g.league_code)]
      if (!lid) continue
      const hhmm = new Date(String(g.match_time)).toISOString().slice(11, 16)
      let bucket = byKey.get(`${lid}|${hhmm}`) ?? []
      if (bucket.length === 0) continue
      if (bucket.length > 1) {
        // 동시 킥오프 — **이미 아는 팀**(사전에 영문명이 있는 쪽)으로 좁힌다.
        // 라운드가 통째로 같은 시각에 열리는 리그에서 이 단계 없이는 아무것도 못 건진다.
        const knownEn = [g.home_team_name, g.away_team_name]
          .map((kr) => enOf.get(String(kr)))
          .filter((v): v is string => !!v)
        if (knownEn.length === 0) continue
        const narrowed = bucket.filter((m) =>
          knownEn.every(
            (en) => looseMatch(m.home?.name ?? "", en) || looseMatch(m.away?.name ?? "", en)
          )
        )
        if (narrowed.length !== 1) continue // 여전히 애매하면 포기 (오등재가 최악)
        bucket = narrowed
      }
      const m = bucket[0]
      const pairs: [string | null, { id?: string; name?: string } | undefined][] = [
        [g.home_team_name as string | null, m.home],
        [g.away_team_name as string | null, m.away],
      ]
      for (const [kr, side] of pairs) {
        if (!kr || !side?.name || !missing.has(kr) || found.has(kr)) continue
        found.set(kr, { en: side.name, lfaId: side.id ?? null })
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  console.log(`\n회수 ${found.size}/${missing.size}건${doPost ? " — 등재합니다" : " (미리보기)"}\n`)
  for (const [kr, v] of found) console.log(`  ${kr}  →  ${v.en}${v.lfaId ? `  (${v.lfaId})` : ""}`)
  const still = [...missing].filter((k) => !found.has(k))
  if (still.length) console.log(`\n회수 실패(동시 킥오프 등): ${still.join(", ")}`)

  if (!doPost) return console.log("\n--post 를 붙이면 실제 등재합니다.")

  let ok = 0
  for (const [kr, v] of found) {
    // team_dictionary 가 아니라 lfa_team_names 에 넣는다 — 그쪽 PK 는 soccerway_team_id 라
    // soccerway 에 없는 팀은 행을 만들 수 없다 (마이그 20260824_lfa_team_names)
    const { error } = await supabase.from("lfa_team_names").upsert(
      {
        name_kr: kr,
        name_en: v.en,
        lfa_team_id: v.lfaId,
        source: "lfa-backfill",
        note: "LFA 경기 목록에서 회수 (리그+킥오프 유일 대조, 동시 킥오프는 기지의 팀으로 좁힘)",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name_kr" }
    )
    if (error) {
      console.error(`  실패 ${kr}: ${error.message}`)
      continue
    }
    ok++
  }
  console.log(`\n등재 완료: ${ok}/${found.size}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

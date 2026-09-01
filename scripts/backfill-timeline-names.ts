/**
 * 저장된 타임라인의 영문 선수명 일괄 한글화 CLI (2026-09-01 일회성 복구).
 *
 * ## 무엇을 고치나
 * `Ø`·`Ł`·`Đ` 같은 **NFD 로 분해되지 않는 글자**가 정규화에서 통째로 지워져
 * ("Ødegaard" → "degaard") 이름 대조가 실패했다. 그래서 타임라인 이름이 영문으로 남거나,
 * 더 나쁘게는 지워진 자리 때문에 **실재하지 않는 이름**이 리포트로 나갔다.
 * 코드는 `lib/text/fold-latin.ts` 로 고쳤지만 **저장분은 스스로 낫지 않는다** —
 * `match_details_cache` 는 끝난 경기 수명이 Infinity 라 LFA 를 다시 안 부른다.
 * (라인업 저장분은 읽을 때 비한글 라벨을 재한글화하므로 저절로 낫는다. 두 저장소의
 *  치유 성질이 다르다는 것이 이 스크립트가 필요한 이유다.)
 *
 * ## 규율
 * - **외부 호출 0.** LFA 크레딧을 쓰지 않는다 — 재료는 이미 DB 에 있다
 *   (그 경기 저장 라인업 + 팀 스쿼드 사전). 판정은 런타임과 **같은 순수 모듈**을 쓴다.
 * - 한글이 된 이름만 바꾼다. 못 고친 이름은 **그대로 둔다** (fail-closed).
 * - `--post` 없이는 아무것도 쓰지 않는다 (기본이 미리보기).
 *
 *   pnpm exec tsx scripts/backfill-timeline-names.ts --days=30          # 미리보기
 *   pnpm exec tsx scripts/backfill-timeline-names.ts --days=30 --post   # 실제 적재
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import {
  hasHangul,
  localizeTimelineName,
  type RosterEntry,
  type SquadEntry,
} from "@/lib/lfa/scorer-name"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

interface TimelineEvent {
  minute?: string
  side?: "home" | "away"
  kind?: string
  player?: string
  inPlayer?: string
  assist?: string
  score?: string
}

/** 팀 한글명 → 스쿼드 (backfill-lineup-bench.ts 와 같은 해석 규칙) */
function makeSquadLookup(sb: SupabaseClient) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s&·．.\-_'"()]/g, "")
  const cache = new Map<string, SquadEntry[]>()
  let dict: { id: string; nameKr: string; aliases: string[] }[] | null = null

  return async (teamKr: string): Promise<SquadEntry[]> => {
    const hit = cache.get(teamKr)
    if (hit) return hit
    if (!dict) {
      const { data } = await sb
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .neq("status", "rejected")
        .not("name_kr", "is", null)
      dict = (data ?? []).map((r) => ({
        id: String(r.soccerway_team_id),
        nameKr: String(r.name_kr),
        aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
      }))
    }
    const a = norm(teamKr)
    const exact = dict.find((d) => d.nameKr === teamKr)
    const byAlias = dict.filter((d) => d.aliases.includes(teamKr))
    const contains =
      a.length >= 3
        ? dict.filter((d) => {
            const b = norm(d.nameKr)
            return b.length >= 3 && (a.includes(b) || b.includes(a))
          })
        : []
    const team =
      exact ?? (byAlias.length === 1 ? byAlias[0] : contains.length === 1 ? contains[0] : null)
    if (!team) {
      cache.set(teamKr, [])
      return []
    }
    const { data } = await sb
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", team.id)
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    const squad = (data ?? []).map((r) => ({
      nameEn: String(r.name_en ?? ""),
      nameKr: String(r.name_kr),
    }))
    cache.set(teamKr, squad)
    return squad
  }
}

/** 이 경기 라인업 → 대조 로스터. 형제 행까지 훑어 **가장 두꺼운** 것을 쓴다 */
async function rosterFor(sb: SupabaseClient, gameIds: string[]): Promise<RosterEntry[]> {
  const { data } = await sb.from("match_lineups").select("payload").in("game_id", gameIds)
  let best: RosterEntry[] = []
  for (const row of data ?? []) {
    const p = row.payload as {
      status?: string
      home?: { starters?: RosterEntry[]; bench?: RosterEntry[] }
      away?: { starters?: RosterEntry[]; bench?: RosterEntry[] }
    } | null
    if (p?.status !== "ready") continue
    const all = [
      ...(p.home?.starters ?? []),
      ...(p.home?.bench ?? []),
      ...(p.away?.starters ?? []),
      ...(p.away?.bench ?? []),
    ]
    if (all.length > best.length) best = all
  }
  return best
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--post")
  const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 30)
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 200)

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const squadFor = makeSquadLookup(sb)

  const since = new Date(Date.now() - days * 86400_000).toISOString()
  // ⚠️ PostgREST 는 요청당 **1000행**에서 조용히 자른다. 30일치 축구 경기는 그보다 훨씬
  //    많아서, 페이지를 안 넘기면 대상 경기가 목록에서 통째로 빠진다 (실측: 아스널전이
  //    안 잡혔다). `.in()` 대량 배열 400 과 같은 계열의 함정이다.
  const PAGE = 1000
  const games: {
    id: string
    home_team_name: string
    away_team_name: string
    match_time: string
  }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error: gErr } = await sb
      .from("betman_games")
      .select("id, home_team_name, away_team_name, match_time")
      .eq("sport", "축구")
      .gte("match_time", since)
      .order("match_time", { ascending: true })
      .range(from, from + PAGE - 1)
    if (gErr) throw gErr
    games.push(
      ...((data ?? []) as {
        id: string
        home_team_name: string
        away_team_name: string
        match_time: string
      }[])
    )
    if ((data?.length ?? 0) < PAGE) break
  }

  // 같은 경기의 형제 행을 묶는다 (betman 은 마켓별로 행이 여러 개다)
  const byMatch = new Map<
    string,
    { ids: string[]; home: string; away: string; matchTime: string }
  >()
  for (const g of games) {
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
    const prev = byMatch.get(key)
    if (prev) prev.ids.push(String(g.id))
    else
      byMatch.set(key, {
        ids: [String(g.id)],
        home: String(g.home_team_name),
        away: String(g.away_team_name),
        matchTime: String(g.match_time),
      })
  }
  const matchOfGameId = new Map<string, ReturnType<typeof byMatch.get>>()
  for (const m of byMatch.values()) for (const id of m.ids) matchOfGameId.set(id, m)

  // ⚠️ `.in()` 에 큰 배열을 넣으면 400 이 돌아온다 (이 저장소의 재발 패턴) — 끊어서 부른다
  const IN_CHUNK = 100
  const allIds = [...matchOfGameId.keys()]
  const rows: { game_id: string; payload: unknown }[] = []
  for (let i = 0; i < allIds.length; i += IN_CHUNK) {
    const { data, error } = await sb
      .from("match_details_cache")
      .select("game_id, payload")
      .in("game_id", allIds.slice(i, i + IN_CHUNK))
    if (error) throw error
    rows.push(...((data ?? []) as { game_id: string; payload: unknown }[]))
  }

  let scanned = 0
  let touched = 0
  let renamed = 0
  let stillEnglish = 0

  for (const row of rows) {
    if (touched >= limit) break
    const gameId = String(row.game_id)
    const payload = row.payload as { timeline?: TimelineEvent[] } | null
    const timeline = payload?.timeline
    if (!Array.isArray(timeline) || timeline.length === 0) continue

    const names = timeline.flatMap((e) =>
      [e.player, e.inPlayer, e.assist].filter((n): n is string => !!n)
    )
    if (names.length === 0 || names.every((n) => hasHangul(n))) continue
    scanned++

    const m = matchOfGameId.get(gameId)
    if (!m) continue
    const roster = await rosterFor(sb, m.ids)
    const [homeSquad, awaySquad] = await Promise.all([squadFor(m.home), squadFor(m.away)])

    let changed = 0
    const next = timeline.map((e) => {
      const squad = e.side === "away" ? awaySquad : homeSquad
      const fix = (v: string | undefined): string | undefined => {
        if (!v || hasHangul(v)) return v
        const ko = localizeTimelineName(v, roster, squad)
        if (ko && hasHangul(ko) && ko !== v) {
          changed++
          console.log(`   ${m.home} vs ${m.away} ${e.minute}' : ${v} → ${ko}`)
          return ko
        }
        return v
      }
      return { ...e, player: fix(e.player), inPlayer: fix(e.inPlayer), assist: fix(e.assist) }
    })

    if (changed === 0) {
      stillEnglish++
      continue
    }
    renamed += changed
    touched++
    if (apply) {
      const { error: upErr } = await sb
        .from("match_details_cache")
        .update({ payload: { ...payload, timeline: next } })
        .eq("game_id", gameId)
      if (upErr) console.warn(`   ⚠️ 쓰기 실패 ${gameId}: ${upErr.message}`)
    }
  }

  console.log(
    `\n${apply ? "적재" : "미리보기"} — 영문 남은 경기 ${scanned}건 중 ${touched}건 수정 (이름 ${renamed}개), 못 고친 경기 ${stillEnglish}건`
  )
  if (!apply && touched > 0) console.log("실제 적용하려면 --post 를 붙일 것")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

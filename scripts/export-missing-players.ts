/**
 * 선수 한글명 없는 목록 → CSV (2026-08-17 운영자: 라인업·결장자 이름 한글화).
 *
 * `team_squads` 에 이미 있는 행 중 `name_kr` 이 빈 것을 뽑는다 — API 비용 0.
 * 이 표가 채워지면 라인업·득점자·결장자가 한꺼번에 한글이 된다 (셋 다 같은 사전을 본다).
 *
 * 우선순위: 최근 ±30일 대상 리그 경기에 실제로 나온 팀을 "우선"으로 올린다 —
 * 사전이 1,500행이라 전부 채우는 건 비현실적이고, 화면에 보이는 팀부터가 맞다.
 *
 * ⚠️ 번역하지 않는다. `한글명` 열은 공란으로 두고 운영자 확정 표기를 받는다.
 *
 * 실행: pnpm exec tsx scripts/export-missing-players.ts [--out=missing-players.csv]
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "../lib/match/leagues"

const outArg = process.argv.find((a) => a.startsWith("--out="))
const OUT = outArg ? outArg.slice(6) : "missing-players.csv"

const POSITION_LABEL: Record<string, string> = {
  GK: "골키퍼",
  DF: "수비수",
  MF: "미드필더",
  FW: "공격수",
  COACH: "감독",
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // ① 팀이 어느 리그에서 관측됐는가 → 우선순위 (2026-08-18 개정)
  //
  //    종전 기준("최근 30일 경기에 등장")은 유럽 대항전 **예선** 팀을 1순위로 끌어올렸다
  //    (비킹FK·레프스키 소피아 등). 예선 탈락하면 다시 안 나오는 팀이라 사전을 채워도
  //    회수가 없다. 5대 리그 소속은 시즌 내내 반복 등장하므로 그쪽이 먼저다.
  const BIG5 = new Set(["EPL", "라리가", "세리에A", "분데스리", "프리그1"])
  // ⚠️ Supabase 는 한 번에 1000행이 상한 — 안 끊으면 목록이 조용히 잘려 전원 3순위가 된다
  const leagueByGame = new Map<string, string>()
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("betman_games")
      .select("id, league_code")
      .eq("sport", "축구")
      .in("league_code", [...MATCH_PAGE_LEAGUES])
      .order("id", { ascending: true })
      .range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    for (const g of data) leagueByGame.set(String(g.id), String(g.league_code))
    if (data.length < 1000) break
  }
  const gameIds = [...leagueByGame.keys()]

  // soccerway 팀 → 그 팀이 뛴 리그들 (전 기간 — 소속 판정이라 최근일 필요가 없다)
  const leaguesByTeam = new Map<string, Set<string>>()
  for (let i = 0; i < gameIds.length; i += 200) {
    const { data } = await supabase
      .from("match_mapping_attempts")
      .select("game_id, home_team_id, away_team_id")
      .in("game_id", gameIds.slice(i, i + 200))
      .eq("outcome", "proposed")
    for (const a of data ?? []) {
      const lg = leagueByGame.get(String(a.game_id))
      if (!lg) continue
      for (const tid of [a.home_team_id, a.away_team_id]) {
        if (!tid) continue
        const key = String(tid)
        if (!leaguesByTeam.has(key)) leaguesByTeam.set(key, new Set())
        leaguesByTeam.get(key)!.add(lg)
      }
    }
  }
  /** 1순위 = 5대 리그 소속 · 2순위 = 대항전·컵에서만 관측 · 3순위 = 미관측 */
  const priorityOf = (teamId: string): string => {
    const lgs = leaguesByTeam.get(teamId)
    if (!lgs) return "3순위"
    return [...lgs].some((l) => BIG5.has(l)) ? "1순위 5대리그" : "2순위 대항전·컵"
  }

  // ② 팀 한글명 (사람이 읽을 수 있게)
  const { data: dict } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, name_en")
  const teamName = new Map(
    (dict ?? []).map((r) => [
      String(r.soccerway_team_id),
      String(r.name_kr ?? r.name_en ?? r.soccerway_team_id),
    ])
  )

  // ③ 한글명 없는 선수 — Supabase 는 한 번에 1000행이 상한이라 페이지로 끊어 받는다
  //    (limit/range 로도 못 넘긴다. 안 끊으면 목록이 조용히 잘려 사전이 반쪽이 된다)
  const players: Record<string, unknown>[] = []
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("team_squads")
      .select("soccerway_team_id, player_id, player_slug, name_en, jersey_number, position")
      .is("name_kr", null)
      .neq("status", "rejected")
      .order("soccerway_team_id", { ascending: true })
      .order("player_id", { ascending: true })
      .range(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    players.push(...data)
    if (data.length < 1000) break
  }

  const rows = players
    .map((p) => {
      const team = String(p.soccerway_team_id)
      return {
        priority: priorityOf(team),
        teamKr: teamName.get(team) ?? team,
        teamId: team,
        playerId: String(p.player_id),
        slug: String(p.player_slug ?? ""),
        nameEn: String(p.name_en ?? ""),
        number: p.jersey_number != null ? String(p.jersey_number) : "",
        position: POSITION_LABEL[String(p.position)] ?? String(p.position ?? ""),
      }
    })
    .sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        a.teamKr.localeCompare(b.teamKr) ||
        (Number(a.number) || 999) - (Number(b.number) || 999)
    )

  const header = [
    "우선순위",
    "팀",
    "soccerway_팀ID",
    "선수ID",
    "선수슬러그",
    "영문명",
    "등번호",
    "포지션",
    "한글명(채워주세요)",
  ]
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv =
    "﻿" +
    [
      header,
      ...rows.map((r) => [
        r.priority,
        r.teamKr,
        r.teamId,
        r.playerId,
        r.slug,
        r.nameEn,
        r.number,
        r.position,
        "",
      ]),
    ]
      .map((r) => r.map((c) => esc(String(c))).join(","))
      .join("\r\n") +
    "\r\n"
  writeFileSync(OUT, csv, "utf-8")

  const byPri = new Map<string, number>()
  for (const r of rows) byPri.set(r.priority, (byPri.get(r.priority) ?? 0) + 1)
  console.log(`[done] ${OUT} — ${rows.length}행`)
  for (const [k, v] of [...byPri.entries()].sort()) console.log(`   ${k}: ${v}행`)
  const teams = new Map<string, number>()
  for (const r of rows.filter((x) => x.priority.startsWith("1"))) {
    teams.set(r.teamKr, (teams.get(r.teamKr) ?? 0) + 1)
  }
  console.log("  1순위 팀별:", [...teams.entries()].map(([t, n]) => `${t} ${n}`).join(" / "))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

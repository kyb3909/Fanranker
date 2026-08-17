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

  // ① 최근 대상 리그 경기에 등장한 팀 (우선순위 신호)
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const until = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()
  const { data: games } = await supabase
    .from("betman_games")
    .select("id")
    .eq("sport", "축구")
    .in("league_code", [...MATCH_PAGE_LEAGUES])
    .gte("match_time", since)
    .lte("match_time", until)
  const gameIds = (games ?? []).map((g) => g.id as string)

  const activeTeams = new Set<string>()
  for (let i = 0; i < gameIds.length; i += 200) {
    const { data } = await supabase
      .from("match_mapping_attempts")
      .select("home_team_id, away_team_id")
      .in("game_id", gameIds.slice(i, i + 200))
      .eq("outcome", "proposed")
    for (const a of data ?? []) {
      if (a.home_team_id) activeTeams.add(String(a.home_team_id))
      if (a.away_team_id) activeTeams.add(String(a.away_team_id))
    }
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
        priority: activeTeams.has(team) ? "우선" : "후순위",
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
        (a.priority === "우선" ? 0 : 1) - (b.priority === "우선" ? 0 : 1) ||
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

  const core = rows.filter((r) => r.priority === "우선").length
  console.log(`[done] ${OUT} — ${rows.length}행 (우선 ${core} / 후순위 ${rows.length - core})`)
  const teams = new Map<string, number>()
  for (const r of rows.filter((x) => x.priority === "우선")) {
    teams.set(r.teamKr, (teams.get(r.teamKr) ?? 0) + 1)
  }
  console.log("  우선 팀별:", [...teams.entries()].map(([t, n]) => `${t} ${n}`).join(" / "))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

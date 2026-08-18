/**
 * 스쿼드 한글명 검수 CSV (2026-08-18 운영자: "csv만 일단 채워줘봐 내가 체크를 해야하니까").
 *
 * 두 부류를 한 표에 담는다:
 *   - `수확`  : 나무위키 리그 수확기가 채운 행 (`source=namu_league`). **검수 대상**.
 *   - `미채움`: 아직 빈 행. 운영자가 직접 채울 자리.
 *
 * ⚠️ 번역하지 않는다. 미채움 행의 `한글명` 은 공란으로 둔다 (표기 정본 = 운영자 확정).
 * 되돌리려면 `source='namu_league'` 로 태깅돼 있어 한 번에 지울 수 있다.
 *
 * 실행: pnpm exec tsx scripts/export-squad-review.ts [--out=workspace/squad-review.csv]
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "../lib/match/leagues"

/**
 * 대상 밖 팀도 볼지 (2026-08-19 운영자: "K리그·J리그는 승부예측 메뉴에만 두고 가려줘").
 * 기본은 매치 페이지 화이트리스트(5대 리그·유럽 대항전·주요 컵)에 나온 팀만 — 안 그러면
 * 손댈 일 없는 남미·북유럽·K/J리그 1,800여 행이 목록을 덮어 실제 할 일이 안 보인다.
 */
const ALL_TEAMS = process.argv.includes("--all-teams")

const outArg = process.argv.find((a) => a.startsWith("--out="))
const OUT = outArg ? outArg.slice(6) : "workspace/squad-review-20260818.csv"

/** Supabase 는 한 번에 1,000행만 준다 — 페이지네이션 없이 읽으면 표가 조용히 잘린다 */
async function fetchAll<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = []
  for (let page = 0; ; page++) {
    const { data } = await run(page * 1000, page * 1000 + 999)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "")
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const teams = await fetchAll<{ soccerway_team_id: string; name_kr: string | null }>((f, t) =>
    supabase.from("team_dictionary").select("soccerway_team_id, name_kr").range(f, t)
  )
  const teamName = new Map(teams.map((t) => [t.soccerway_team_id, t.name_kr ?? ""]))

  // 대상 리그에 실제로 나온 팀만 추린다. 팀에는 리그 표시가 없으므로 betman 경기에서
  // 역으로 찾는다 — 화이트리스트(MATCH_PAGE_LEAGUES)는 매치 페이지와 같은 정본이다.
  const inScope = new Set<string>()
  if (!ALL_TEAMS) {
    const games = await fetchAll<{ home_team_name: string; away_team_name: string }>((f, t) =>
      supabase
        .from("betman_games")
        .select("home_team_name, away_team_name")
        .in("league_code", [...MATCH_PAGE_LEAGUES])
        .range(f, t)
    )
    const names = new Set<string>()
    for (const g of games) {
      names.add(String(g.home_team_name))
      names.add(String(g.away_team_name))
    }
    for (const t of teams) if (t.name_kr && names.has(t.name_kr)) inScope.add(t.soccerway_team_id)
    console.log(`대상 리그 팀 ${inScope.size}개 (--all-teams 로 전체 보기)`)
  }

  const rows = await fetchAll<{
    soccerway_team_id: string
    player_id: string
    name_en: string | null
    name_kr: string | null
    jersey_number: number | null
    position: string | null
    source: string | null
    status: string | null
  }>((f, t) =>
    supabase
      .from("team_squads")
      .select(
        "soccerway_team_id, player_id, name_en, name_kr, jersey_number, position, source, status"
      )
      .or("source.eq.namu_league,name_kr.is.null")
      .neq("status", "rejected")
      .range(f, t)
  )

  const out = rows
    .filter((r) => ALL_TEAMS || inScope.has(r.soccerway_team_id))
    .map((r) => ({
      구분: r.source === "namu_league" && r.name_kr ? "수확" : "미채움",
      팀: teamName.get(r.soccerway_team_id) || r.soccerway_team_id,
      등번호: r.jersey_number ?? "",
      포지션: r.position ?? "",
      영문명: r.name_en ?? "",
      한글명: r.name_kr ?? "",
      상태: r.status ?? "",
      soccerway_team_id: r.soccerway_team_id,
      player_id: r.player_id,
    }))
    .sort(
      (a, b) =>
        a.구분.localeCompare(b.구분) ||
        a.팀.localeCompare(b.팀, "ko") ||
        String(a.등번호).padStart(3, "0").localeCompare(String(b.등번호).padStart(3, "0"))
    )

  const head = Object.keys(out[0] ?? {})
  const csv = [
    head.join(","),
    ...out.map((r) => head.map((h) => csvCell(r[h as keyof typeof r])).join(",")),
  ].join("\r\n")
  writeFileSync(OUT, "﻿" + csv, "utf8")

  const harvested = out.filter((r) => r.구분 === "수확").length
  console.log(
    `${OUT} — 총 ${out.length}행 (검수 대상 ${harvested} / 미채움 ${out.length - harvested})`
  )
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})

/**
 * 한글명 없는 팀 → CSV 내보내기 (2026-08-17 운영자: "csv파일로 내보내줘 팀 아이디와 함께").
 *
 * 대상 리그 경기에 등장하는데 `team_dictionary` 로 한글화되지 않는 팀을 모아,
 * **soccerway 팀 해시까지 붙여** CSV 로 뽑는다. 운영자가 `name_kr` 열만 채워 돌려주면
 * `scripts/import-team-names.ts` 가 사전에 반영한다.
 *
 * soccerway 해시가 필요한 이유: 라인업·매핑이 전부 그 해시로 걸린다 (team_dictionary PK).
 * LFA 해시는 스코어·스탯 쪽 키라 둘 다 싣는다.
 *
 * ⚠️ 표기는 운영자 확정이 정본이다 (사전 오염 사고 이후 규칙) — 이 스크립트는 **번역하지
 *    않는다.** name_kr 열은 비워 둔다.
 *
 * 실행: pnpm exec tsx scripts/export-missing-teams.ts [--days=14] [--out=missing-teams.csv]
 */
import "dotenv/config"
import { writeFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"
import { MATCH_PAGE_LEAGUES } from "../lib/match/leagues"
import { BETMAN_CODE_BY_LFA_ID } from "../lib/lfa/leagues"
import { searchSoccerwayTeams, leagueCountryHint } from "../lib/soccerway/team-search"

const daysArg = process.argv.find((a) => a.startsWith("--days="))
const DAYS = daysArg ? Number(daysArg.slice(7)) || 14 : 14
const outArg = process.argv.find((a) => a.startsWith("--out="))
const OUT = outArg ? outArg.slice(6) : "missing-teams.csv"
const KEY = process.env.LIVE_FOOTBALL_API_KEY!

/** 5대 리그 + 유럽 대항전 — 컵대회 하부리그보다 우선순위가 높다 */
const CORE = new Set(["EPL", "라리가", "세리에A", "분데스리", "프리그1", "UCL", "UEL", "UECL"])

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

interface MissingTeam {
  leagueCode: string
  lfaTeamId: string
  lfaName: string
  fixture: string
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: dictAll } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_en, name_kr, lfa_team_id")
    .neq("status", "rejected")
  // soccerway 해시 → 이미 확정된 한글명 (축약형 중복 판별용)
  const krBySw = new Map(
    (dictAll ?? [])
      .filter((r) => r.name_kr)
      .map((r) => [String(r.soccerway_team_id), String(r.name_kr)])
  )
  const dict = (dictAll ?? []).filter((r) => r.name_kr)
  const index = (dict ?? []).map((r) => norm(String(r.name_en)))
  const byLfaId = new Set(
    (dict ?? []).map((r) => String(r.lfa_team_id ?? "")).filter((v) => v.length > 0)
  )
  // 프로덕션과 같은 판정: LFA 팀 해시가 붙어 있으면 표기와 무관하게 한글화된다.
  // 해시가 없을 때만 이름 대조로 내려간다 (정확일치 1건 또는 접두 포함 1건).
  const resolvable = (en: string, lfaTeamId: string) => {
    if (lfaTeamId && byLfaId.has(lfaTeamId)) return true
    const n = norm(en)
    if (!n) return false
    if (index.filter((e) => e === n).length === 1) return true
    return index.filter((e) => e.startsWith(n) || n.startsWith(e)).length === 1
  }

  const missing = new Map<string, MissingTeam>()
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(Date.now() + i * 24 * 3600_000).toISOString().slice(0, 10)
    const qs = new URLSearchParams({ api_key: KEY, date: d, lang: "en" })
    const res = await fetch(`https://live-football-api.com/api/v1/matches?${qs}`)
    if (!res.ok) continue
    const json = (await res.json()) as {
      credits_remaining?: number
      data?: { matches?: Record<string, any>[] }
    }
    process.stdout.write(`\r  ${d} 스캔 (잔여 크레딧 ${json.credits_remaining})   `)
    for (const m of json.data?.matches ?? []) {
      const code = BETMAN_CODE_BY_LFA_ID.get(m.league?.id ?? "")
      if (!code || !MATCH_PAGE_LEAGUES.has(code)) continue
      for (const side of ["home", "away"] as const) {
        const en = String(m[side]?.name ?? "").trim()
        const id = String(m[side]?.id ?? "")
        if (!en || !id || resolvable(en, id)) continue
        if (!missing.has(id)) {
          missing.set(id, {
            leagueCode: code,
            lfaTeamId: id,
            lfaName: en,
            fixture: `${d} ${m.home?.name} vs ${m.away?.name}`,
          })
        }
      }
    }
  }
  console.log(`\n미등재 팀 ${missing.size}개 — soccerway 해시 조회 중…`)

  const rows: string[][] = []
  let done = 0
  for (const t of [...missing.values()].sort((a, b) => {
    const ca = CORE.has(a.leagueCode) ? 0 : 1
    const cb = CORE.has(b.leagueCode) ? 0 : 1
    return ca - cb || a.leagueCode.localeCompare(b.leagueCode) || a.lfaName.localeCompare(b.lfaName)
  })) {
    const country = leagueCountryHint(t.leagueCode)
    let sw = { id: "", slug: "", nameEn: "", confidence: "없음" }
    try {
      const cands = (await searchSoccerwayTeams(t.lfaName)).filter(
        (c) => !country || !c.country || c.country === country
      )
      const target = norm(t.lfaName)
      const exact = cands.filter((c) => norm(c.nameEn) === target)
      const near = cands.filter(
        (c) => norm(c.nameEn).startsWith(target) || target.startsWith(norm(c.nameEn))
      )
      const pick = exact[0] ?? near[0] ?? cands[0]
      if (pick) {
        sw = {
          id: pick.soccerwayTeamId,
          slug: pick.slug,
          nameEn: pick.nameEn,
          confidence: exact.length === 1 ? "확실" : near.length >= 1 ? "유사" : "추정",
        }
      }
    } catch {
      /* 검색 실패는 빈 칸으로 — 운영자가 직접 채울 수 있다 */
    }
    rows.push([
      CORE.has(t.leagueCode) ? "우선" : "후순위",
      t.leagueCode,
      t.lfaName,
      t.lfaTeamId,
      sw.id,
      sw.slug,
      sw.nameEn,
      sw.confidence,
      // 이 soccerway 해시에 이미 확정 한글명이 있으면 = 축약형 때문에 못 찾은 것.
      // 새로 번역할 필요 없이 확인만 하면 된다 (2026-08-17 운영자 "축약형도 있지 않았어?")
      krBySw.get(sw.id) ?? "",
      "", // name_kr — 운영자가 채울 칸
      t.fixture,
    ])
    done++
    process.stdout.write(`\r  ${done}/${missing.size}   `)
    await new Promise((r) => setTimeout(r, 250)) // 검색 API 예우
  }

  const header = [
    "우선순위",
    "리그",
    "LFA_팀명",
    "LFA_팀ID",
    "soccerway_팀ID",
    "soccerway_슬러그",
    "soccerway_팀명",
    "매칭신뢰도",
    "기존한글명(있으면 이미 등록됨)",
    "한글명(채워주세요)",
    "예시경기",
  ]
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const csv =
    "﻿" + // Excel 한글 깨짐 방지 BOM
    [header, ...rows].map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n") +
    "\r\n"
  writeFileSync(OUT, csv, "utf-8")
  console.log(`\n[done] ${OUT} — ${rows.length}행`)
  const core = rows.filter((r) => r[0] === "우선").length
  console.log(`  우선(5대 리그·유럽 대항전) ${core}행 / 후순위 ${rows.length - core}행`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

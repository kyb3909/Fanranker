/**
 * 팀 한글명 CSV 임포트 — `export-missing-teams.ts` 의 짝 (2026-08-17).
 *
 * 운영자가 `한글명(채워주세요)` 열을 채워 돌려준 CSV 를 `team_dictionary` 에 반영한다.
 * 표기 정본은 운영자 확정이다 — 이 스크립트는 **번역하지 않고 받아 적기만** 한다.
 *
 * 규율:
 * - `한글명` 이 빈 행은 건너뛴다 (부분 제출 지원 — 나눠서 채워도 된다)
 * - `soccerway_팀ID` 가 비면 건너뛴다 (사전 PK 가 그 해시다)
 * - 이미 있는 해시면 name_kr 을 **덮어쓰지 않고** 비어 있을 때만 채운다.
 *   기존 표기가 다르면 별칭으로 흡수하고 경고한다 (사전 오염 방지 — 2026-08-11 사고)
 *
 * 실행: pnpm exec tsx scripts/import-team-names.ts [--file=missing-teams.csv] [--apply]
 * 기본은 드라이런.
 */
import "dotenv/config"
import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")
const fileArg = process.argv.find((a) => a.startsWith("--file="))
const FILE = fileArg ? fileArg.slice(7) : "missing-teams.csv"

/** 따옴표·쉼표 포함 셀을 처리하는 최소 CSV 파서 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const src = text.replace(/^﻿/, "") // Excel BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/, ""))
      rows.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""))
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const rows = parseCsv(readFileSync(FILE, "utf-8"))
  const header = rows[0].map((h) => h.trim())
  const col = (name: string) => header.findIndex((h) => h.startsWith(name))
  const iSw = col("soccerway_팀ID")
  const iSlug = col("soccerway_슬러그")
  const iEn = col("soccerway_팀명")
  const iKr = col("한글명")
  if (iSw < 0 || iKr < 0) throw new Error("헤더에 soccerway_팀ID / 한글명 열이 없습니다")

  const { data: existing } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, name_kr, aliases_kr")
  const byId = new Map((existing ?? []).map((r) => [String(r.soccerway_team_id), r]))

  let inserts = 0
  let fills = 0
  let aliases = 0
  let skipped = 0
  const warnings: string[] = []

  for (const r of rows.slice(1)) {
    const swId = (r[iSw] ?? "").trim()
    const kr = (r[iKr] ?? "").trim()
    if (!kr) {
      skipped++
      continue
    }
    if (!swId) {
      warnings.push(`${kr}: soccerway 팀ID 없음 — 건너뜀`)
      continue
    }
    const cur = byId.get(swId)

    if (!cur) {
      if (APPLY) {
        const { error } = await supabase.from("team_dictionary").insert({
          soccerway_team_id: swId,
          slug: (r[iSlug] ?? "").trim() || swId,
          name_en: (r[iEn] ?? "").trim() || kr,
          name_kr: kr,
          aliases_kr: [],
          status: "confirmed",
          source: "operator_csv",
          note: "운영자 CSV 확정 표기 (import-team-names)",
        })
        if (error) {
          warnings.push(`${kr} 등재 실패: ${error.message}`)
          continue
        }
      }
      inserts++
    } else if (!cur.name_kr) {
      if (APPLY) {
        const { error } = await supabase
          .from("team_dictionary")
          .update({ name_kr: kr, status: "confirmed", updated_at: new Date().toISOString() })
          .eq("soccerway_team_id", swId)
        if (error) {
          warnings.push(`${kr} 채우기 실패: ${error.message}`)
          continue
        }
      }
      fills++
    } else if (cur.name_kr !== kr) {
      // 기존 표기를 덮지 않는다 — 별칭으로만 흡수하고 사람이 보게 남긴다
      const merged = Array.from(new Set([...((cur.aliases_kr as string[]) ?? []), kr]))
      if (APPLY) {
        await supabase
          .from("team_dictionary")
          .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
          .eq("soccerway_team_id", swId)
      }
      aliases++
      warnings.push(`표기 충돌: 기존 "${cur.name_kr}" ≠ CSV "${kr}" → 별칭으로 추가 (${swId})`)
    } else {
      skipped++
    }
  }

  console.log(
    `신규 등재 ${inserts} / 빈칸 채움 ${fills} / 별칭 흡수 ${aliases} / 건너뜀 ${skipped}`
  )
  for (const w of warnings.slice(0, 30)) console.log(`  ⚠ ${w}`)
  if (!APPLY) console.log("\n(드라이런 — 반영하려면 --apply)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

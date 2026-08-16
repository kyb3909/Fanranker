import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { apiBadRequest, apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * 팀 스쿼드 사전 검수 (2026-08-16)
 *
 * scripts/harvest-squads.ts 가 soccerway×나무위키 대조로 채운 team_squads 를
 * 팀 사전과 같은 CSV 워크플로로 검수한다: 내려받아 name_kr 를 고치고 다시 올리면
 * 해당 행이 confirmed 로 확정된다. 확정 행은 재수확이 덮어쓰지 않는다.
 *
 * GET  ?format=csv [&team=<soccerway_team_id>] → CSV (엑셀용 BOM)
 * GET  [&team=..]                              → JSON 목록 + 미대조 카운트
 * POST { action: "csv_import", csv, dry_run? } → name_kr 채움/수정 + confirmed
 *      비고: CSV 의 name_kr 빈 칸은 건너뛴다 (지우기가 아니라 미검수 유지)
 */

/** CSV 한 칸 — 팀 사전 라우트와 동일 규칙 */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  const src = text.replace(/^﻿/, "")
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      if (row.some((x) => x.trim() !== "")) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== "")) rows.push(row)
  return rows
}

const HEADER = [
  "soccerway_team_id",
  "team_kr",
  "jersey",
  "position",
  "name_en",
  "player_slug",
  "name_kr",
  "status",
] as const

export async function GET(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const team = req.nextUrl.searchParams.get("team")
  const missingOnly = req.nextUrl.searchParams.get("missing") === "1"

  // PostgREST 1,000행 상한 — 스쿼드는 3천+ 행이라 페이지로 전량 수집
  const data: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from("team_squads")
      .select(
        "soccerway_team_id, player_id, player_slug, name_en, name_kr, jersey_number, position, status, team_dictionary(name_kr)"
      )
      .order("soccerway_team_id")
      .order("position")
      .range(from, from + 999)
    if (team) q = q.eq("soccerway_team_id", team)
    if (missingOnly) q = q.is("name_kr", null)
    const { data: page, error } = await q
    if (error) return apiError("스쿼드 조회 실패", 500, error)
    data.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }

  const rows = (data ?? []).map((r) => ({
    soccerway_team_id: String(r.soccerway_team_id),
    team_kr: String((r.team_dictionary as { name_kr?: string } | null)?.name_kr ?? ""),
    jersey: r.jersey_number,
    position: String(r.position ?? ""),
    name_en: String(r.name_en),
    player_slug: String(r.player_slug),
    name_kr: r.name_kr ? String(r.name_kr) : "",
    status: String(r.status),
  }))

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const lines = [
      HEADER.join(","),
      ...rows.map((r) =>
        [
          r.soccerway_team_id,
          r.team_kr,
          r.jersey ?? "",
          r.position,
          r.name_en,
          r.player_slug,
          r.name_kr,
          r.status,
        ]
          .map(csvCell)
          .join(",")
      ),
    ]
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="team-squads.csv"`,
      },
    })
  }

  return NextResponse.json({
    total: rows.length,
    unmatched: rows.filter((r) => !r.name_kr).length,
    rows,
  })
}

const csvImportSchema = z.object({
  action: z.literal("csv_import"),
  csv: z.string().min(1),
  dry_run: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await req.json().catch(() => null)
  const parsed = csvImportSchema.safeParse(body)
  if (!parsed.success) return apiBadRequest("csv_import 형식이 아닙니다")
  const { csv, dry_run } = parsed.data

  const rows = parseCsv(csv)
  if (rows.length < 2) return apiBadRequest("데이터 행이 없습니다")
  const header = rows[0].map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  for (const col of ["soccerway_team_id", "player_slug", "name_kr"]) {
    if (idx(col) === -1) return apiBadRequest(`필수 컬럼 누락: ${col}`)
  }

  const updates: { team: string; slug: string; nameKr: string }[] = []
  const skipped: string[] = []
  for (const r of rows.slice(1)) {
    const team = r[idx("soccerway_team_id")]?.trim()
    const slug = r[idx("player_slug")]?.trim()
    const nameKr = r[idx("name_kr")]?.trim()
    if (!team || !slug) continue
    if (!nameKr) {
      skipped.push(slug) // 빈 칸 = 미검수 유지 (지우기 아님)
      continue
    }
    if (!/^[가-힣·\s-]{2,20}$/.test(nameKr)) {
      skipped.push(`${slug} (한글명 형식 아님: ${nameKr})`)
      continue
    }
    updates.push({ team, slug, nameKr })
  }

  if (dry_run) {
    return NextResponse.json({ dry_run: true, would_update: updates.length, skipped })
  }

  let updated = 0
  const failed: string[] = []
  for (const u of updates) {
    const { error, count } = await supabase
      .from("team_squads")
      .update({ name_kr: u.nameKr, status: "confirmed", updated_at: new Date().toISOString() })
      .eq("soccerway_team_id", u.team)
      .eq("player_slug", u.slug)
    if (error) failed.push(`${u.slug}: ${error.message}`)
    else updated += count ?? 1
  }

  return NextResponse.json({ updated, failed, skipped })
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireStaffApi } from "@/lib/admin/roles"
import { apiBadRequest, apiError } from "@/lib/api-error"
import {
  syncSquadNamesToNews,
  resolveNotationConflict,
  recordNameCorrection,
} from "@/lib/dictionary/sync-news"

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
        "soccerway_team_id, player_id, player_slug, name_en, name_kr, name_kr_draft, jersey_number, position, status, team_dictionary(name_kr)"
      )
      .order("soccerway_team_id")
      .order("position")
      .range(from, from + 999)
    // ⚠️ 이적으로 떠난 선수는 검수 대상이 아니다 (2026-08-25). 행은 남겨 둔다 —
    //    과거 경기 리포트·라인업이 그 이름을 참조하므로 읽는 경로에서는 계속 살아 있다.
    //    여기서만 뺀다: 안 그러면 "검수 대기" 숫자가 영영 안 줄어든다.
    q = q.neq("status", "left")
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
    /** 기계 생성 후보 — 화면에는 안 나가고 이 검수 지면에서만 쓴다 */
    name_kr_draft: r.name_kr_draft ? String(r.name_kr_draft) : "",
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

  /**
   * 팀 → 리그 (2026-08-25 운영자 요청: "리그별로 넘어가면서").
   *
   * team_dictionary 에 리그 칼럼이 없어서 **최근 경기로 역산**한다. 이적시장·컵대회 때문에
   * 한 팀이 여러 리그에 나오므로 **가장 많이 나온 리그**를 대표로 삼는다.
   * ⚠️ 경기가 없는 팀은 리그를 모른다 — 화면에서 "기타" 로 묶는다.
   */
  const { data: games } = await supabase
    .from("betman_games")
    .select("home_team_name, away_team_name, league_code")
    .gte("match_time", new Date(Date.now() - 90 * 86400_000).toISOString())
  const leagueCount = new Map<string, Map<string, number>>()
  for (const g of games ?? []) {
    for (const n of [g.home_team_name, g.away_team_name]) {
      if (!n || !g.league_code) continue
      const m = leagueCount.get(String(n)) ?? new Map<string, number>()
      m.set(String(g.league_code), (m.get(String(g.league_code)) ?? 0) + 1)
      leagueCount.set(String(n), m)
    }
  }
  const leagueOf: Record<string, string> = {}
  for (const [teamKr, m] of leagueCount) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (best) leagueOf[teamKr] = best[0]
  }

  return NextResponse.json({
    total: rows.length,
    unmatched: rows.filter((r) => !r.name_kr).length,
    drafted: rows.filter((r) => !r.name_kr && r.name_kr_draft).length,
    leagueOf,
    rows,
  })
}

/**
 * 스쿼드 한글명 반영 — **inline_save 와 csv_import 가 같이 쓴다.**
 *
 * ⚠️ 쓰기 전에 옛 값을 읽는다. `update` 는 새 값을 돌려주므로, 여기서 안 읽으면
 *    "무엇을 → 무엇으로" 쌍이 영영 사라진다. 그 쌍이 없어서 2026-09-01 에 표기 하나를
 *    고치는 데 저장분 9곳을 손으로 SQL 했다 (recordNameCorrection 주석 참조).
 */
async function applySquadNames(
  supabase: SupabaseClient,
  updates: { team: string; slug: string; nameKr: string }[]
): Promise<{ updated: number; corrections: number; failed: string[] }> {
  let updated = 0
  let corrections = 0
  const failed: string[] = []
  for (const u of updates) {
    // 옛 값 — 정정인지 첫 입력인지 가르는 유일한 근거
    const { data: before } = await supabase
      .from("team_squads")
      .select("name_kr, name_en")
      .eq("soccerway_team_id", u.team)
      .eq("player_slug", u.slug)
      .maybeSingle()

    const { error, count } = await supabase
      .from("team_squads")
      .update({ name_kr: u.nameKr, status: "confirmed", updated_at: new Date().toISOString() })
      .eq("soccerway_team_id", u.team)
      .eq("player_slug", u.slug)
    if (error) {
      failed.push(`${u.slug}: ${error.message}`)
      continue
    }
    updated += count ?? 1

    // 표기 사전은 문이 하나다 — 여기서 직접 만지지 않고 sync-news 를 거친다
    if (before?.name_en) {
      const r = await recordNameCorrection(supabase, {
        nameEn: String(before.name_en),
        oldNameKr: before.name_kr ? String(before.name_kr) : null,
        newNameKr: u.nameKr,
      }).catch(() => "no_entry" as const)
      if (r === "updated") corrections++
    }
  }
  return { updated, corrections, failed }
}

const csvImportSchema = z.object({
  action: z.literal("csv_import"),
  csv: z.string().min(1),
  dry_run: z.boolean().optional(),
})

/**
 * 화면에서 직접 고친 것만 반영 (2026-08-25 운영자 요청:
 * "내가 수정할 것만 고친 다음에 수정 반영할 수 있게끔").
 *
 * CSV 왕복은 엑셀을 한 번 거쳐야 해서, 몇 명만 고칠 때 배보다 배꼽이 크다.
 * 표에서 고친 행만 모아 보낸다 — 규칙(한글 형식·confirmed 승격)은 CSV 경로와 **같다**.
 */
const inlineSaveSchema = z.object({
  action: z.literal("inline_save"),
  rows: z
    .array(
      z.object({
        soccerway_team_id: z.string().min(1),
        player_slug: z.string().min(1),
        name_kr: z.string().min(1),
      })
    )
    .min(1)
    .max(200), // 한 번에 200행 — 팀 하나 스쿼드가 40행대라 넉넉하다
})

/**
 * 팀 하나를 통째로 확정 (2026-08-25 운영자 요청: "팀 별로 확정 시킬 수 있는 버튼").
 *
 * 후보(`name_kr_draft`)를 `name_kr` 로 승격하고 `confirmed` 로 잠근다.
 * `edits` 로 온 행은 후보 대신 그 값을 쓴다 — 검수자가 화면에서 고친 것.
 *
 * ⚠️ 이미 `name_kr` 이 있는 행은 **건드리지 않는다.** 사람이 이미 정한 표기를
 *    기계 후보로 덮어쓰는 일이 있어선 안 된다.
 */
const confirmTeamSchema = z.object({
  action: z.literal("confirm_team"),
  soccerway_team_id: z.string().min(1),
  edits: z.record(z.string(), z.string()).optional(), // player_slug → 고친 한글명
})

/** 스쿼드 사전 → 뉴스 사전 동기화 (없는 것만 넣는다. 자세한 이유는 lib/dictionary/sync-news.ts) */
const syncNewsSchema = z.object({
  action: z.literal("sync_news"),
  apply: z.boolean().optional(),
})

/** 표기 충돌 해결 — 어느 쪽 표기로 통일할지 사람이 고른다 */
const resolveConflictSchema = z.object({
  action: z.literal("resolve_conflict"),
  romanized: z.string().min(1),
  /** squad = 스쿼드 표기로 뉴스를 맞춘다 / news = 뉴스 표기로 스쿼드를 맞춘다 */
  winner: z.enum(["squad", "news"]),
  news_id: z.string().min(1),
  value: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await req.json().catch(() => null)

  // ── 인라인 저장 ──
  const inline = inlineSaveSchema.safeParse(body)
  if (inline.success) {
    const updates: { team: string; slug: string; nameKr: string }[] = []
    const skipped: string[] = []
    for (const r of inline.data.rows) {
      const nameKr = r.name_kr.trim()
      // ⚠️ CSV 경로와 **같은 검사**를 쓴다. 여기만 느슨하면 우회로가 된다.
      if (!/^[가-힣·\s-]{2,20}$/.test(nameKr)) {
        skipped.push(`${r.player_slug} (한글명 형식 아님: ${nameKr})`)
        continue
      }
      updates.push({ team: r.soccerway_team_id, slug: r.player_slug, nameKr })
    }
    const { updated, corrections, failed } = await applySquadNames(supabase, updates)
    return NextResponse.json({ updated, corrections, failed, skipped })
  }

  // ── 팀 단위 확정 ──
  const confirmTeam = confirmTeamSchema.safeParse(body)
  if (confirmTeam.success) {
    const { soccerway_team_id, edits = {} } = confirmTeam.data
    const { data: rows, error: readErr } = await supabase
      .from("team_squads")
      .select("player_slug, name_kr, name_kr_draft")
      .eq("soccerway_team_id", soccerway_team_id)
      .neq("status", "rejected")
    if (readErr) return apiError("스쿼드 조회 실패", 500, readErr)

    let confirmed = 0
    const skipped: string[] = []
    for (const r of rows ?? []) {
      const slug = String(r.player_slug)
      // ⚠️ 사람이 정한 표기가 이미 있으면 건너뛴다 — 기계 후보로 덮어쓰지 않는다
      if (r.name_kr) continue
      const value = (edits[slug] ?? r.name_kr_draft ?? "").trim()
      if (!value) {
        skipped.push(slug) // 후보도 없고 고치지도 않음 = 미검수 유지
        continue
      }
      if (!/^[가-힣·\s-]{2,20}$/.test(value)) {
        skipped.push(`${slug} (형식 아님: ${value})`)
        continue
      }
      const { error } = await supabase
        .from("team_squads")
        .update({ name_kr: value, status: "confirmed", updated_at: new Date().toISOString() })
        .eq("soccerway_team_id", soccerway_team_id)
        .eq("player_slug", slug)
        .is("name_kr", null)
      if (!error) confirmed++
    }
    return NextResponse.json({ confirmed, skipped })
  }

  // ── 뉴스 사전 동기화 ──
  const sync = syncNewsSchema.safeParse(body)
  if (sync.success) {
    const result = await syncSquadNamesToNews(supabase, { apply: sync.data.apply })
    return NextResponse.json(result)
  }

  // ── 표기 충돌 해결 ──
  const resolve = resolveConflictSchema.safeParse(body)
  if (resolve.success) {
    const { winner, news_id, value, romanized } = resolve.data
    // ⚠️ 사전을 만지는 코드는 lib/dictionary/sync-news.ts 한 곳에 모은다
    //    ("표기 사전은 문이 하나다" 아키텍처 가드 — 경로가 갈라지면 표기 사고가 난다)
    const r = await resolveNotationConflict(supabase, {
      romanized,
      winner,
      newsId: news_id,
      value,
    })
    if (!r.ok) return apiBadRequest(r.message)
    return NextResponse.json({ resolved: romanized, winner, value })
  }

  const parsed = csvImportSchema.safeParse(body)
  if (!parsed.success)
    return apiBadRequest("csv_import · inline_save · confirm_team · sync_news 중 하나가 아닙니다")
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

  const { updated, corrections, failed } = await applySquadNames(supabase, updates)

  return NextResponse.json({ updated, corrections, failed, skipped })
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { apiBadRequest, apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"
// CSV 일괄 등재는 행마다 soccerway 팀 페이지를 검증 fetch 한다 (최대 25건)
export const maxDuration = 120

/**
 * 팀 사전 관리 (실록 단계 2-B, 2026-08-07)
 *
 * 선수 표기 사전(player-dictionary)과 같은 원칙: 후보 수집·제안까지만 자동,
 * **확정은 사람 클릭**. 자동 등재는 하지 않는다 — 사전 오염은 이후 모든
 * 경기 매핑에 전파된다 (시드 드라이런에서 구 URL id 오류가 west-ham→bolton,
 * atletico→somalia 로 착지한 실측이 근거).
 *
 * GET: 사전 목록 + 미등재 팀 큐(매핑 shadow 의 team_unresolved 집계) + 매핑 제안 현황
 *      `?format=csv` → 사전 전체를 CSV 로 (엑셀용 BOM 포함, 별칭은 `|` 구분)
 * POST:
 *  - alias    미등재 표기를 기존 팀의 별칭으로 흡수
 *  - register soccerway 팀 URL 을 검증 fetch 해 신규 등재 (slug·해시는 서버가 추출)
 *  - confirm  proposed → confirmed (오너 확정 라벨 — 실기록 자격)
 *  - rename       대표 한글 표기 교체 (틀린 표기 수정)
 *  - remove_alias 잘못 흡수된 별칭 제거
 *  - repoint      한글 표기를 엉뚱한 팀에서 올바른 팀으로 이설
 *  - csv_import   CSV 일괄 반영 (`dry_run` 으로 먼저 미리보기)
 *  - reject   해석에서 제외 — ⚠️ **최후 수단**
 *
 * ⚠️ 사전이 틀렸을 때의 정답은 **제외가 아니라 수정**이다 (2026-08-15).
 *    리졸버는 `status === "rejected"` 인 행을 건너뛴다(match-mapping.ts). 즉 reject 하면
 *    그 팀이 낀 경기가 영구히 team_unresolved 로 떨어져 **커버리지가 조용히 사라진다.**
 *    reject 는 "이 soccerway 팀은 우리 사전에 있을 이유가 없다"일 때만 쓴다.
 *    표기가 틀렸을 뿐이면 rename/repoint 로 고칠 것.
 */

const LOOKBACK_DAYS = 14

/** CSV 한 칸 — 쉼표/따옴표/줄바꿈이 있으면 감싸고 따옴표는 두 번 */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** RFC4180 기본형 파서 — 따옴표 안의 쉼표/줄바꿈/이스케이프 처리 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  const src = text.replace(/^﻿/, "") // BOM 제거 (엑셀 저장분)
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += c
      continue
    }
    if (c === '"') inQuotes = true
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

const CSV_COLUMNS = [
  "soccerway_team_id",
  "url",
  "name_kr",
  "short_kr", // 통칭 — "레알", "인테르", "서울" (지면에서 부르는 이름)
  "aliases_kr",
  "name_en",
  "slug",
  "status",
  "note",
] as const

export async function GET(request: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // ── CSV 내보내기 ────────────────────────────────────────────────
  // 등재할 팀이 100개 가까이라 1클릭 반복은 무리 — 표로 빼서 편집하고 되올린다.
  // aliases_kr 는 CSV 안에서 쉼표와 충돌하므로 **| 로 구분**한다.
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const { data, error } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id, slug, name_en, name_kr, short_kr, aliases_kr, status, note")
      .order("name_en")
    if (error) return apiError("팀 사전 조회 실패", 500, error)
    const lines = [
      CSV_COLUMNS.join(","),
      ...(data ?? []).map((t) =>
        [
          t.soccerway_team_id,
          "", // url — 신규 등재 시에만 채운다
          t.name_kr,
          t.short_kr,
          (t.aliases_kr ?? []).join("|"),
          t.name_en,
          t.slug,
          t.status,
          t.note,
        ]
          .map(csvCell)
          .join(",")
      ),
    ]
    // 엑셀이 UTF-8 로 열도록 BOM 을 붙인다 (없으면 한글이 깨진다)
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="team-dictionary.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000).toISOString()

  const [teamsRes, attemptsRes] = await Promise.all([
    supabase
      .from("team_dictionary")
      .select("soccerway_team_id, slug, name_en, name_kr, aliases_kr, status, source, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("match_mapping_attempts")
      .select(
        "game_id, outcome, unresolved_names, candidate_url, page_home_en, page_away_en, page_date, page_tournament, home_away_flip, created_at"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ])

  if (teamsRes.error) return apiError("팀 사전 조회 실패", 500, teamsRes.error)
  if (attemptsRes.error) return apiError("매핑 원장 조회 실패", 500, attemptsRes.error)

  const teams = teamsRes.data ?? []
  const attempts = attemptsRes.data ?? []

  // 미등재 표기 집계 — 이미 등재된 표기(등재 후 남은 옛 행)는 큐에서 뺀다
  const known = new Set<string>()
  for (const t of teams) {
    if (t.name_kr) known.add(t.name_kr)
    for (const a of t.aliases_kr ?? []) known.add(a)
  }
  const unresolvedMap = new Map<string, { name: string; hits: number; latest: string }>()
  const outcomeCounts: Record<string, number> = {}
  for (const a of attempts) {
    outcomeCounts[a.outcome] = (outcomeCounts[a.outcome] ?? 0) + 1
    if (a.outcome !== "team_unresolved") continue
    for (const name of a.unresolved_names ?? []) {
      if (known.has(name)) continue
      const cur = unresolvedMap.get(name)
      if (cur) {
        cur.hits++
        if (a.created_at > cur.latest) cur.latest = a.created_at
      } else {
        unresolvedMap.set(name, { name, hits: 1, latest: a.created_at })
      }
    }
  }

  // 매핑 제안 — 같은 경기의 마켓별 행이 중복되므로 (URL, 날짜) 로 접는다
  const seen = new Set<string>()
  const proposals: {
    pageHomeEn: string | null
    pageAwayEn: string | null
    pageDate: string | null
    pageTournament: string | null
    homeAwayFlip: boolean | null
    candidateUrl: string | null
    gameCount: number
    latest: string
  }[] = []
  for (const a of attempts) {
    if (a.outcome !== "proposed") continue
    const key = `${a.candidate_url}|${a.page_date}`
    if (seen.has(key)) {
      const p = proposals.find((x) => `${x.candidateUrl}|${x.pageDate}` === key)
      if (p) p.gameCount++
      continue
    }
    seen.add(key)
    proposals.push({
      pageHomeEn: a.page_home_en,
      pageAwayEn: a.page_away_en,
      pageDate: a.page_date,
      pageTournament: a.page_tournament,
      homeAwayFlip: a.home_away_flip,
      candidateUrl: a.candidate_url,
      gameCount: 1,
      latest: a.created_at,
    })
  }

  return NextResponse.json({
    teams,
    unresolved: [...unresolvedMap.values()].sort((x, y) => y.hits - x.hits),
    proposals: proposals.slice(0, 30),
    outcomeCounts,
  })
}

const postSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("alias"),
    soccerway_team_id: z.string().min(1),
    alias: z.string().min(1).max(60),
  }),
  z.object({
    mode: z.literal("register"),
    url: z.string().url(),
    name_kr: z.string().min(1).max(60),
    alias: z.string().max(60).optional(),
  }),
  z.object({ mode: z.literal("confirm"), soccerway_team_id: z.string().min(1) }),
  z.object({ mode: z.literal("reject"), soccerway_team_id: z.string().min(1) }),

  // ── 수정 3종 (2026-08-15) ────────────────────────────────────────
  // 사전이 틀렸을 때의 정답은 **제외가 아니라 수정**이다. reject 는 리졸버가
  // 그 팀을 통째로 건너뛰게 만들어(match-mapping.ts `status === "rejected"` → continue)
  // 해당 팀이 낀 경기가 영구히 team_unresolved 로 떨어진다 = 커버리지 영구 손실.
  z.object({
    mode: z.literal("rename"),
    soccerway_team_id: z.string().min(1),
    name_kr: z.string().min(1).max(60),
    // 기본은 **버림**. 고치는 이유가 "그 표기가 틀려서"이므로 별칭으로 남기면
    // 틀린 표기가 계속 이 팀으로 해석된다. 실제 통용 표기였을 때만 켤 것.
    keep_old_as_alias: z.boolean().optional(),
    note: z.string().max(300).optional(),
  }),
  z.object({
    mode: z.literal("remove_alias"),
    soccerway_team_id: z.string().min(1),
    alias: z.string().min(1).max(60),
  }),
  z.object({
    // CSV 일괄 반영. dry_run 이면 무엇이 바뀔지만 계산해서 돌려준다(쓰기 없음).
    // 신규 등재 행은 url 을 실제로 fetch 해 검증하므로 한 번에 많이 넣지 않는다.
    mode: z.literal("csv_import"),
    csv: z.string().min(1).max(200_000),
    dry_run: z.boolean().optional(),
  }),
  z.object({
    // 한글 표기가 **엉뚱한 팀**에 붙었을 때 — 표기를 올바른 팀으로 이설한다.
    // (시드 드라이런의 west-ham→bolton, atletico→somalia 착지가 이 케이스)
    mode: z.literal("repoint"),
    from_soccerway_team_id: z.string().min(1),
    url: z.string().url(),
    name_kr: z.string().min(1).max(60).optional(),
    move_aliases: z.boolean().optional(),
    note: z.string().max(300).optional(),
  }),
])

const TEAM_URL_RE = /\/team\/([a-z0-9-]+)\/([A-Za-z0-9]{8})\/?$/
const FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-GB,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

/**
 * soccerway 팀 URL → { slug, hash, nameEn }.
 *
 * 구 URL 도 허용 (301 을 따라가 최종 신 URL 에서 추출). 구 URL 리다이렉트는 숫자 id 만
 * 보므로, 여기서 추출한 slug·해시가 곧 검증 결과다. 표시명은 페이지 title 에서 뽑는다 —
 * 홈/원정 대조가 soccerway 표시명 기준이라 표시명이 정본.
 */
async function resolveTeamUrl(
  url: string
): Promise<
  { ok: true; slug: string; hash: string; nameEn: string } | { ok: false; message: string }
> {
  const host = new URL(url).hostname
  if (!host.endsWith("soccerway.com")) {
    return { ok: false, message: "soccerway.com 팀 URL 만 허용됩니다." }
  }
  const res = await fetch(url, { headers: FETCH_HEADERS, redirect: "follow" })
  const finalUrl = res.url || url
  const m = finalUrl.match(TEAM_URL_RE)
  if (!res.ok || !m) {
    return {
      ok: false,
      message: `팀 페이지가 아닙니다 (최종 URL: ${finalUrl}). /team/{이름}/{해시}/ 형태의 팀 URL 을 붙여넣어 주세요.`,
    }
  }
  const [, slug, hash] = m
  const html = await res.text()
  const title = html.match(/<title>([^<|]+?)(?:\s+live scores| \|)/i)
  const nameEn =
    title?.[1]?.trim() ||
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  return { ok: true, slug, hash, nameEn }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiBadRequest("JSON 본문이 필요합니다.")
  }
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return apiBadRequest(parsed.error.errors[0]?.message ?? "잘못된 요청 형식입니다.")
  }
  const input = parsed.data

  try {
    if (input.mode === "alias") {
      const { data: team } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .eq("soccerway_team_id", input.soccerway_team_id)
        .maybeSingle()
      if (!team) return apiBadRequest("대상 팀이 사전에 없습니다.")

      const alias = input.alias.trim()
      const merged = Array.from(new Set([...(team.aliases_kr ?? []), alias]))
      const { error } = await supabase
        .from("team_dictionary")
        .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
        .eq("soccerway_team_id", input.soccerway_team_id)
      if (error) return apiError("별칭 등재 실패", 500, error)
      return NextResponse.json({ success: true, merged_into: team.name_kr })
    }

    if (input.mode === "register") {
      const resolved = await resolveTeamUrl(input.url)
      if (!resolved.ok) return apiBadRequest(resolved.message)
      const { slug, hash, nameEn } = resolved

      const { data: existing } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .eq("soccerway_team_id", hash)
        .maybeSingle()

      const nameKr = input.name_kr.trim()
      const extraAliases = input.alias?.trim() ? [input.alias.trim()] : []

      if (existing) {
        // 이미 등재된 팀 — 새 표기를 별칭으로 흡수 (대표 표기는 보호)
        const merged = Array.from(
          new Set([...(existing.aliases_kr ?? []), nameKr, ...extraAliases])
        )
        const { error } = await supabase
          .from("team_dictionary")
          .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
          .eq("soccerway_team_id", hash)
        if (error) return apiError("별칭 흡수 실패", 500, error)
        return NextResponse.json({ success: true, merged_into: existing.name_kr, hash })
      }

      const { error } = await supabase.from("team_dictionary").insert({
        soccerway_team_id: hash,
        slug,
        name_en: nameEn,
        name_kr: nameKr,
        aliases_kr: extraAliases,
        status: "proposed",
        source: "admin",
      })
      if (error) return apiError("등재 실패", 500, error)
      return NextResponse.json({ success: true, hash, slug, name_en: nameEn })
    }

    // ── CSV 일괄 반영 ───────────────────────────────────────────────
    if (input.mode === "csv_import") {
      const rows = parseCsv(input.csv)
      if (rows.length < 2) return apiBadRequest("헤더 + 최소 1행이 필요합니다.")
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      const iId = idx("soccerway_team_id")
      const iUrl = idx("url")
      const iKr = idx("name_kr")
      const iShort = idx("short_kr")
      const iAliases = idx("aliases_kr")
      const iStatus = idx("status")
      const iNote = idx("note")
      if (iKr < 0 && iAliases < 0) {
        return apiBadRequest("name_kr 또는 aliases_kr 열이 있어야 합니다.")
      }
      if (iId < 0 && iUrl < 0) {
        return apiBadRequest("soccerway_team_id 또는 url 열이 있어야 합니다.")
      }

      const body = rows.slice(1)
      // URL 검증은 외부 fetch 라 느리다 — 한 번에 처리할 신규 등재 수를 제한한다.
      const MAX_URL_LOOKUPS = 25
      let lookups = 0

      const plan: {
        line: number
        action: "insert" | "update" | "skip" | "error"
        name_kr: string
        detail: string
      }[] = []

      // 미리 사전 전체를 읽어 둔다 (행마다 조회하면 왕복이 폭증)
      const { data: existingAll } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, short_kr, aliases_kr, status, note")
      const byId = new Map((existingAll ?? []).map((t) => [t.soccerway_team_id, t]))

      for (let r = 0; r < body.length; r++) {
        const cells = body[r]
        const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "")
        const line = r + 2 // 1-based + 헤더
        const nameKr = get(iKr)
        const shortKr = get(iShort)
        const aliases = get(iAliases)
          .split("|")
          .map((a) => a.trim())
          .filter(Boolean)
        const status = get(iStatus)
        const note = get(iNote)
        let hash = get(iId)
        const url = get(iUrl)

        if (status && !["proposed", "confirmed", "rejected"].includes(status)) {
          plan.push({
            line,
            action: "error",
            name_kr: nameKr,
            detail: `status 값이 잘못됨: ${status}`,
          })
          continue
        }

        // 해시가 없으면 URL 로 해석 — soccerway 팀 페이지임을 실제로 확인한다.
        // (사전 오염은 이후 모든 매핑에 전파되므로 여기서 검증을 건너뛰지 않는다)
        let slug = ""
        let nameEn = ""
        if (!hash) {
          if (!url) {
            plan.push({ line, action: "skip", name_kr: nameKr, detail: "id·url 둘 다 없음" })
            continue
          }
          if (lookups >= MAX_URL_LOOKUPS) {
            plan.push({
              line,
              action: "skip",
              name_kr: nameKr,
              detail: `신규 등재는 한 번에 ${MAX_URL_LOOKUPS}개까지 — 나눠서 올려주세요`,
            })
            continue
          }
          lookups++
          const resolved = await resolveTeamUrl(url)
          if (!resolved.ok) {
            plan.push({ line, action: "error", name_kr: nameKr, detail: resolved.message })
            continue
          }
          hash = resolved.hash
          slug = resolved.slug
          nameEn = resolved.nameEn
        }

        const found = byId.get(hash)
        if (found) {
          const nextAliases = Array.from(new Set([...(found.aliases_kr ?? []), ...aliases])).filter(
            (a) => a !== (nameKr || found.name_kr)
          )
          const changes: string[] = []
          if (nameKr && nameKr !== found.name_kr)
            changes.push(`표기 ${found.name_kr ?? "—"}→${nameKr}`)
          if (shortKr && shortKr !== found.short_kr)
            changes.push(`통칭 ${found.short_kr ?? "—"}→${shortKr}`)
          if (nextAliases.length !== (found.aliases_kr ?? []).length)
            changes.push(`별칭 +${nextAliases.length - (found.aliases_kr ?? []).length}`)
          if (status && status !== found.status) changes.push(`상태 ${found.status}→${status}`)
          if (changes.length === 0) {
            plan.push({
              line,
              action: "skip",
              name_kr: nameKr || (found.name_kr ?? ""),
              detail: "변경 없음",
            })
            continue
          }
          plan.push({
            line,
            action: "update",
            name_kr: nameKr || (found.name_kr ?? ""),
            detail: changes.join(", "),
          })
          if (!input.dry_run) {
            const { error } = await supabase
              .from("team_dictionary")
              .update({
                name_kr: nameKr || found.name_kr,
                short_kr: shortKr || found.short_kr,
                aliases_kr: nextAliases,
                status: status || found.status,
                note: note || found.note,
                updated_at: new Date().toISOString(),
              })
              .eq("soccerway_team_id", hash)
            if (error)
              plan[plan.length - 1] = {
                line,
                action: "error",
                name_kr: nameKr,
                detail: error.message,
              }
          }
        } else {
          if (!nameKr) {
            plan.push({
              line,
              action: "error",
              name_kr: "",
              detail: "신규 등재인데 name_kr 이 없음",
            })
            continue
          }
          if (!slug) {
            plan.push({
              line,
              action: "error",
              name_kr: nameKr,
              detail: "사전에 없는 id — 신규 등재는 url 열로 넣어주세요",
            })
            continue
          }
          plan.push({ line, action: "insert", name_kr: nameKr, detail: `${nameEn} (${hash})` })
          if (!input.dry_run) {
            const { error } = await supabase.from("team_dictionary").insert({
              soccerway_team_id: hash,
              slug,
              name_en: nameEn,
              name_kr: nameKr,
              short_kr: shortKr || null,
              aliases_kr: aliases,
              status: status || "proposed",
              source: "csv",
              note: note || null,
            })
            if (error)
              plan[plan.length - 1] = {
                line,
                action: "error",
                name_kr: nameKr,
                detail: error.message,
              }
          }
        }
      }

      const tally = plan.reduce<Record<string, number>>((a, p) => {
        a[p.action] = (a[p.action] ?? 0) + 1
        return a
      }, {})
      return NextResponse.json({ success: true, dry_run: !!input.dry_run, tally, plan })
    }

    // ── 수정 3종 ────────────────────────────────────────────────────
    if (input.mode === "rename") {
      const { data: team } = await supabase
        .from("team_dictionary")
        .select("name_kr, aliases_kr, note")
        .eq("soccerway_team_id", input.soccerway_team_id)
        .maybeSingle()
      if (!team) return apiBadRequest("대상 팀이 사전에 없습니다.")

      const next = input.name_kr.trim()
      const old = (team.name_kr ?? "").trim()
      // 기존 표기는 기본적으로 **버린다** — 고치는 이유가 그 표기가 틀려서이므로,
      // 별칭으로 남기면 틀린 표기가 계속 이 팀으로 해석된다.
      let aliases = (team.aliases_kr ?? []).filter((a: string) => a !== next)
      if (input.keep_old_as_alias && old && old !== next) {
        aliases = Array.from(new Set([...aliases, old]))
      } else if (old) {
        aliases = aliases.filter((a: string) => a !== old)
      }

      const { error } = await supabase
        .from("team_dictionary")
        .update({
          name_kr: next,
          aliases_kr: aliases,
          note: input.note ?? team.note,
          updated_at: new Date().toISOString(),
        })
        .eq("soccerway_team_id", input.soccerway_team_id)
      if (error) return apiError("표기 수정 실패", 500, error)
      return NextResponse.json({ success: true, from: old || null, to: next, aliases })
    }

    if (input.mode === "remove_alias") {
      const { data: team } = await supabase
        .from("team_dictionary")
        .select("aliases_kr")
        .eq("soccerway_team_id", input.soccerway_team_id)
        .maybeSingle()
      if (!team) return apiBadRequest("대상 팀이 사전에 없습니다.")
      const target = input.alias.trim()
      const aliases = (team.aliases_kr ?? []).filter((a: string) => a !== target)
      if (aliases.length === (team.aliases_kr ?? []).length) {
        return apiBadRequest("해당 별칭이 없습니다.")
      }
      const { error } = await supabase
        .from("team_dictionary")
        .update({ aliases_kr: aliases, updated_at: new Date().toISOString() })
        .eq("soccerway_team_id", input.soccerway_team_id)
      if (error) return apiError("별칭 제거 실패", 500, error)
      return NextResponse.json({ success: true, removed: target, aliases })
    }

    if (input.mode === "repoint") {
      // 한글 표기가 엉뚱한 팀에 붙은 경우 — 표기를 올바른 팀으로 **이설**한다.
      // 원본 행은 지우지 않는다(그 soccerway 팀 자체는 실재한다). 한글 결속만 떼어내
      // 더 이상 아무 betman 표기와도 매칭되지 않게 한다.
      const { data: from } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .eq("soccerway_team_id", input.from_soccerway_team_id)
        .maybeSingle()
      if (!from) return apiBadRequest("원본 팀이 사전에 없습니다.")

      const resolved = await resolveTeamUrl(input.url)
      if (!resolved.ok) return apiBadRequest(resolved.message)
      const { slug, hash, nameEn } = resolved
      if (hash === from.soccerway_team_id) {
        return apiBadRequest("원본과 같은 팀입니다 — 이설할 필요가 없습니다.")
      }

      const moving = (input.name_kr ?? from.name_kr ?? "").trim()
      if (!moving) return apiBadRequest("옮길 한글 표기가 없습니다.")
      const movingAliases = input.move_aliases ? (from.aliases_kr ?? []) : []

      const { data: target } = await supabase
        .from("team_dictionary")
        .select("soccerway_team_id, name_kr, aliases_kr")
        .eq("soccerway_team_id", hash)
        .maybeSingle()

      if (target) {
        // 이미 있는 팀이면 대표 표기는 보호하고 별칭으로 흡수
        const merged = Array.from(
          new Set([
            ...(target.aliases_kr ?? []),
            ...(target.name_kr ? [moving] : []),
            ...movingAliases,
          ])
        ).filter((a) => a !== target.name_kr)
        const { error } = await supabase
          .from("team_dictionary")
          .update({
            name_kr: target.name_kr ?? moving,
            aliases_kr: merged,
            updated_at: new Date().toISOString(),
          })
          .eq("soccerway_team_id", hash)
        if (error) return apiError("이설 대상 갱신 실패", 500, error)
      } else {
        const { error } = await supabase.from("team_dictionary").insert({
          soccerway_team_id: hash,
          slug,
          name_en: nameEn,
          name_kr: moving,
          aliases_kr: movingAliases,
          status: "proposed",
          source: "admin",
          note: input.note ?? null,
        })
        if (error) return apiError("이설 대상 등재 실패", 500, error)
      }

      // 원본에서 한글 결속 제거
      const { error: clearErr } = await supabase
        .from("team_dictionary")
        .update({
          name_kr: null,
          aliases_kr: input.move_aliases ? [] : (from.aliases_kr ?? []),
          note: input.note ?? `한글 표기를 ${nameEn}(${hash}) 로 이설`,
          updated_at: new Date().toISOString(),
        })
        .eq("soccerway_team_id", from.soccerway_team_id)
      if (clearErr) return apiError("원본 정리 실패", 500, clearErr)

      return NextResponse.json({
        success: true,
        moved: moving,
        to: { hash, slug, name_en: nameEn },
        aliases_moved: movingAliases.length,
      })
    }

    // confirm / reject
    const nextStatus = input.mode === "confirm" ? "confirmed" : "rejected"
    const { data: rows, error } = await supabase
      .from("team_dictionary")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("soccerway_team_id", input.soccerway_team_id)
      .select("soccerway_team_id")
    if (error) return apiError("상태 변경 실패", 500, error)
    if (!rows || rows.length === 0) return apiBadRequest("대상 팀이 사전에 없습니다.")
    return NextResponse.json({ success: true })
  } catch (e) {
    return apiError("처리 실패", 500, e)
  }
}

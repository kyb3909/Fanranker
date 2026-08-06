import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireStaffApi } from "@/lib/admin/roles"
import { apiBadRequest, apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

/**
 * 팀 사전 관리 (실록 단계 2-B, 2026-08-07)
 *
 * 선수 표기 사전(player-dictionary)과 같은 원칙: 후보 수집·제안까지만 자동,
 * **확정은 사람 클릭**. 자동 등재는 하지 않는다 — 사전 오염은 이후 모든
 * 경기 매핑에 전파된다 (시드 드라이런에서 구 URL id 오류가 west-ham→bolton,
 * atletico→somalia 로 착지한 실측이 근거).
 *
 * GET: 사전 목록 + 미등재 팀 큐(매핑 shadow 의 team_unresolved 집계) + 매핑 제안 현황
 * POST:
 *  - alias    미등재 표기를 기존 팀의 별칭으로 흡수
 *  - register soccerway 팀 URL 을 검증 fetch 해 신규 등재 (slug·해시는 서버가 추출)
 *  - confirm  proposed → confirmed (오너 확정 라벨 — 실기록 자격)
 *  - reject   잘못된 항목 비활성 (해석에서 제외)
 */

const LOOKBACK_DAYS = 14

export async function GET() {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

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
])

const TEAM_URL_RE = /\/team\/([a-z0-9-]+)\/([A-Za-z0-9]{8})\/?$/
const FETCH_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-GB,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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
      // soccerway 팀 URL 검증 — 구 URL 도 허용 (301 을 따라가 최종 신 URL 에서 추출).
      // 구 URL 리다이렉트는 숫자 id 만 보므로, 여기서 추출한 slug·해시가 곧 검증 결과다.
      const host = new URL(input.url).hostname
      if (!host.endsWith("soccerway.com")) {
        return apiBadRequest("soccerway.com 팀 URL 만 허용됩니다.")
      }
      const res = await fetch(input.url, { headers: FETCH_HEADERS, redirect: "follow" })
      const finalUrl = res.url || input.url
      const m = finalUrl.match(TEAM_URL_RE)
      if (!res.ok || !m) {
        return apiBadRequest(
          `팀 페이지가 아닙니다 (최종 URL: ${finalUrl}). /team/{이름}/{해시}/ 형태의 팀 URL 을 붙여넣어 주세요.`
        )
      }
      const [, slug, hash] = m

      // 표시명은 페이지 title 에서 — 홈/원정 대조가 soccerway 표시명 기준이라 표시명이 정본
      const html = await res.text()
      const title = html.match(/<title>([^<|]+?)(?:\s+live scores| \|)/i)
      const nameEn =
        title?.[1]?.trim() ||
        slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")

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

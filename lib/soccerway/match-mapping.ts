/**
 * betman↔Soccerway 경기 매핑 — shadow 러너 (실록 단계 2, 2026-08-07)
 *
 * 흐름: betman 경기(한글 팀명 2개 + 킥오프)
 *   → 팀 사전 해석 (정확 일치만 — 퍼지/LLM 금지 영역)
 *   → /match/{a}/{b}/ URL 구성 → 정적 fetch
 *   → 술어: canonical 해시 집합 일치 + 날짜 ±1일 → proposed
 *   → match_mapping_attempts 에 append (shadow — betman_games.mapped_* 는 안 쓴다)
 *
 * 실기록(라이브 전환)은 골든셋 게이트(G-매칭 50쌍) 통과 후 별도 단계.
 * 실패 분류 규율: 판정(proposed/ambiguous/no_candidate/team_unresolved)과
 * 실행 실패(fetch_error + retry_wait/dead_letter)를 절대 합치지 않는다.
 */

import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildMatchUrl,
  fetchMatchPage,
  parseMatchPage,
  type MatchPageFetchResult,
  type SoccerwayMatchCandidate,
  type SoccerwayMatchPageInfo,
} from "./match-page"

/**
 * 술어/파서 버전 — 규칙이 바뀌면 올린다. 버전이 오르면 전 경기 재평가가 열린다.
 * .2 (2026-08-07): 2연전 목록 템플릿(B) 지원 — .1 은 단일 템플릿만 알아서
 * UCL 예선 쌍 페이지가 전부 parse_failed(dead_letter)로 남았다 (원장 실측).
 */
export const PREDICATE_VERSION = "match-mapping@2026-08-07.2"

/** fetch_error 재시도 상한 — 초과 시 dead_letter (assignment desk 관례) */
const MAX_FETCH_ATTEMPTS = 2

/** 킥오프와 페이지 날짜의 허용 오차(일). soccerway 날짜의 시간대가 불명이라 ±1일 필요 */
const DATE_TOLERANCE_DAYS = 1

export interface TeamDictionaryRow {
  soccerway_team_id: string
  slug: string
  name_en: string
  name_kr: string | null
  aliases_kr: string[]
  status: string
}

export interface BetmanGameRow {
  id: string
  home_team_name: string
  away_team_name: string
  match_time: string
  league_code: string | null
}

/** 한글 표기 → 사전 행. 대표 표기와 alias 의 정확 일치(trim)만 허용한다. */
export function resolveTeam(
  nameKr: string,
  dictionary: TeamDictionaryRow[]
): TeamDictionaryRow | null {
  const needle = nameKr.trim()
  if (!needle) return null
  for (const row of dictionary) {
    if (row.status === "rejected") continue
    if (row.name_kr === needle) return row
    if (row.aliases_kr.includes(needle)) return row
  }
  return null
}

/**
 * 입력 해시 — betman 팀명 2개 + 킥오프 + **해석된 해시 2개**까지 포함한다.
 * 사전에 팀이 등재되면 해시가 바뀌어 (부분 유니크에 막히지 않고) 재평가가 열린다.
 */
export function mappingInputHash(
  game: Pick<BetmanGameRow, "home_team_name" | "away_team_name" | "match_time">,
  homeId: string | null,
  awayId: string | null
): string {
  return createHash("sha256")
    .update(
      [game.home_team_name, game.away_team_name, game.match_time, homeId ?? "", awayId ?? ""].join(
        "|"
      )
    )
    .digest("hex")
    .slice(0, 32)
}

function dateDiffDays(isoDateA: string, isoDateB: string): number {
  const a = Date.parse(`${isoDateA}T00:00:00Z`)
  const b = Date.parse(`${isoDateB}T00:00:00Z`)
  return Math.abs(a - b) / 86_400_000
}

/** timestamptz → UTC 날짜(YYYY-MM-DD) */
export function kickoffUtcDate(matchTime: string): string {
  return new Date(matchTime).toISOString().slice(0, 10)
}

/**
 * 후보의 날짜를 확정한다. 목록 템플릿(B)은 연도가 없어 킥오프 연도 ±1 중
 * 킥오프에 가장 가까운 해석을 고른다 (12월↔1월 경계 방어).
 */
function candidateDateIso(candidate: SoccerwayMatchCandidate, kickoffIso: string): string {
  if (candidate.dateIso) return candidate.dateIso
  const kickoffYear = Number(kickoffIso.slice(0, 4))
  const mm = String(candidate.month).padStart(2, "0")
  const dd = String(candidate.day).padStart(2, "0")
  let best = `${kickoffYear}-${mm}-${dd}`
  let bestDiff = dateDiffDays(kickoffIso, best)
  for (const year of [kickoffYear - 1, kickoffYear + 1]) {
    const iso = `${year}-${mm}-${dd}`
    const diff = dateDiffDays(kickoffIso, iso)
    if (diff < bestDiff) {
      best = iso
      bestDiff = diff
    }
  }
  return best
}

export interface MatchJudgement {
  outcome: "proposed" | "ambiguous" | "no_candidate"
  /** betman 홈/원정 ≠ soccerway 홈/원정 (자동 스왑 금지 — 검수 신호). null = 이름 대조 불능 */
  homeAwayFlip: boolean | null
  /** 매칭된 후보 (proposed 일 때) — 원장 기록용 */
  matched: { homeEn: string; awayEn: string; dateIso: string } | null
  reason: string | null
}

/**
 * 페이지가 betman 경기와 같은 경기인지 판정.
 * 구성 URL 은 "그 팀쌍의 경기(들)" 페이지다 — 서술된 후보 중 킥오프 ±1일인 것이
 * 정확히 1건일 때만 proposed (fail-closed). 2연전 등 나머지는 ambiguous 로 검수.
 */
export function judgeMatchPage(
  game: Pick<BetmanGameRow, "match_time">,
  home: TeamDictionaryRow,
  away: TeamDictionaryRow,
  page: SoccerwayMatchPageInfo
): MatchJudgement {
  const expected = new Set([home.soccerway_team_id, away.soccerway_team_id])
  const actual = new Set(page.canonicalTeamIds)
  const sameTeams = expected.size === actual.size && [...expected].every((id) => actual.has(id))

  if (page.canonicalTeamIds.length === 2 && !sameTeams) {
    return {
      outcome: "ambiguous",
      homeAwayFlip: null,
      matched: null,
      reason: `canonical 팀 불일치: ${page.canonicalTeamIds.join(",")}`,
    }
  }

  const kickoffIso = kickoffUtcDate(game.match_time)
  const withDates = page.candidates.map((c) => ({ c, dateIso: candidateDateIso(c, kickoffIso) }))
  const near = withDates.filter(
    ({ dateIso }) => dateDiffDays(kickoffIso, dateIso) <= DATE_TOLERANCE_DAYS
  )

  if (near.length === 0) {
    const listed = withDates.map(({ dateIso }) => dateIso).join(", ")
    return {
      outcome: "ambiguous",
      homeAwayFlip: null,
      matched: null,
      reason: `날짜 불일치: 킥오프 ${kickoffIso} vs 페이지 [${listed}] (같은 쌍의 다른 경기로 추정)`,
    }
  }

  if (near.length > 1) {
    return {
      outcome: "ambiguous",
      homeAwayFlip: null,
      matched: null,
      reason: `킥오프 ±1일에 후보 ${near.length}건 — 단일 확정 불가`,
    }
  }

  const { c, dateIso } = near[0]

  // 홈/원정 대조 — 매칭된 후보의 서술 순서가 Soccerway 정본. 이름은 정확(대소문자 무시) 일치만.
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
  let flip: boolean | null = null
  if (eq(c.homeEn, home.name_en) && eq(c.awayEn, away.name_en)) flip = false
  else if (eq(c.homeEn, away.name_en) && eq(c.awayEn, home.name_en)) flip = true

  return {
    outcome: "proposed",
    homeAwayFlip: flip,
    matched: { homeEn: c.homeEn, awayEn: c.awayEn, dateIso },
    reason: null,
  }
}

export interface ShadowRunSummary {
  scanned: number
  skipped: number
  proposed: number
  ambiguous: number
  noCandidate: number
  teamUnresolved: number
  fetchError: number
  flips: number
  errors: string[]
}

type Fetcher = (url: string) => Promise<MatchPageFetchResult>

/**
 * shadow 1회 실행: 다가오는 betman 축구 경기를 사전으로 해석해 soccerway 대조를
 * 시도 원장에 기록한다. betman_games 는 절대 쓰지 않는다.
 */
export async function runMatchMappingShadow(
  supabase: SupabaseClient,
  options: { limit?: number; runId?: string; fetcher?: Fetcher; paceMs?: number } = {}
): Promise<ShadowRunSummary> {
  const limit = options.limit ?? 15
  const runId = options.runId ?? `shadow-${Date.now()}`
  const fetcher = options.fetcher ?? fetchMatchPage
  const paceMs = options.paceMs ?? 400

  const summary: ShadowRunSummary = {
    scanned: 0,
    skipped: 0,
    proposed: 0,
    ambiguous: 0,
    noCandidate: 0,
    teamUnresolved: 0,
    fetchError: 0,
    flips: 0,
    errors: [],
  }

  // 국가대표(축월드컵 등)는 클럽 사전 범위 밖 — 클럽 축구만 본다.
  const { data: games, error: gamesError } = await supabase
    .from("betman_games")
    .select("id, home_team_name, away_team_name, match_time, league_code")
    .eq("sport", "축구")
    .gte("match_time", new Date(Date.now() - 24 * 3600_000).toISOString())
    .lte("match_time", new Date(Date.now() + 8 * 24 * 3600_000).toISOString())
    .order("match_time", { ascending: true })
    .limit(200)

  if (gamesError) {
    summary.errors.push(`betman_games 조회 실패: ${gamesError.message}`)
    return summary
  }

  const targetGames = (games || []) as BetmanGameRow[]
  if (targetGames.length === 0) return summary

  const { data: dictRows, error: dictError } = await supabase
    .from("team_dictionary")
    .select("soccerway_team_id, slug, name_en, name_kr, aliases_kr, status")

  if (dictError) {
    summary.errors.push(`team_dictionary 조회 실패: ${dictError.message}`)
    return summary
  }
  const dictionary = (dictRows || []) as TeamDictionaryRow[]

  const gameIds = targetGames.map((g) => g.id)
  const { data: priorRows, error: priorError } = await supabase
    .from("match_mapping_attempts")
    .select("game_id, input_hash, predicate_version, status, attempt")
    .in("game_id", gameIds)
    .eq("predicate_version", PREDICATE_VERSION)

  if (priorError) {
    summary.errors.push(`attempts 조회 실패: ${priorError.message}`)
    return summary
  }

  // (game, input_hash) 별 확정(ok/dead_letter) 여부와 시도 횟수
  const settled = new Set<string>()
  const attemptCount = new Map<string, number>()
  for (const row of priorRows || []) {
    const key = `${row.game_id}|${row.input_hash}`
    if (row.status === "ok" || row.status === "dead_letter") settled.add(key)
    attemptCount.set(key, Math.max(attemptCount.get(key) ?? 0, row.attempt))
  }

  let processed = 0
  // 같은 경기의 마켓별 행(승부/핸디캡/언더오버…)이 같은 URL 을 반복 fetch 하지 않도록 런 내 메모
  const pageCache = new Map<string, MatchPageFetchResult>()
  for (const game of targetGames) {
    if (processed >= limit) break

    const home = resolveTeam(game.home_team_name, dictionary)
    const away = resolveTeam(game.away_team_name, dictionary)
    const inputHash = mappingInputHash(
      game,
      home?.soccerway_team_id ?? null,
      away?.soccerway_team_id ?? null
    )
    const key = `${game.id}|${inputHash}`

    if (settled.has(key)) {
      summary.skipped++
      continue
    }

    processed++
    summary.scanned++
    const attempt = (attemptCount.get(key) ?? 0) + 1

    const base = {
      game_id: game.id,
      input_hash: inputHash,
      predicate_version: PREDICATE_VERSION,
      attempt,
      run_id: runId,
      home_team_id: home?.soccerway_team_id ?? null,
      away_team_id: away?.soccerway_team_id ?? null,
    }

    if (!home || !away) {
      const unresolved = [
        ...(home ? [] : [game.home_team_name.trim()]),
        ...(away ? [] : [game.away_team_name.trim()]),
      ]
      const { error } = await supabase.from("match_mapping_attempts").insert({
        ...base,
        outcome: "team_unresolved",
        status: "ok",
        unresolved_names: unresolved,
      })
      if (error) summary.errors.push(`insert 실패(game=${game.id}): ${error.message}`)
      else summary.teamUnresolved++
      continue
    }

    const url = buildMatchUrl(
      { slug: home.slug, soccerwayTeamId: home.soccerway_team_id },
      { slug: away.slug, soccerwayTeamId: away.soccerway_team_id }
    )

    const started = Date.now()
    let fetched: MatchPageFetchResult | null = pageCache.get(url) ?? null
    let fetchErrorMessage: string | null = null
    if (!fetched) {
      try {
        fetched = await fetcher(url)
        pageCache.set(url, fetched)
        if (paceMs > 0) await new Promise((r) => setTimeout(r, paceMs))
      } catch (e) {
        fetchErrorMessage = e instanceof Error ? e.message : String(e)
      }
    }
    const latency = Date.now() - started

    let row: Record<string, unknown>

    if (fetchErrorMessage !== null || fetched === null) {
      row = {
        ...base,
        outcome: "fetch_error",
        status: attempt >= MAX_FETCH_ATTEMPTS ? "dead_letter" : "retry_wait",
        candidate_url: url,
        error: fetchErrorMessage ?? "fetch 결과 없음",
        latency_ms: latency,
      }
      summary.fetchError++
    } else if (fetched.httpStatus === 404) {
      row = {
        ...base,
        outcome: "no_candidate",
        status: "ok",
        candidate_url: url,
        latency_ms: latency,
      }
      summary.noCandidate++
    } else if (fetched.httpStatus !== 200 || !fetched.html) {
      row = {
        ...base,
        outcome: "fetch_error",
        status: attempt >= MAX_FETCH_ATTEMPTS ? "dead_letter" : "retry_wait",
        candidate_url: url,
        error: `HTTP ${fetched.httpStatus}`,
        latency_ms: latency,
      }
      summary.fetchError++
    } else {
      const page = parseMatchPage(fetched.html)
      if (!page) {
        // 200 인데 메타 파싱 실패 = 마크업 변경 또는 일시 응답 이상 — 실행 실패로 분류
        row = {
          ...base,
          outcome: "fetch_error",
          status: attempt >= MAX_FETCH_ATTEMPTS ? "dead_letter" : "retry_wait",
          candidate_url: fetched.finalUrl,
          error: "parse_failed: title/description 메타 없음",
          latency_ms: latency,
        }
        summary.fetchError++
      } else {
        const judgement = judgeMatchPage(game, home, away, page)
        row = {
          ...base,
          outcome: judgement.outcome,
          status: "ok",
          candidate_url: page.canonicalUrl ?? fetched.finalUrl,
          page_home_en: judgement.matched?.homeEn ?? null,
          page_away_en: judgement.matched?.awayEn ?? null,
          page_date: judgement.matched?.dateIso ?? null,
          page_tournament: page.tournament,
          home_away_flip: judgement.homeAwayFlip,
          latency_ms: latency,
        }
        if (judgement.outcome === "proposed") {
          summary.proposed++
          if (judgement.homeAwayFlip === true) summary.flips++
        } else if (judgement.outcome === "ambiguous") summary.ambiguous++
        else summary.noCandidate++
      }
    }

    const { error } = await supabase.from("match_mapping_attempts").insert(row)
    if (error) summary.errors.push(`insert 실패(game=${game.id}): ${error.message}`)
  }

  return summary
}

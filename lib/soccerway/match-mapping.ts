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
import {
  leagueCountryHint,
  proposeSearchQueries,
  searchSoccerwayTeams,
  type SoccerwayTeamCandidate,
} from "./team-search"

/**
 * 술어/파서 버전 — 규칙이 바뀌면 올린다. 버전이 오르면 전 경기 재평가가 열린다.
 * .2 (2026-08-07): 2연전 목록 템플릿(B) 지원 — .1 은 단일 템플릿만 알아서
 * UCL 예선 쌍 페이지가 전부 parse_failed(dead_letter)로 남았다 (원장 실측).
 */
const PREDICATE_VERSION = "match-mapping@2026-08-07.2"

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

interface BetmanGameRow {
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

interface MatchJudgement {
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

interface ShadowRunSummary {
  scanned: number
  skipped: number
  proposed: number
  ambiguous: number
  noCandidate: number
  teamUnresolved: number
  fetchError: number
  flips: number
  /** 검색+경기 대조로 자동 발견·등재된 팀 수 (2026-08-07 discovery) */
  discoveredTeams: number
  errors: string[]
}

type Fetcher = (url: string) => Promise<MatchPageFetchResult>
type TeamSearcher = (query: string) => Promise<SoccerwayTeamCandidate[]>
type QueryProposer = (nameKr: string, leagueCode: string | null) => Promise<string[]>

/**
 * 사전에 없는 팀의 자동 발견 (2026-08-07 운영자: "매핑하는 에이전트 구현").
 *
 * 흐름: 한글 팀명 → LLM 로마자 쿼리 후보 → Livesport 검색(남자 축구 팀, 국가 힌트
 * 필터) → 후보 팀 해시들 → **상대팀과 짝지어 경기 페이지를 실제로 열어 날짜 대조**
 * → 정확히 1개 조합만 성립할 때 그 팀을 사전에 등재(source=search_verified).
 *
 * 검증이 등재를 결정한다 — 검색 1위라서가 아니라, "그 팀으로 조립한 경기 페이지가
 * betman 킥오프와 일치해서" 등재된다. 0개·2개 이상 성립이면 등재 없이
 * team_unresolved 유지 (fail-closed).
 */
export async function discoverTeamsForGame(input: {
  game: BetmanGameRow
  home: TeamDictionaryRow | null
  away: TeamDictionaryRow | null
  searcher: TeamSearcher
  proposer: QueryProposer
  fetcher: Fetcher
  pageCache: Map<string, MatchPageFetchResult>
  candidateMemo: Map<string, SoccerwayTeamCandidate[]>
  paceMs: number
}): Promise<{
  home: TeamDictionaryRow
  away: TeamDictionaryRow
  page: SoccerwayMatchPageInfo
  finalUrl: string
  judgement: MatchJudgement
  discovered: TeamDictionaryRow[]
} | null> {
  const { game, fetcher, pageCache, paceMs } = input
  const country = leagueCountryHint(game.league_code)

  const candidatesFor = async (nameKr: string): Promise<SoccerwayTeamCandidate[]> => {
    const key = nameKr.trim()
    const memoized = input.candidateMemo.get(key)
    if (memoized) return memoized
    const queries = await input.proposer(key, game.league_code)
    const found = new Map<string, SoccerwayTeamCandidate>()
    for (const q of queries.slice(0, 2)) {
      for (const c of await input.searcher(q)) {
        if (country && c.country && c.country !== country) continue
        if (!found.has(c.soccerwayTeamId)) found.set(c.soccerwayTeamId, c)
      }
      if (found.size >= 3) break
    }
    const list = [...found.values()].slice(0, 3)
    input.candidateMemo.set(key, list)
    return list
  }

  const asRow = (c: SoccerwayTeamCandidate, nameKr: string): TeamDictionaryRow => ({
    soccerway_team_id: c.soccerwayTeamId,
    slug: c.slug,
    name_en: c.nameEn,
    name_kr: nameKr.trim(),
    aliases_kr: [],
    status: "proposed",
  })

  const homeCands = input.home
    ? [input.home]
    : (await candidatesFor(game.home_team_name)).map((c) => asRow(c, game.home_team_name))
  if (homeCands.length === 0) return null
  const awayCands = input.away
    ? [input.away]
    : (await candidatesFor(game.away_team_name)).map((c) => asRow(c, game.away_team_name))
  if (awayCands.length === 0) return null

  const winners: {
    home: TeamDictionaryRow
    away: TeamDictionaryRow
    page: SoccerwayMatchPageInfo
    finalUrl: string
    judgement: MatchJudgement
  }[] = []
  let tried = 0

  for (const h of homeCands) {
    for (const a of awayCands) {
      if (tried >= 4 || winners.length > 1) break
      if (h.soccerway_team_id === a.soccerway_team_id) continue
      tried++

      const url = buildMatchUrl(
        { slug: h.slug, soccerwayTeamId: h.soccerway_team_id },
        { slug: a.slug, soccerwayTeamId: a.soccerway_team_id }
      )
      let fetched = pageCache.get(url) ?? null
      if (!fetched) {
        try {
          fetched = await fetcher(url)
          pageCache.set(url, fetched)
          if (paceMs > 0) await new Promise((r) => setTimeout(r, paceMs))
        } catch {
          continue // 발견 단계의 fetch 실패는 그 조합만 건너뛴다
        }
      }
      if (fetched.httpStatus !== 200 || !fetched.html) continue
      const page = parseMatchPage(fetched.html)
      if (!page) continue
      const judgement = judgeMatchPage(game, h, a, page)
      if (judgement.outcome === "proposed") {
        winners.push({ home: h, away: a, page, finalUrl: fetched.finalUrl, judgement })
      }
    }
  }

  if (winners.length !== 1) return null

  const w = winners[0]
  const discovered: TeamDictionaryRow[] = []
  if (!input.home) discovered.push(w.home)
  if (!input.away) discovered.push(w.away)
  return { ...w, discovered }
}

/**
 * shadow 1회 실행: 다가오는 betman 축구 경기를 사전으로 해석해 soccerway 대조를
 * 시도 원장에 기록한다. betman_games 는 절대 쓰지 않는다.
 */
export async function runMatchMappingShadow(
  supabase: SupabaseClient,
  options: {
    limit?: number
    runId?: string
    fetcher?: Fetcher
    paceMs?: number
    /** 미등재 팀 자동 발견(검색+경기 대조) 시도 횟수 상한 — 0 이면 발견 비활성 */
    discoverLimit?: number
    searcher?: TeamSearcher
    proposer?: QueryProposer
    /** 과거 경기 스캔 범위(시간) — 기본 24h. 백필·리허설 시 넓혀 쓴다 */
    lookbackHours?: number
  } = {}
): Promise<ShadowRunSummary> {
  const limit = options.limit ?? 15
  const runId = options.runId ?? `shadow-${Date.now()}`
  const fetcher = options.fetcher ?? fetchMatchPage
  const paceMs = options.paceMs ?? 400
  const searcher = options.searcher ?? searchSoccerwayTeams
  const proposer = options.proposer ?? proposeSearchQueries
  let discoverBudget = options.discoverLimit ?? 6

  const summary: ShadowRunSummary = {
    scanned: 0,
    skipped: 0,
    proposed: 0,
    ambiguous: 0,
    noCandidate: 0,
    teamUnresolved: 0,
    fetchError: 0,
    flips: 0,
    discoveredTeams: 0,
    errors: [],
  }

  // 국가대표(축월드컵 등)는 클럽 사전 범위 밖 — 클럽 축구만 본다.
  const { data: games, error: gamesError } = await supabase
    .from("betman_games")
    .select("id, home_team_name, away_team_name, match_time, league_code")
    .eq("sport", "축구")
    .gte(
      "match_time",
      new Date(Date.now() - (options.lookbackHours ?? 24) * 3600_000).toISOString()
    )
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
    .select("game_id, input_hash, predicate_version, status, attempt, outcome")
    .in("game_id", gameIds)
    .eq("predicate_version", PREDICATE_VERSION)

  if (priorError) {
    summary.errors.push(`attempts 조회 실패: ${priorError.message}`)
    return summary
  }

  // (game, input_hash) 별 확정(ok/dead_letter) 여부와 시도 횟수.
  // team_unresolved 확정은 따로 둔다 — 발견(discovery)이 켜져 있으면 재시도 대상이다.
  // (해시는 사전이 바뀌어야 변하는데 사전을 바꾸는 것이 발견이라, unresolved 를
  //  무조건 skip 하면 데드락 — 2026-08-07 스윕 실측: 이전 기록 4경기가 영영 잠김)
  const settled = new Set<string>()
  const settledUnresolved = new Set<string>()
  const attemptCount = new Map<string, number>()
  for (const row of priorRows || []) {
    const key = `${row.game_id}|${row.input_hash}`
    if (row.status === "ok" || row.status === "dead_letter") {
      if (row.outcome === "team_unresolved") settledUnresolved.add(key)
      else settled.add(key)
    }
    attemptCount.set(key, Math.max(attemptCount.get(key) ?? 0, row.attempt))
  }

  let processed = 0
  // 같은 경기의 마켓별 행(승부/핸디캡/언더오버…)이 같은 URL 을 반복 fetch 하지 않도록 런 내 메모
  const pageCache = new Map<string, MatchPageFetchResult>()
  // 발견 단계 메모 — 같은 팀명은 런 내 1회만 검색 (LLM·검색 API 보호)
  const candidateMemo = new Map<string, SoccerwayTeamCandidate[]>()
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
    // unresolved 확정 행: 발견 예산이 남아 있을 때만 재도전, 아니면 skip
    const isUnresolvedRetry = settledUnresolved.has(key)
    if (isUnresolvedRetry && (discoverBudget <= 0 || (home && away))) {
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
      // ── 자동 발견: 검색 → 후보 → 경기 페이지 날짜 대조 → 1개 조합만 성립 시 등재 ──
      let found: Awaited<ReturnType<typeof discoverTeamsForGame>> = null
      if (discoverBudget > 0) {
        discoverBudget--
        try {
          found = await discoverTeamsForGame({
            game,
            home,
            away,
            searcher,
            proposer,
            fetcher,
            pageCache,
            candidateMemo,
            paceMs,
          })
        } catch (e) {
          summary.errors.push(
            `discovery 실패(game=${game.id}): ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      if (found) {
        // 발견된 팀을 사전에 등재 (이미 있으면 betman 표기를 별칭으로 흡수)
        let registerFailed = false
        for (const t of found.discovered) {
          const { data: existing } = await supabase
            .from("team_dictionary")
            .select("soccerway_team_id, name_kr, aliases_kr")
            .eq("soccerway_team_id", t.soccerway_team_id)
            .maybeSingle()
          if (existing) {
            const merged = Array.from(
              new Set([...(existing.aliases_kr ?? []), t.name_kr ?? ""].filter(Boolean))
            )
            const { error } = await supabase
              .from("team_dictionary")
              .update({ aliases_kr: merged, updated_at: new Date().toISOString() })
              .eq("soccerway_team_id", t.soccerway_team_id)
            if (error) {
              summary.errors.push(`팀 별칭 흡수 실패(${t.slug}): ${error.message}`)
              registerFailed = true
            }
          } else {
            const { error } = await supabase.from("team_dictionary").insert({
              soccerway_team_id: t.soccerway_team_id,
              slug: t.slug,
              name_en: t.name_en,
              name_kr: t.name_kr,
              aliases_kr: [],
              status: "proposed",
              source: "search_verified",
              note: `경기 대조 검증: ${found.judgement.matched?.dateIso ?? "?"} ${found.finalUrl}`,
            })
            if (error) {
              summary.errors.push(`팀 등재 실패(${t.slug}): ${error.message}`)
              registerFailed = true
            }
          }
          if (!registerFailed) {
            dictionary.push(t) // 같은 런의 뒷 경기들이 바로 해석되도록
            summary.discoveredTeams++
          }
        }

        if (!registerFailed) {
          // 해석이 완성됐으므로 input_hash 를 확정 해시로 재계산 — 다음 런의 skip 과 일치
          const resolvedHash = mappingInputHash(
            game,
            found.home.soccerway_team_id,
            found.away.soccerway_team_id
          )
          const { error } = await supabase.from("match_mapping_attempts").insert({
            ...base,
            input_hash: resolvedHash,
            home_team_id: found.home.soccerway_team_id,
            away_team_id: found.away.soccerway_team_id,
            outcome: "proposed",
            status: "ok",
            candidate_url: found.page.canonicalUrl ?? found.finalUrl,
            page_home_en: found.judgement.matched?.homeEn ?? null,
            page_away_en: found.judgement.matched?.awayEn ?? null,
            page_date: found.judgement.matched?.dateIso ?? null,
            page_tournament: found.page.tournament,
            home_away_flip: found.judgement.homeAwayFlip,
          })
          if (error) summary.errors.push(`insert 실패(game=${game.id}): ${error.message}`)
          else {
            summary.proposed++
            if (found.judgement.homeAwayFlip === true) summary.flips++
          }
          continue
        }
      }

      if (isUnresolvedRetry) {
        // 재도전 실패 — unresolved 확정 행이 이미 있으므로(부분 유니크) 새 행은 안 쓴다
        summary.teamUnresolved++
        continue
      }

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

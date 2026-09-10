import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
// 후보판 계산은 순수 모듈이 소유한다 — env 없이 시험이 그대로 부른다 (2026-08-31)
import {
  buildMotmOptions,
  mergeMotmOptions,
  pickRichestLineup,
  type MotmOption,
} from "@/lib/motm/options"
import { lfaDetailRow, pickFtScore, type LfaDetailRow } from "@/lib/motm/ft-evidence"
import { matchKeyOf } from "@/lib/match/match-key"
import { listSupplementalFixtures, supplementalSummary } from "@/lib/match/supplemental-fixtures"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { getMatchIdentity } from "@/lib/match/sibling-ids"
import type { LineupResponse } from "@/lib/match/lineup-types"

// 기존 import 경로를 지킨다 (매치 페이지·투표 API·카드가 여기서 가져간다)
export { buildMotmOptions, mergeMotmOptions, pickRichestLineup }
export type { MotmOption } from "@/lib/motm/options"

/**
 * MoTM(맨오브더매치) 폴 — polls 인프라 재사용 (2026-08-22 운영자 지시: "출전 선수 전원 풀").
 *
 * ## 저니 (workspace/mockup-motm-journey-20260822.html v2)
 * FT+110분 → 폴 자동 생성(라인업 스냅샷 = 후보) → 피드 FT 행·불판·매치센터에서 투표
 * → 익일 11:00 KST 마감(is_active=false → 기존 투표 API 가 자동 차단) → 결과 영속.
 *
 * ## 생성 잠금 = LFA 경기 번호. 기존 match_key/game_id는 참조로 보존한다.
 *
 * ## 후보 = 출전 선수만
 * 선발 22명 + LFA 타임라인에서 교체 투입(subIn)이 확인된 벤치. 타임라인이 없으면
 * 선발만 — 출전 안 한 벤치를 후보에 올리는 것보다 좁은 게 정직하다.
 */

export interface MotmPollRef {
  pollId: string
  closed: boolean
}

/** FT 판정 관례 — 홈 FT 사건 행과 같은 킥오프+110분 (home-client.tsx ftAt 규칙) */
const FT_AFTER_MS = 110 * 60_000
/** 생성 스캔 창 — 최근 26시간 (피드 FT 행의 24h 창 + 여유) */
const SWEEP_FLOOR_MS = 26 * 3600_000

/** 마감 = FT 다음날 11:00 KST(02:00 UTC) — 일요일 아침 재방문의 보상이 "확정"이 되게 */
export function motmClosesAtUtc(matchTimeIso: string): string {
  const ftMs = new Date(matchTimeIso).getTime() + FT_AFTER_MS
  const k = new Date(ftMs + 9 * 3600_000) // KST 벽시계
  return new Date(
    Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + 1, 2, 0, 0)
  ).toISOString()
}

/** `.in()` 한 번에 넣을 id 수 — 큰 배열은 400 으로 돌아온다 (재발 패턴) */
const IN_CHUNK = 100

/** 형제 gameId 들의 LFA 상세(FT 증거)를 gameId 별로 모아온다 */
async function loadLfaDetails(gameIds: string[]): Promise<Map<string, LfaDetailRow[]>> {
  const out = new Map<string, LfaDetailRow[]>()
  const ids = [...new Set(gameIds)]
  if (ids.length === 0) return out
  const supabase = createServiceRoleClient()
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("match_details_cache")
      .select("game_id, finished, payload")
      .in("game_id", ids.slice(i, i + IN_CHUNK))
    if (error) throw new Error(`motm-details:${error.message}`)
    for (const row of data ?? []) {
      const key = String(row.game_id)
      const list = out.get(key) ?? []
      list.push(
        lfaDetailRow(row as { finished?: unknown; payload?: { homeScore?: unknown } | null })
      )
      out.set(key, list)
    }
  }
  return out
}

export interface MotmSweepResult {
  finalized: number
  created: { matchKey: string; pollId: string; candidates: number; ftSource: "betman" | "lfa" }[]
  skipped: { matchKey: string; reason: string }[]
  /** 후보가 빠져 있던 기존 폴을 되살린 건수 */
  repaired: { pollId: string; added: number }[]
  /**
   * 스윕을 멈추지 않고 넘어간 **우리 쪽** 장애 (LFA 전용 목록·형제 조회 실패 등).
   * 라우트가 이걸 보고 503 을 낸다 — 200 심박이 부분 장애를 가리지 않게 (2026-09-07).
   */
  errors: { scope: string; message: string }[]
}

/**
 * 생성 + 마감 스윕 (cron: /api/cron/motm-sync, 15분 간격).
 * 실패는 경기 단위로 격리 — 한 경기 라인업이 없어도 나머지는 만든다.
 */
export async function sweepMotmPolls(): Promise<MotmSweepResult> {
  const supabase = createServiceRoleClient()
  const nowIso = new Date().toISOString()

  // 1) 마감 — is_active=false 로 내리면 기존 투표 API 가 자동으로 표를 막는다
  const { data: closedRows } = await supabase
    .from("polls")
    .update({ is_active: false })
    .eq("kind", "motm")
    .eq("is_active", true)
    .lt("closes_at", nowIso)
    .select("id")
  const finalized = closedRows?.length ?? 0

  // 1.5) 재활성화 — 마감 전인데 꺼져 있는 폴은 되살린다 (배포 지연 동안 수동으로
  // 내려둔 경우의 self-heal). 강제 조기 마감이 필요하면 closes_at 을 과거로 당길 것.
  await supabase
    .from("polls")
    .update({ is_active: true })
    .eq("kind", "motm")
    .eq("is_active", false)
    .gt("closes_at", nowIso)

  // 2) 생성 후보 — FT(킥오프+110분) 지난 축구 경기, 매치 페이지 화이트리스트 한정
  const now = Date.now()
  const { data: rows } = await supabase
    .from("betman_games")
    .select(
      "id, home_team_name, away_team_name, league_code, match_time, status, home_score, away_score"
    )
    .eq("sport", "축구")
    .in("status", ["in_progress", "completed"])
    .gt("match_time", new Date(now - SWEEP_FLOOR_MS).toISOString())
    .lte("match_time", new Date(now - FT_AFTER_MS).toISOString())
    .neq("home_team_name", "미정")
    .not("home_team_name", "is", null)

  interface Cand {
    matchKey: string
    gameIds: string[]
    homeTeam: string
    awayTeam: string
    leagueCode: string
    matchTime: string
    homeScore: number | null
    awayScore: number | null
    lfaOnly?: boolean
    altKeys?: string[]
  }
  const byKey = new Map<string, Cand>()
  for (const g of rows ?? []) {
    if (!isMatchPageLeague(g.league_code as string | null)) continue
    // ⚠️ 키 생성은 공용 함수를 쓴다 — 불변식 감사관(`motm_poll_missing`)이 같은 함수로
    //    키를 만들어 대조하므로, 여기서 형식이 갈리면 폴을 못 찾아 결번 오탐이 전량 난다
    const key = matchKeyOf({
      homeTeam: String(g.home_team_name),
      awayTeam: String(g.away_team_name),
      matchTime: String(g.match_time),
    })
    const prev = byKey.get(key)
    if (prev) {
      prev.gameIds.push(String(g.id))
      if (prev.homeScore == null && g.home_score != null) {
        prev.homeScore = Number(g.home_score)
        prev.awayScore = g.away_score != null ? Number(g.away_score) : null
      }
      continue
    }
    byKey.set(key, {
      matchKey: key,
      gameIds: [String(g.id)],
      homeTeam: String(g.home_team_name),
      awayTeam: String(g.away_team_name),
      leagueCode: String(g.league_code ?? ""),
      matchTime: String(g.match_time),
      homeScore: g.home_score != null ? Number(g.home_score) : null,
      awayScore: g.away_score != null ? Number(g.away_score) : null,
    })
  }
  // Same poll pipeline for registered LFA fixtures, including matches Betman never sells.
  // Require actual LFA FT evidence; elapsed kickoff time alone never opens voting.
  //
  // ⚠️ LFA 전용 경기 경로의 장애가 베트맨 경기 폴까지 막으면 안 된다 (2026-09-06 01:00~01:30
  //    실사고: lfa_fixtures 테이블이 앱보다 늦게 만들어져 이 조회가 throw → 스윕 전체가 500 →
  //    23:00 킥오프 12경기 MoTM 이 46분 늦었다). 실패는 errors 에 실어 라우트가 503 으로 알린다.
  const errors: MotmSweepResult["errors"] = []
  const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const supplemental = await listSupplementalFixtures(
    new Date(now - SWEEP_FLOOR_MS).toISOString(),
    new Date(now - FT_AFTER_MS + 1).toISOString()
  ).catch((e: unknown) => {
    errors.push({ scope: "lfa_fixtures", message: describe(e) })
    return [] as Awaited<ReturnType<typeof listSupplementalFixtures>>
  })
  for (const row of supplemental) {
    const match = supplementalSummary(row)
    if (!isMatchPageLeague(match.leagueCode) || match.status === "cancelled") continue
    let ids: string[]
    try {
      ids = await getSiblingGameIds(supabase, row.id, { strict: true })
    } catch (e) {
      errors.push({ scope: `lfa_fixtures:${row.id}`, message: describe(e) })
      continue
    }
    // Later Betman markets share the existing LFA poll, not a second name-based poll.
    const altKeys: string[] = []
    for (const [key, c] of byKey) {
      if (c.gameIds.some((id) => ids.includes(id))) {
        altKeys.push(key)
        byKey.delete(key)
      }
    }
    byKey.set(match.matchKey, {
      ...match,
      gameIds: ids,
      lfaOnly: true,
      altKeys,
    })
  }
  /**
   * 연기/취소 잔재 가드 — 스코어가 한 번도 안 찍힌 경기는 FT 로 단정하지 않는다.
   *
   * ⚠️ 증거를 **둘 중 하나**로 받는다: betman 스코어 또는 LFA 상세의 `finished`.
   *    종전엔 betman 하나뿐이라, 돈 주고 사는 피드가 이미 아는 결과를 배치로 올라오는
   *    무료 피드가 따라올 때까지 기다렸다 (실측 최대 7시간 40분 — ft-evidence.ts 참조).
   *    가드 자체는 그대로다 — 시간만으로 FT 를 단정하는 경로는 생기지 않는다.
   */
  const lfaByGameId = await loadLfaDetails([...byKey.values()].flatMap((c) => c.gameIds))
  const cands: (Cand & { ftSource: "betman" | "lfa" })[] = []
  for (const c of byKey.values()) {
    const ft = pickFtScore(
      c.lfaOnly ? { ...c, homeScore: null, awayScore: null } : c,
      c.gameIds.flatMap((id) => lfaByGameId.get(id) ?? [])
    )
    if (!ft) continue
    c.homeScore = ft.home
    c.awayScore = ft.away
    cands.push({ ...c, ftSource: ft.source })
  }

  const created: MotmSweepResult["created"] = []
  const skipped: MotmSweepResult["skipped"] = []
  const repaired: MotmSweepResult["repaired"] = []
  if (cands.length === 0) return { finalized, created, skipped, repaired, errors }

  // 3) 이미 폴이 있는 경기 — 보통은 건너뛰지만, **교체 후보가 통째로 빠진** 폴은
  //    라인업이 뒤늦게 고쳐졌을 수 있으므로 다시 짜 본다 (열려 있는 동안만).
  const [{ data: byKeyPolls, error: keyError }, { data: byIdPolls, error: idError }] =
    await Promise.all([
      supabase
        .from("polls")
        .select("id, game_id, match_key, options, is_active")
        .eq("kind", "motm")
        .in(
          "match_key",
          cands.flatMap((c) => [c.matchKey, ...(c.altKeys ?? [])])
        ),
      supabase
        .from("polls")
        .select("id, game_id, match_key, options, is_active")
        .eq("kind", "motm")
        .in(
          "game_id",
          cands.flatMap((c) => c.gameIds)
        ),
    ])
  if (keyError || idError) {
    errors.push({ scope: "existing_polls", message: (keyError ?? idError)!.message })
    return { finalized, created, skipped, repaired, errors }
  }
  const existing = [
    ...new Map([...(byKeyPolls ?? []), ...(byIdPolls ?? [])].map((p) => [p.id, p])).values(),
  ]
  interface Prior {
    id: string
    options: MotmOption[]
    active: boolean
  }
  const priorByKey = new Map<string, Prior>()
  for (const c of cands) {
    const e =
      existing.find((p) => p.match_key === c.matchKey) ??
      existing.find((p) => c.gameIds.includes(p.game_id) || c.altKeys?.includes(p.match_key))
    if (!e) continue
    priorByKey.set(c.matchKey, {
      id: String(e.id),
      options: (e.options as MotmOption[] | null) ?? [],
      active: e.is_active === true,
    })
  }

  for (const c of cands) {
    const prior = priorByKey.get(c.matchKey)
    if (prior && !prior.active) continue
    try {
      // Existing polls consume stored material only. Candidate repair must not buy another feed.
      let fetched: LineupResponse | null
      if (prior) {
        const identity = await getMatchIdentity(supabase, c.gameIds[0], { strict: true })
        c.gameIds = identity.gameIds
        const { data, error } = await supabase
          .from("match_lineups")
          .select("payload")
          .in("game_id", c.gameIds)
        if (error) throw new Error(`motm-lineup:${error.message}`)
        fetched = pickRichestLineup(
          (data ?? [])
            .map((r) => r.payload as LineupResponse)
            .filter(
              (p) =>
                p?.status === "ready" &&
                p.projected === false &&
                p.source === "lfa" &&
                !!p.matchId &&
                p.matchId === identity.lfaMatchId
            )
        )
      } else {
        fetched = await getMatchLineup(c.gameIds[0])
      }
      const lineup = fetched?.status === "ready" ? fetched : null
      if (!lineup || lineup.projected !== false || lineup.source !== "lfa" || !lineup.matchId) {
        skipped.push({ matchKey: c.matchKey, reason: "no_lineup" })
        continue
      }

      // 교체 투입 판정 재료 — LFA 타임라인 (불판·매치센터와 같은 캐시)
      let lfa: Awaited<ReturnType<typeof getLfaMatchInfo>> = null
      if (prior) {
        const { data, error } = await supabase
          .from("match_details_cache")
          .select("payload")
          .in("game_id", c.gameIds)
          .eq("lfa_match_id", lineup.matchId)
          .order("finished", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
        if (error) throw new Error(`motm-detail:${error.message}`)
        lfa = data?.[0]?.payload ?? null
      } else {
        lfa = await getLfaMatchInfo({
          gameId: c.gameIds[0],
          homeTeam: c.homeTeam,
          awayTeam: c.awayTeam,
          matchTime: c.matchTime,
          leagueCode: c.leagueCode,
        })
      }
      const enriched = lfa?.timeline.length
        ? enrichLineupWithTimeline(lineup, lfa.timeline)
        : lineup

      const options = buildMotmOptions(enriched)
      if (!options) {
        skipped.push({ matchKey: c.matchKey, reason: "thin_lineup" })
        continue
      }

      // 3-b) DB의 현재 후보판에 추가만 한다. 조회 후 투표/다른 보강이 들어와도 키가 유지된다.
      if (prior) {
        const { data: appended, error: upErr } = await supabase.rpc("append_motm_options", {
          p_poll_id: prior.id,
          p_options: options,
        })
        if (upErr || !appended) throw new Error(`motm-append:${upErr?.message ?? "no-result"}`)
        if (!appended.added) {
          skipped.push({ matchKey: c.matchKey, reason: "repair_noop" })
          continue
        }
        repaired.push({ pollId: prior.id, added: appended.added })
        continue
      }

      const score =
        c.homeScore != null && c.awayScore != null ? ` ${c.homeScore}–${c.awayScore} ` : " vs "
      const { data: poll, error } = await supabase.rpc("ensure_lfa_motm_poll", {
        p_match_id: lineup.matchId,
        p_game_id: c.gameIds[0],
        p_match_key: c.matchKey,
        p_question: `오늘의 MoTM은? · ${c.homeTeam}${score}${c.awayTeam}`,
        p_options: options,
        p_closes_at: motmClosesAtUtc(c.matchTime),
      })
      if (error || !poll?.id) throw new Error(`motm-create:${error?.message ?? "no-result"}`)
      if (!poll.created) {
        skipped.push({ matchKey: c.matchKey, reason: "exists" })
        continue
      }
      created.push({
        matchKey: c.matchKey,
        pollId: String(poll.id),
        candidates: options.length,
        ftSource: c.ftSource,
      })
    } catch (e) {
      errors.push({ scope: c.matchKey, message: describe(e) })
    }
  }

  return { finalized, created, skipped, repaired, errors }
}

/** Both legacy and LFA URLs resolve the same stored poll references. Read failures aren't cached misses. */
export function getMotmPollForGame(gameId: string): Promise<MotmPollRef | null> {
  return unstable_cache(
    async (id: string) => {
      const db = createServiceRoleClient()
      const identity = await getMatchIdentity(db, id, { strict: true })
      const [byId, byKey] = await Promise.all([
        db
          .from("polls")
          .select("id,is_active,closes_at,created_at")
          .eq("kind", "motm")
          .in("game_id", identity.gameIds),
        identity.pollKeys.length
          ? db
              .from("polls")
              .select("id,is_active,closes_at,created_at")
              .eq("kind", "motm")
              .in("match_key", identity.pollKeys)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (byId.error || byKey.error)
        throw new Error(`motm-reference:${(byId.error ?? byKey.error)!.message}`)
      const rows = [
        ...new Map([...(byId.data ?? []), ...(byKey.data ?? [])].map((r) => [r.id, r])).values(),
      ].sort(
        (a, b) =>
          String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)
      )
      return rows[0] ? refFromRow(rows[0]) : null
    },
    ["motm-poll-for-game-v1"],
    { revalidate: 30 }
  )(gameId)
}

function refFromRow(row: {
  id: string
  is_active: boolean
  closes_at: string | null
}): MotmPollRef {
  const nowIso = new Date().toISOString()
  return {
    pollId: String(row.id),
    closed: !row.is_active || (row.closes_at != null && row.closes_at < nowIso),
  }
}

/**
 * 매치센터용 — 단일 경기 폴 참조. 30초 캐시(매치 요약과 동일 리듬).
 * `altKey` = LFA 전용 등록 뒤 베트맨이 연결된 경기의 베트맨 키 (2026-09-07). 등록 전에 그 키로
 * 만들어진 폴을 잃지 않는다. 둘 다 있으면 대표 키(matchKey)의 폴이 이긴다.
 */
export function getMotmPollByMatchKey(
  matchKey: string,
  altKey?: string | null
): Promise<MotmPollRef | null> {
  const keys = altKey && altKey !== matchKey ? [matchKey, altKey] : [matchKey]
  return unstable_cache(
    async (list: string[]) => {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from("polls")
        .select("id, is_active, closes_at, match_key")
        .eq("kind", "motm")
        .in("match_key", list)
      const rows = data ?? []
      const row = rows.find((r) => r.match_key === list[0]) ?? rows[0]
      return row ? refFromRow(row) : null
    },
    ["motm-poll-by-match-v2"],
    { revalidate: 30 }
  )(keys)
}

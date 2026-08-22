import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isMatchPageLeague } from "@/lib/match/leagues"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
import type { LineupResponse } from "@/lib/soccerway/lineup-lookup"

/**
 * MoTM(맨오브더매치) 폴 — polls 인프라 재사용 (2026-08-22 운영자 지시: "출전 선수 전원 풀").
 *
 * ## 저니 (workspace/mockup-motm-journey-20260822.html v2)
 * FT+110분 → 폴 자동 생성(라인업 스냅샷 = 후보) → 피드 FT 행·불판·매치센터에서 투표
 * → 익일 11:00 KST 마감(is_active=false → 기존 투표 API 가 자동 차단) → 결과 영속.
 *
 * ## 경기 키 = match_key (betman matchKey)
 * betman 은 같은 경기를 마켓별 다중 행으로 갖는다(소수핸디캡/언더오버…). game_id 를
 * 키로 쓰면 같은 경기에 폴이 두 개 생긴다 — match_key partial unique 인덱스가 정본.
 *
 * ## 후보 = 출전 선수만
 * 선발 22명 + LFA 타임라인에서 교체 투입(subIn)이 확인된 벤치. 타임라인이 없으면
 * 선발만 — 출전 안 한 벤치를 후보에 올리는 것보다 좁은 게 정직하다.
 */

export interface MotmOption {
  key: string
  label: string
  number: number | null
  team: "home" | "away"
  team_label: string
  group: "starter" | "sub"
}

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

interface LineupPlayerLike {
  label: string
  number: number | null
  roman?: string | null
  subIn?: string | null
}

function optionKeyFor(p: LineupPlayerLike, team: "home" | "away", used: Set<string>): string {
  const base =
    (p.roman ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || (p.number != null ? `n${p.number}` : "p")
  let key = `${team[0]}-${base}`
  let i = 2
  while (used.has(key)) key = `${team[0]}-${base}-${i++}`
  used.add(key)
  return key
}

/**
 * 라인업(타임라인 보강 후) → 후보 옵션. 선발 전원 + subIn 확인된 벤치.
 * 옵션 shape 는 polls.options 의 {key,label} 계약을 지키면서 표시용 필드만 더한다
 * (투표 API 는 key 만 본다 — app/api/polls/[id]/vote 의 화이트리스트 검증 그대로 통과).
 */
export function buildMotmOptions(lineup: LineupResponse): MotmOption[] | null {
  if (lineup.status !== "ready") return null
  const used = new Set<string>()
  const out: MotmOption[] = []
  for (const team of ["home", "away"] as const) {
    const side = lineup[team]
    for (const p of side.starters as LineupPlayerLike[]) {
      out.push({
        key: optionKeyFor(p, team, used),
        label: p.label,
        number: p.number ?? null,
        team,
        team_label: side.teamLabel,
        group: "starter",
      })
    }
    for (const p of side.bench as LineupPlayerLike[]) {
      if (!p.subIn) continue // 교체 투입 확인된 선수만 — 미출전 벤치는 후보가 아니다
      out.push({
        key: optionKeyFor(p, team, used),
        label: p.label,
        number: p.number ?? null,
        team,
        team_label: side.teamLabel,
        group: "sub",
      })
    }
  }
  // 양 팀 선발이 다 안 실린 반쪽 라인업이면 폴을 만들지 않는다 (빈 후보판 방지)
  return out.length >= 18 ? out : null
}

export interface MotmSweepResult {
  finalized: number
  created: { matchKey: string; pollId: string; candidates: number }[]
  skipped: { matchKey: string; reason: string }[]
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
  }
  const byKey = new Map<string, Cand>()
  for (const g of rows ?? []) {
    if (!isMatchPageLeague(g.league_code as string | null)) continue
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
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
  // 연기/취소 잔재 가드 — 스코어가 한 번도 안 찍힌 경기는 FT 로 단정하지 않는다
  const cands = [...byKey.values()].filter((c) => c.homeScore != null)

  const created: MotmSweepResult["created"] = []
  const skipped: MotmSweepResult["skipped"] = []
  if (cands.length === 0) return { finalized, created, skipped }

  // 3) 이미 폴이 있는 경기는 제외
  const { data: existing } = await supabase
    .from("polls")
    .select("match_key")
    .eq("kind", "motm")
    .in(
      "match_key",
      cands.map((c) => c.matchKey)
    )
  const has = new Set((existing ?? []).map((e) => String(e.match_key)))

  for (const c of cands) {
    if (has.has(c.matchKey)) continue
    try {
      // 라인업 — 저장분 우선(형제 행 전체에서), 없으면 단일 진입점(getMatchLineup:
      // 저장 → soccerway → LFA 폴백, 확보 시 저장까지)으로 한 번 시도
      let lineup: LineupResponse | null = null
      const { data: stored } = await supabase
        .from("match_lineups")
        .select("payload")
        .in("game_id", c.gameIds)
      for (const s of stored ?? []) {
        const p = s.payload as LineupResponse | null
        if (p && p.status === "ready") {
          lineup = p
          break
        }
      }
      if (!lineup) {
        const fetched = await getMatchLineup(c.gameIds[0]).catch(() => null)
        if (fetched && fetched.status === "ready") lineup = fetched
      }
      if (!lineup) {
        skipped.push({ matchKey: c.matchKey, reason: "no_lineup" })
        continue
      }

      // 교체 투입 판정 재료 — LFA 타임라인 (불판·매치센터와 같은 캐시)
      const lfa = await getLfaMatchInfo({
        gameId: c.gameIds[0],
        homeTeam: c.homeTeam,
        awayTeam: c.awayTeam,
        matchTime: c.matchTime,
        leagueCode: c.leagueCode,
      }).catch(() => null)
      const enriched = lfa?.timeline.length
        ? enrichLineupWithTimeline(lineup, lfa.timeline)
        : lineup

      const options = buildMotmOptions(enriched)
      if (!options) {
        skipped.push({ matchKey: c.matchKey, reason: "thin_lineup" })
        continue
      }

      const score =
        c.homeScore != null && c.awayScore != null ? ` ${c.homeScore}–${c.awayScore} ` : " vs "
      const { data: poll, error } = await supabase
        .from("polls")
        .insert({
          question: `오늘의 MoTM은? · ${c.homeTeam}${score}${c.awayTeam}`,
          options,
          is_active: true,
          allow_reason: false,
          created_by: "system_motm",
          kind: "motm",
          match_key: c.matchKey,
          game_id: c.gameIds[0],
          closes_at: motmClosesAtUtc(c.matchTime),
        })
        .select("id")
        .single()
      if (error) {
        // unique(match_key) 경합 = 다른 인스턴스가 먼저 만든 것 — 실패 아님
        skipped.push({ matchKey: c.matchKey, reason: `insert:${error.code ?? "err"}` })
        continue
      }
      created.push({ matchKey: c.matchKey, pollId: String(poll.id), candidates: options.length })
    } catch (e) {
      skipped.push({ matchKey: c.matchKey, reason: e instanceof Error ? e.message : "unknown" })
    }
  }

  return { finalized, created, skipped }
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

/** 홈 피드용 — FT 행에 실을 matchKey → 폴 참조 맵. 60초 Data Cache (page revalidate 는 죽어있음) */
export function getMotmPollMapForFeed(matchKeys: string[]): Promise<Record<string, MotmPollRef>> {
  if (matchKeys.length === 0) return Promise.resolve({})
  return unstable_cache(
    async (keys: string[]) => {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from("polls")
        .select("id, match_key, is_active, closes_at")
        .eq("kind", "motm")
        .in("match_key", keys)
      const map: Record<string, MotmPollRef> = {}
      for (const row of data ?? []) {
        if (row.match_key) map[String(row.match_key)] = refFromRow(row)
      }
      return map
    },
    ["motm-poll-map"],
    { revalidate: 60 }
  )(matchKeys)
}

/** 매치센터·불판 위젯용 — 단일 경기 폴 참조. 30초 캐시(매치 요약과 동일 리듬) */
export function getMotmPollByMatchKey(matchKey: string): Promise<MotmPollRef | null> {
  return unstable_cache(
    async (key: string) => {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from("polls")
        .select("id, is_active, closes_at")
        .eq("kind", "motm")
        .eq("match_key", key)
        .maybeSingle()
      return data ? refFromRow(data) : null
    },
    ["motm-poll-by-match"],
    { revalidate: 30 }
  )(matchKey)
}

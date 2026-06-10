/**
 * betman.co.kr 경기 결과 조회 + DB 반영
 *
 * winrst/inqWinrstDetlBody API에서 각 회차 결과 가져와 betman_games에 반영.
 * GAME_RESULT 매핑 실패 시 점수 기반으로 결과 추론 (deriveResultFromScore).
 */

import type { createServiceRoleClient } from "@/lib/supabase/server"
import { BETMAN_BASE, BROWSER_HEADERS, GM_ID, fetchWithRetry } from "./http-client"
import { deriveResultFromScore, mapGameResult, parseScore } from "./result-mapper"

const RESULT_HANDI_MAP: Record<number, string> = {
  0: "일반",
  2: "핸디캡",
  5: "SUM",
  6: "S핸디캡",
  7: "S언더오버",
  9: "언더오버",
  14: "일반",
}

interface ResultItem {
  GAME_RESULT: string
  GM_SEQ: number
  MCH_SCORE: string
  HANDI_VAL: number
  HOME_TEAM: string
  AWAY_TEAM: string
  FIX_MCH_DTM?: string
}

function buildMatchKey(item: Pick<ResultItem, "HOME_TEAM" | "AWAY_TEAM" | "FIX_MCH_DTM">): string {
  const base = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}`
  return item.FIX_MCH_DTM ? `${base}|${item.FIX_MCH_DTM}` : base
}

async function fetchResultData(gmTs: string): Promise<ResultItem[] | null> {
  try {
    // 세션 확보용 사전 호출 (실패 무시)
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "follow",
    }).catch(() => {})

    const resp = await fetchWithRetry(`${BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        _sbmInfo: { _sbmInfo: { debugMode: "false" } },
      }),
    })

    const data = await resp.json()
    const items = data?.detlBody
    if (!Array.isArray(items) || items.length === 0) return null
    return items as ResultItem[]
  } catch {
    return null
  }
}

/**
 * 특정 gmTs 회차의 결과를 가져와 betman_games 업데이트.
 * GAME_RESULT 매핑 실패 + 점수 있으면 게임 조건(handicap/over_under_line)으로 결과 추론.
 */
export async function fetchAndApplyResults(
  supabase: ReturnType<typeof createServiceRoleClient>,
  gmTs: string
): Promise<{ updated: number; cancelled: number; errors: string[] }> {
  const resultData = await fetchResultData(gmTs)
  if (!resultData) return { updated: 0, cancelled: 0, errors: [] }

  const { data: round } = await supabase
    .from("betman_rounds")
    .select("id")
    .eq("gm_ts", gmTs)
    .maybeSingle()

  if (!round) return { updated: 0, cancelled: 0, errors: [`no round for gmTs=${gmTs}`] }

  // 경기별 실제 점수 맵 (핸디캡/언더오버 추론에 재사용)
  const actualScoreMap = new Map<string, { home: number; away: number }>()
  for (const item of resultData) {
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    if (gameType === "일반") {
      const score = parseScore(item.MCH_SCORE)
      if (score) {
        actualScoreMap.set(buildMatchKey(item), score)
      }
    }
  }

  // 게임별 handicap/over_under_line 조회 (스코어 기반 결과 추론에 필요)
  const { data: gamesWithConditions } = await supabase
    .from("betman_games")
    .select("game_no, game_type, handicap, over_under_line")
    .eq("round_id", round.id)

  const gameConditionMap = new Map((gamesWithConditions || []).map((g) => [g.game_no, g]))

  const results: Array<{
    game_no: number
    home_score: number | null
    away_score: number | null
    result: string
    status: string
  }> = []

  for (const item of resultData) {
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    let mapped = mapGameResult(item.GAME_RESULT, gameType)

    let homeScore: number | null = null
    let awayScore: number | null = null

    if (gameType === "일반") {
      const score = parseScore(item.MCH_SCORE)
      if (score) {
        homeScore = score.home
        awayScore = score.away
      }
    } else {
      const key = buildMatchKey(item)
      const actual = actualScoreMap.get(key)
      if (actual) {
        homeScore = actual.home
        awayScore = actual.away
      } else {
        const fallback = parseScore(item.MCH_SCORE)
        if (fallback) {
          homeScore = fallback.home
          awayScore = fallback.away
        }
      }
    }

    // GAME_RESULT 매핑 실패 시 점수 기반으로 결과 추론
    if (
      mapped.result === "" &&
      mapped.status === "completed" &&
      homeScore !== null &&
      awayScore !== null
    ) {
      const cond = gameConditionMap.get(item.GM_SEQ)
      const derived = deriveResultFromScore(
        homeScore,
        awayScore,
        cond?.game_type || gameType,
        cond?.handicap ?? null,
        cond?.over_under_line ?? null
      )
      if (derived) {
        mapped = { result: derived, status: "completed" }
      }
    }

    if (mapped.result === "" && mapped.status === "completed") continue

    results.push({
      game_no: item.GM_SEQ,
      home_score: homeScore,
      away_score: awayScore,
      result: mapped.result,
      status: mapped.status,
    })
  }

  let updated = 0
  let cancelled = 0
  const errors: string[] = []

  for (const r of results) {
    const updateData: Record<string, unknown> = {
      status: r.status,
      updated_at: new Date().toISOString(),
    }
    if (r.home_score !== null) updateData.home_score = r.home_score
    if (r.away_score !== null) updateData.away_score = r.away_score
    if (r.result) updateData.result = r.result

    const { data: updatedRows, error } = await supabase
      .from("betman_games")
      .update(updateData)
      .eq("round_id", round.id)
      .eq("game_no", r.game_no)
      .in("status", ["scheduled", "in_progress", "completed"])
      .select("id")

    if (error) {
      errors.push(`game_no=${r.game_no}: ${error.message}`)
    } else if (updatedRows && updatedRows.length > 0) {
      if (r.status === "cancelled") cancelled++
      else updated++
    }
  }

  return { updated, cancelled, errors }
}

import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  getLineupForGame,
  storeLineupPayload,
  type LineupResponse,
} from "@/lib/soccerway/lineup-lookup"
import { getLfaLineup, getTeamSquadNames, localizePlayerName } from "@/lib/lfa/lineups"
import { getLfaMatchInfo } from "@/lib/lfa/match"

/**
 * 라인업 단일 진입점 (2026-08-20 운영자: "라인업이 너무 느리고 이름이 다 영어").
 *
 * ## 왜 필요한가 — 결함 두 개가 겹쳐 있었다
 * 1. **얼어붙은 라벨**: 저장 라인업(match_lineups)은 저장 시점의 표기로 굳는다.
 *    데포르티보전은 8/18 14:07 저장 — LFA 로스터 적재·이름 수확 **전**이라 22명 중
 *    한글 2명. 그 뒤 사전이 채워져도 저장분은 영영 영문이었다.
 *    → **읽을 때 재한글화**한다. 사전이 자랄수록 옛 저장분도 같이 좋아지고,
 *    고쳐진 라벨은 저장분에 되써서(heal) 다음 읽기부터는 공짜다.
 * 2. **느림**: soccerway → LFA 폴백 조합이 API 라우트에만 있어 클라이언트 왕복으로만
 *    라인업이 떴다. 이 진입점을 페이지 서버 렌더에서도 불러 선적재한다.
 *
 * 순서: 저장분(재한글화+heal) → soccerway(창 안 경기) → LFA 폴백(끝난 경기도 줌, 저장).
 */

function hasHangul(s: string | null | undefined): boolean {
  return !!s && /[가-힣]/.test(s)
}

interface StoredRow {
  event_id: string
  payload: LineupResponse
}

async function loadStored(gameId: string): Promise<StoredRow | null> {
  try {
    const { data } = await createServiceRoleClient()
      .from("match_lineups")
      .select("event_id, payload")
      .eq("game_id", gameId)
      .maybeSingle()
    const payload = data?.payload as LineupResponse | undefined
    if (!payload || payload.status !== "ready") return null
    return { event_id: String(data!.event_id), payload }
  } catch {
    return null
  }
}

/**
 * ready 페이로드의 영문 라벨을 팀 스쿼드 사전으로 다시 한글화한다.
 * 바뀐 것이 하나라도 있으면 true — 호출부가 저장분을 heal 할 근거.
 */
async function relocalize(payload: LineupResponse): Promise<boolean> {
  if (payload.status !== "ready") return false
  let changed = false
  for (const side of [payload.home, payload.away]) {
    const squad = await getTeamSquadNames(side.teamLabel).catch(() => [])
    if (squad.length === 0) continue
    for (const p of [...side.starters, ...side.bench]) {
      if (!hasHangul(p.label)) {
        // roman(풀네임 슬러그 또는 LFA 축약형)과 현재 라벨을 둘 다 시도한다
        for (const candidate of [p.roman, p.label]) {
          if (!candidate) continue
          const ko = localizePlayerName(candidate, squad)
          if (hasHangul(ko)) {
            p.label = ko
            changed = true
            break
          }
        }
      }
      // 교체 상대 표시명도 같은 규칙으로
      if (p.subPartner && !hasHangul(p.subPartner)) {
        const ko = localizePlayerName(p.subPartner, squad)
        if (hasHangul(ko)) {
          p.subPartner = ko
          changed = true
        }
      }
    }
  }
  return changed
}

/**
 * 매치 페이지·API 공용 라인업 획득.
 * 페이지 서버 렌더가 이걸 불러 initial 로 넘기면 클라이언트 왕복이 사라진다.
 */
export async function getMatchLineup(gameId: string): Promise<LineupResponse> {
  // ① 저장분 — 있으면 재한글화하고, 좋아졌으면 되써 둔다(다음 읽기는 공짜)
  const stored = await loadStored(gameId)
  if (stored) {
    const healed = await relocalize(stored.payload)
    if (healed) {
      await storeLineupPayload(gameId, stored.event_id, stored.payload).catch(() => {})
    }
    return stored.payload
  }

  // ② soccerway (킥오프 창 안의 경기) — ready 면 내부에서 이미 저장까지 한다
  const res = await getLineupForGame(gameId)
  if (res.status === "ready") {
    await relocalize(res)
    return res
  }

  // ③ LFA 폴백 — 끝난 경기의 라인업도 준다 (soccerway 는 +24h 후 침묵)
  const fallback = await lfaLineupFallback(gameId).catch(() => null)
  return fallback ?? res
}

/** soccerway 가 침묵할 때 LFA 로 — 확보하면 저장해 다음부터는 바깥 요청이 없다 */
async function lfaLineupFallback(gameId: string): Promise<LineupResponse | null> {
  const { data: game } = await createServiceRoleClient()
    .from("betman_games")
    .select("id, sport, home_team_name, away_team_name, match_time, league_code")
    .eq("id", gameId)
    .maybeSingle()
  if (!game || game.sport !== "축구" || !game.match_time) return null

  const info = await getLfaMatchInfo({
    gameId: String(game.id),
    homeTeam: String(game.home_team_name),
    awayTeam: String(game.away_team_name),
    matchTime: String(game.match_time),
    leagueCode: String(game.league_code ?? ""),
  })
  if (!info) return null

  const lu = await getLfaLineup(
    info.matchId,
    String(game.home_team_name),
    String(game.away_team_name)
  )
  if (!lu) return null

  const payload: LineupResponse = {
    status: "ready",
    kickoff: new Date(String(game.match_time)).toISOString(),
    home: { teamLabel: String(game.home_team_name), ...lu.home },
    away: { teamLabel: String(game.away_team_name), ...lu.away },
    fetchedAt: new Date().toISOString(),
  }
  await storeLineupPayload(gameId, info.matchId, payload).catch(() => {})
  return payload
}

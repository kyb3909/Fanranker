import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  getLineupForGame,
  storeLineupPayload,
  type LineupResponse,
} from "@/lib/soccerway/lineup-lookup"
import { getLfaLineup, getTeamSquadNames, localizePlayerName } from "@/lib/lfa/lineups"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import { pickLineupRow } from "@/lib/match/pick-sibling-row"

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
    // ⚠️ 형제 행까지 본다 (2026-09-02) — 어느 마켓 행으로 들어와도 같은 라인업을 보고,
    //    없는 행 때문에 바깥에 다시 묻지 않는다. 벤치 많은 ready 행 → 최신 (pick-sibling-row).
    const supabase = createServiceRoleClient()
    const ids = await getSiblingGameIds(supabase, gameId)
    const { data } = await supabase
      .from("match_lineups")
      .select("game_id, event_id, payload, updated_at")
      .in("game_id", ids)
    const best = pickLineupRow(
      (data ?? []) as {
        game_id: string
        event_id: string | null
        payload: LineupResponse | null
        updated_at: string
      }[]
    )
    if (!best?.payload) return null
    return { event_id: String(best.event_id ?? ""), payload: best.payload }
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
    const replaced = await healHalfBakedLineup(gameId, stored.payload)
    if (replaced) return replaced
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
  return fallback?.payload ?? res
}

/** 양 팀 벤치가 모두 비었나 — 반쪽 저장분의 표식 */
function benchIsEmpty(p: LineupResponse): boolean {
  return p.status === "ready" && p.home.bench.length === 0 && p.away.bench.length === 0
}

/**
 * 반쪽 저장분 자가 수리 (2026-08-31 운영자 제보: "교체 선수 기록이 하나도 없다").
 *
 * 저장분은 한 번 적히면 다시 안 읽는다 — 그래서 **킥오프 전에 적힌 예상 라인업**과
 * **벤치를 못 읽던 시절(`substitutes` 오독)의 명단**이 영구히 굳어 있었다 (실측:
 * LFA 로 채워진 164행 전부 벤치 0, 첼시전은 선발 2명까지 틀렸다).
 *
 * 표식은 **양 팀 벤치가 모두 빈 것**이다 — 프로 경기에 벤치 0 은 없다. 킥오프가 지난
 * 경기에 한해 LFA 를 한 번 물어, **확정 라인업이고 벤치가 있으면** 통째로 갈아끼운다.
 * 부분 병합이 아니라 교체인 이유는 선발까지 틀려 있을 수 있기 때문이다.
 *
 * 고쳐지면 벤치가 차므로 다시 타지 않는다 — 스스로 멎는 수리다.
 */
async function healHalfBakedLineup(
  gameId: string,
  stored: LineupResponse
): Promise<LineupResponse | null> {
  if (!benchIsEmpty(stored)) return null
  if (stored.status !== "ready" || new Date(stored.kickoff).getTime() > Date.now()) return null

  const fresh = await lfaLineupFallback(gameId, { store: false }).catch(() => null)
  if (!fresh || fresh.projected || benchIsEmpty(fresh.payload)) return null

  await relocalize(fresh.payload)
  await storeLineupPayload(gameId, fresh.eventId, fresh.payload).catch(() => {})
  return fresh.payload
}

/**
 * soccerway 가 침묵할 때 LFA 로 — 확보하면 저장해 다음부터는 바깥 요청이 없다.
 *
 * ⚠️ **예상 라인업은 저장하지 않는다.** 저장분은 다시 안 읽으므로, 킥오프 전 예상 XI 를
 *    적어두면 확정 XI 로 영영 갱신되지 않는다. 화면에는 보여주되(빈 화면보다 낫다)
 *    굳히지는 않는다 — 확정이 나온 뒤 첫 요청이 적는다.
 */
async function lfaLineupFallback(
  gameId: string,
  opts: { store?: boolean } = {}
): Promise<{ payload: LineupResponse; eventId: string; projected: boolean } | null> {
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
  if (opts.store !== false && !lu.projected) {
    await storeLineupPayload(gameId, info.matchId, payload).catch(() => {})
  }
  return { payload, eventId: info.matchId, projected: lu.projected }
}

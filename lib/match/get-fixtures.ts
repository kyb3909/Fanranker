import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"
import { getLfaFixturesForMatchday } from "@/lib/lfa/fixtures"
import { cachedTeamEn } from "@/lib/lfa/match"
import { normTeam, matchLfaCounterpart } from "@/lib/match/pair-fixtures"
import { isPopularFixture } from "@/lib/match/popular-teams"
import { isLiveState, pickScore } from "@/lib/match/score-precedence"
import { getSiblingGameIds } from "@/lib/match/sibling-ids"
import {
  syncSupplementalFixtures,
  supplementalSummary,
  listSupplementalFixtures,
} from "@/lib/match/supplemental-fixtures"

/**
 * 일정 페이지 데이터 — **매치데이 하루**의 대상 리그 경기 전부 (2026-08-17 개정).
 *
 * ⚠️ 달력일(KST 00:00~24:00)로 자르면 안 된다 — 유럽 경기가 한국 새벽이라 토요일
 *    라운드가 토/일 두 날짜로 찢어진다 (2026-08-17 운영자: "시차 때문에 15/16일,
 *    16/17일 이런 식으로 묶어서 보여주는 게 맞다"). 그래서 경계를 **KST 06:00** 에 둔다:
 *    한 창은 KST 06:00 ~ 다음날 06:00 이고, 그 안에 K리그 낮경기(14:00) → 유럽 저녁
 *    (23:00~) → MLS 새벽(04:00)까지 하루치 축구가 통째로 들어온다.
 *    화면 라벨은 "8월 16-17일" 처럼 두 날짜를 함께 보여준다.
 *
 * 베팅 데일리 윈도우(08:00~08:00, 23:00 flip)와는 여전히 별개다 — 그쪽은 정산 기준이고
 * 여기는 열람 기준이다.
 *
 * 상태·스코어는 마켓별 다중 row 를 경기 단위로 접는다 (get-match.ts 와 같은 규칙:
 * 상태는 completed > in_progress > cancelled > scheduled, 스코어는 값 있는 row 우선).
 */

/** 매치데이 시작 시각 (KST) — 이 시각 이전 경기는 전날 매치데이 소속 */
export const MATCHDAY_START_HOUR_KST = 6

export interface FixtureRow {
  matchKey: string
  /**
   * betman_games.id 또는 lfa_fixtures.id. LFA 전용 등록 실패 시에만 null로 남긴다.
   */
  gameId: string | null
  source?: "lfa"
  lfaMatchId?: string
  betmanGameId?: string | null
  homeTeam: string
  awayTeam: string
  /** LFA 행의 영문 원명 — 짝짓기의 영문 대조용 (lib/match/pair-fixtures.ts TeamSided 참조) */
  homeTeamEn?: string
  awayTeamEn?: string
  leagueCode: string
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
  /** 종료 리포트의 근거. betman 정산 상태로는 이 값을 채우지 않는다. */
  lfaFinished?: boolean
  homeScore: number | null
  awayScore: number | null
}

const STATUS_RANK = { completed: 3, in_progress: 2, cancelled: 1, scheduled: 0 } as const

/** "YYYY-MM-DD"(매치데이 시작일) → UTC 범위 [그날 06:00 KST, +24h) */
export function kstDayRange(dateKst: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKst)) return null
  const hh = String(MATCHDAY_START_HOUR_KST).padStart(2, "0")
  const start = new Date(`${dateKst}T${hh}:00:00+09:00`)
  if (Number.isNaN(start.getTime())) return null
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 3600_000).toISOString(),
  }
}

/**
 * 지금이 속한 매치데이의 시작일 "YYYY-MM-DD".
 * KST 06:00 이전이면 아직 전날 매치데이다 — 새벽 4시에 보는 유럽 경기는 "어제 라운드".
 */
export function todayKst(): string {
  const kstMs = Date.now() + 9 * 3600_000 - MATCHDAY_START_HOUR_KST * 3600_000
  return new Date(kstMs).toISOString().slice(0, 10)
}

/** 매치데이 시작일 → 종료일 ("2026-08-16" → "2026-08-17") */
export function matchdayEndDate(dateKst: string): string {
  const d = new Date(`${dateKst}T12:00:00+09:00`)
  return new Date(d.getTime() + 24 * 3600_000).toISOString().slice(0, 10)
}

async function fetchFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  const range = kstDayRange(dateKst)
  if (!range) return []
  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from("betman_games")
    .select(
      "id, home_team_name, away_team_name, league_code, match_time, status, home_score, away_score"
    )
    .eq("sport", "축구")
    .in("league_code", [...MATCH_PAGE_LEAGUES])
    .gte("match_time", range.start)
    .lt("match_time", range.end)
    // ⚠️ 양쪽 다 걸러야 한다 — 홈만 거르면 "OO vs 미정"(UCL 예선 미확정 대진)이 통과한다
    .neq("home_team_name", "미정")
    .neq("away_team_name", "미정")
    .not("home_team_name", "is", null)

  const byKey = new Map<string, FixtureRow>()
  for (const g of data ?? []) {
    const key = `${g.home_team_name}_${g.away_team_name}_${g.match_time}`
    const status = g.status as FixtureRow["status"]
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        matchKey: key,
        gameId: String(g.id),
        homeTeam: String(g.home_team_name),
        awayTeam: String(g.away_team_name),
        leagueCode: String(g.league_code ?? ""),
        matchTime: String(g.match_time),
        status,
        homeScore: g.home_score != null ? Number(g.home_score) : null,
        awayScore: g.away_score != null ? Number(g.away_score) : null,
      })
      continue
    }
    // 상태는 가장 진행된 값, 스코어는 값 있는 row 우선
    if ((STATUS_RANK[status] ?? 0) > (STATUS_RANK[prev.status] ?? 0)) prev.status = status
    if (prev.homeScore == null && g.home_score != null) {
      prev.homeScore = Number(g.home_score)
      prev.awayScore = g.away_score != null ? Number(g.away_score) : null
    }
  }

  return [...byKey.values()].sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}

/** 60초 Data Cache (날짜별 키) — betman 쪽만. LFA 병합은 아래에서 한다 */
function getBetmanFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  return unstable_cache(() => fetchFixturesForDay(dateKst), ["fixtures-day", dateKst], {
    revalidate: 60,
  })()
}

/** 리그 + 킥오프 분 — 같은 라운드는 동시 킥오프가 흔하므로 이것만으로는 경기가 안 갈린다 */
function slotKey(leagueCode: string, matchTime: string): string {
  return `${leagueCode}|${new Date(matchTime).toISOString().slice(0, 16)}`
}

/**
 * betman 행이 어느 LFA 경기인가 — 같은 슬롯 후보 중에서 고른다.
 * 같은 슬롯에서 한 팀이 확실하고 상대 팀의 확인된 모순이 없으면 연결한다. 못 고르면 null
 * (병합하지 않고 betman 행을 따로 싣는다 — 엉뚱한 경기와 합치는 것이 최악이다).
 *
 * 확정 근거는 전체 이름 또는 사전에 등록된 별칭이다. 공통 토큰의 접두 겹침은 쓰지 않는다.
 */

/**
 * 매치데이 전 경기 — **betman 이 정본, LFA 가 보강** (2026-09-02 운영자: "경기 일정 다뤄야
 * 하는 건 베트맨에 있는 거 기준").
 *
 * 8/20 의 "LFA 정본" 결정을 뒤집었다. LFA 전용 행(betman 미판매 경기)은 gameId 가 없어 매치센터·
 * 불판·예측 어느 동선으로도 못 가고, 팀명도 사전에 없으면 영문으로 남아 반쪽짜리 행이었다
 * (2026-09-02 /qa: "Osnabrück vs 바이에른 뮌헨", "파르마 – Cremonese"). 이 사이트의 경기 동선은
 * 승부예측(betman)에서 시작하므로 일정도 betman 이 파는 경기만 싣는다. 대가: betman 은 마켓이
 * 열린 경기만·보통 이틀치만 실어 먼 날짜 탭은 빈다 — 운영자가 받아들인 트레이드오프.
 *
 * LFA 는 같은 경기의 라이브 상태·스코어를 얹는다. 짝을 못 찾은 betman 행도 **버리지 않는다**
 * (링크·한글명은 betman 것이니 잃을 게 없다 — 라이브 스코어만 없다). LFA 가 죽으면 betman
 * 목록 그대로 (fail-open).
 *
 * **예외 — 인기 팀 경기는 betman 에 없어도 싣는다** (같은 날 운영자: "빅6 와 인기 팀으로 구분한
 * 팀들은 예외. 포칼이나 컵대회에서 하부리그 팀과 만나도 그 팀들이 나왔으면"). 정의와 대조 규칙은
 * lib/match/popular-teams.ts — 팀 게시판 14팀, LFA 표기 정확일치. 이런 행은 lfa_fixtures에
 * 독립 UUID로 등록해 매치센터·라인업·스탯·불판·MOM에 연결한다. 승부예측 마켓은 만들지 않는다.
 */
export async function getFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  const [betman, lfa] = await Promise.all([
    getBetmanFixturesForDay(dateKst),
    getLfaFixturesForMatchday(dateKst),
  ])
  if (lfa.length === 0) {
    return restoreRegisteredFixtures(betman, dateKst)
  }

  // ⚠️ 슬롯 = (리그, 킥오프). 같은 라운드 동시 킥오프는 한 슬롯에 여러 후보가 들어가고
  //    pickLfaCounterpart 가 팀명으로 고른다 (2026-08-17 실측: EPL 개막 14:00 UTC 3경기).
  const slots = new Map<string, FixtureRow[]>()
  for (const f of lfa) {
    const row: FixtureRow = {
      matchKey: `lfa_${f.lfaId}`,
      gameId: null,
      lfaMatchId: f.lfaId,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeTeamEn: f.homeTeamEn,
      awayTeamEn: f.awayTeamEn,
      leagueCode: f.leagueCode,
      matchTime: f.matchTime,
      status: f.status,
      lfaFinished: f.status === "completed",
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    }
    const k = slotKey(f.leagueCode, f.matchTime)
    slots.set(k, [...(slots.get(k) ?? []), row])
  }

  const merged: FixtureRow[] = []
  const consumed = new Set<FixtureRow>()
  const ambiguous = new Set<FixtureRow>()
  const linked = new Map<string, string>()
  // 한글→영문 사전 — 확정 별칭과 상대 팀 충돌 확인. 실패하면 직접 전체 이름 일치만 가능.
  const teamEn = new Map(await cachedTeamEn().catch(() => [] as [string, string][]))
  const droppedForLog: {
    betman: string
    league: string
    candidates: string[]
    homeEn: string | null
    awayEn: string | null
    reason: string
  }[] = []
  for (const b of betman) {
    // 앞선 행의 소비 때문에 모호한 슬롯이 뒤에서 단일 후보로 둔갑하지 않게 전체를 대조한다.
    const candidates = slots.get(slotKey(b.leagueCode, b.matchTime)) ?? []
    const decision = matchLfaCounterpart(b, candidates, teamEn)
    const hit = decision.candidate && !consumed.has(decision.candidate) ? decision.candidate : null
    if (!hit) {
      if (decision.status === "ambiguous")
        for (const candidate of candidates) ambiguous.add(candidate)
      // 미확정·충돌·다중 후보를 구분해 남긴다. betman 일정과 링크는 보존하고 LFA 보강만 보류한다.
      droppedForLog.push({
        betman: `${b.homeTeam} vs ${b.awayTeam}`,
        league: b.leagueCode,
        candidates: candidates.map((c) => `${c.homeTeam} vs ${c.awayTeam}`),
        homeEn: teamEn.get(b.homeTeam.trim()) ?? null,
        awayEn: teamEn.get(b.awayTeam.trim()) ?? null,
        reason: decision.candidate ? "already-linked" : decision.status,
      })
      // 짝 못 찾은 betman 행은 **그대로 싣는다** (2026-09-02, betman 정본). 링크·한글명은
      // betman 것이라 잃을 게 없고 라이브 스코어만 없다. 8/20 엔 "두 줄" 을 막으려 버렸는데,
      // 이제 LFA 전용 행을 아예 안 실으므로 두 줄이 생길 수 없다.
      merged.push(b)
      continue
    }
    consumed.add(hit)
    if (hit.lfaMatchId && b.gameId) linked.set(hit.lfaMatchId, b.gameId)
    // 일정 식별자는 betman, 짝이 확인된 경기의 실황 상태는 LFA가 소유한다.
    const status = hit.status
    /**
     * ⚠️ 스코어는 **우선순위 모듈에 맡긴다** (2026-08-25 외부 감사 P0-2).
     *    종전엔 여기서 `b.homeScore ?? hit.homeScore` 였는데, 와이즈토토는 라이브 점수를
     *    주지 않아 경기 중엔 낡은 값이 남아 있고 `??` 는 null 이 아니면 이긴다. 그래서
     *    이 페이지가 "경기 중 2-1", 같은 시각 매치센터가 "FT 2-2" 를 말했다.
     *    매치센터엔 이미 맞는 규칙이 있었는데 이쪽에만 없었다 — 규칙을 한 곳에 뒀다.
     */
    const live = isLiveState(status)
    merged.push({
      ...hit,
      matchKey: b.matchKey,
      gameId: b.gameId,
      homeTeam: b.homeTeam,
      awayTeam: b.awayTeam,
      status,
      homeScore: pickScore(live, hit.homeScore, b.homeScore),
      awayScore: pickScore(live, hit.awayScore, b.awayScore),
    })
  }
  if (droppedForLog.length > 0) {
    console.warn(
      `[fixtures] betman↔LFA 짝짓기 실패 ${droppedForLog.length}건 (사전 ${teamEn.size}개) — ` +
        `행은 살아 있지만 라이브 스코어가 없고, 매치센터의 LFA 링크도 같은 이유로 비었을 수 있다: ` +
        JSON.stringify(droppedForLog)
    )
  }
  // LFA 전용 행(betman 미판매)은 인기 팀 경기만 싣는다 — 2026-09-02 운영자 결정 (위 doc 참조)
  for (const rows of slots.values()) {
    for (const row of rows) {
      if (!consumed.has(row) && !ambiguous.has(row) && isPopularFixture(row)) merged.push(row)
    }
  }

  try {
    const missing = new Set(
      merged.filter((f) => !f.gameId && f.lfaMatchId).map((f) => f.lfaMatchId!)
    )
    const registered = await syncSupplementalFixtures(lfa, linked, missing)
    for (let i = 0; i < merged.length; i++) {
      const row = merged[i]
      const saved = row.lfaMatchId ? registered.get(row.lfaMatchId) : null
      if (saved) merged[i] = supplementalSummary(saved)
    }
  } catch (error) {
    // Migration/storage failure must not create dead UUID links or interrupt Betman schedules.
    console.error("[fixtures] LFA 전용 경기 등록 실패", error)
  }

  return restoreRegisteredFixtures(merged, dateKst)
}

/** A partial/failed feed must not remove registered matches or duplicate a later Betman market. */
async function restoreRegisteredFixtures(
  rows: FixtureRow[],
  dateKst: string
): Promise<FixtureRow[]> {
  const range = kstDayRange(dateKst)
  const stored = range ? await listSupplementalFixtures(range.start, range.end).catch(() => []) : []
  let restored = [...rows]
  for (const row of stored) {
    if (restored.some((f) => f.gameId === row.id)) continue
    const ids = row.betman_game_id
      ? await getSiblingGameIds(createServiceRoleClient(), row.id)
      : [row.id]
    restored = restored.filter((f) => !f.gameId || !ids.includes(f.gameId))
    restored.push(supplementalSummary(row))
  }
  return restored.sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}

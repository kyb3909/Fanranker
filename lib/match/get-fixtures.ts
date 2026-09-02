import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { MATCH_PAGE_LEAGUES } from "@/lib/match/leagues"
import { getLfaFixturesForMatchday } from "@/lib/lfa/fixtures"
import { cachedTeamEn } from "@/lib/lfa/match"
import { normTeam, pickLfaCounterpart } from "@/lib/match/pair-fixtures"
import { isPopularFixture } from "@/lib/match/popular-teams"
import { isLiveState, pickScore } from "@/lib/match/score-precedence"

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
   * betman_games.id — **없을 수 있다.** betman 은 베팅 마켓이 열린 경기만 싣기 때문에
   * 개막 라운드처럼 아직 마켓이 없는 경기는 LFA 에만 존재한다 (2026-08-17).
   * null 이면 매치 페이지 링크를 걸지 않는다 (라인업·리포트가 betman id 로 걸려 있다).
   */
  gameId: string | null
  homeTeam: string
  awayTeam: string
  /** LFA 행의 영문 원명 — 짝짓기의 영문 대조용 (lib/match/pair-fixtures.ts TeamSided 참조) */
  homeTeamEn?: string
  awayTeamEn?: string
  leagueCode: string
  matchTime: string
  status: "scheduled" | "in_progress" | "completed" | "cancelled"
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
 * 후보가 하나면 그대로, 여럿이면 팀명 대조로 좁힌다. 못 고르면 null
 * (병합하지 않고 betman 행을 따로 싣는다 — 엉뚱한 경기와 합치는 것이 최악이다).
 *
 * ⚠️ 대조는 두 축이다 (2026-08-20 실사고 — UCL 예선이 두 줄씩 실렸다):
 *   ① 한글 통짜 접두 겹침 — LFA 행이 이미 한글화된 경우 ("셀틱" ≡ "셀틱")
 *   ② 사전 영문 변환 + 토큰 접두 겹침 — LFA 행이 원문으로 남은 경우
 *      (betman "하포엘 베르셰바" → EN "Hapoel Beer Sheva" → LFA "HB Sheva" 의
 *       "sheva" 토큰이 잡는다). 한글화는 lfa_team_id 매핑이 있는 팀만 되므로
 *       예선 마이너 팀은 ①이 영영 못 잡는다 — 그게 두 줄의 원인이었다.
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
 * lib/match/popular-teams.ts — 팀 게시판 14팀, LFA 표기 정확일치. 이런 행은 gameId 가 없어
 * 매치센터 링크 없이 일정에만 실린다.
 */
export async function getFixturesForDay(dateKst: string): Promise<FixtureRow[]> {
  const [betman, lfa] = await Promise.all([
    getBetmanFixturesForDay(dateKst),
    getLfaFixturesForMatchday(dateKst),
  ])
  if (lfa.length === 0) return betman

  // ⚠️ 슬롯 = (리그, 킥오프). 같은 라운드 동시 킥오프는 한 슬롯에 여러 후보가 들어가고
  //    pickLfaCounterpart 가 팀명으로 고른다 (2026-08-17 실측: EPL 개막 14:00 UTC 3경기).
  const slots = new Map<string, FixtureRow[]>()
  for (const f of lfa) {
    const row: FixtureRow = {
      matchKey: `lfa_${f.lfaId}`,
      gameId: null,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      homeTeamEn: f.homeTeamEn,
      awayTeamEn: f.awayTeamEn,
      leagueCode: f.leagueCode,
      matchTime: f.matchTime,
      status: f.status,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
    }
    const k = slotKey(f.leagueCode, f.matchTime)
    slots.set(k, [...(slots.get(k) ?? []), row])
  }

  const merged: FixtureRow[] = []
  const consumed = new Set<FixtureRow>()
  // 한글→영문 사전 — 예선 마이너 팀 대조용 (실패 시 빈 맵 → ① 축만으로 동작)
  const teamEn = new Map(await cachedTeamEn().catch(() => [] as [string, string][]))
  const droppedForLog: {
    betman: string
    league: string
    candidates: string[]
    homeEn: string | null
    awayEn: string | null
  }[] = []
  for (const b of betman) {
    const candidates = (slots.get(slotKey(b.leagueCode, b.matchTime)) ?? []).filter(
      (c) => !consumed.has(c)
    )
    const hit = pickLfaCounterpart(b, candidates, teamEn)
    if (!hit) {
      /**
       * ⚠️ 여기서 버려진 경기는 gameId 를 잃고 매치 링크·불판·예열이 통째로 끊긴다.
       *    2026-08-30 실사고(EPL 3경기·세리에A 2경기)에서 **읽기만으로는 원인을 못
       *    좁혔다** — 짝짓기 함수는 단위 시험에서 실제 사전값으로 전부 통과하는데
       *    프로덕션에서는 같은 슬롯에 2경기 이상이면 전멸했다. 입력이 다르다는 뜻인데
       *    그게 사전인지 후보 목록인지 알 방법이 없었다. 그래서 **버리는 순간에 증거를
       *    남긴다** — 조용한 실패가 이 저장소에서 가장 비싼 실패다.
       */
      droppedForLog.push({
        betman: `${b.homeTeam} vs ${b.awayTeam}`,
        league: b.leagueCode,
        candidates: candidates.map((c) => `${c.homeTeam} vs ${c.awayTeam}`),
        homeEn: teamEn.get(b.homeTeam.trim()) ?? null,
        awayEn: teamEn.get(b.awayTeam.trim()) ?? null,
      })
      // 짝 못 찾은 betman 행은 **그대로 싣는다** (2026-09-02, betman 정본). 링크·한글명은
      // betman 것이라 잃을 게 없고 라이브 스코어만 없다. 8/20 엔 "두 줄" 을 막으려 버렸는데,
      // 이제 LFA 전용 행을 아예 안 실으므로 두 줄이 생길 수 없다.
      merged.push(b)
      continue
    }
    consumed.add(hit)
    // betman 이 있으면 그쪽 한글 팀명·gameId 를 쓴다. 상태는 앞선 쪽 우선
    const status = STATUS_RANK[b.status] > STATUS_RANK[hit.status] ? b.status : hit.status
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
    for (const row of rows) if (!consumed.has(row) && isPopularFixture(row)) merged.push(row)
  }

  return merged.sort((a, b) => a.matchTime.localeCompare(b.matchTime))
}

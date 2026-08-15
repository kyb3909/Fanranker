import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchMatchPage, extractLivesportEventIds } from "@/lib/soccerway/match-page"
import { fetchLineup, type LineupPlayer, type RawLineup } from "@/lib/soccerway/lineup"
import { loadNotationSafe, findUniqueRomanizedMatch } from "@/lib/news/notation"

/**
 * betman 경기 → 라인업 (표시 전용 오케스트레이션, 2026-08-16).
 *
 * ## 왜 DB 에 아무것도 쓰지 않나
 * `betman_games.mapped_*` 실기록은 골든셋 게이트(G-매칭) 통과 전 금지가 gauntlet 정본이다.
 * 라인업은 표시 전용 파생 데이터라 테이블·cron·마이그레이션 없이 **proposed 매핑 행을
 * 읽기만** 하고, 캐시는 전부 Data Cache(unstable_cache)에 둔다.
 * ⚠️ 페이지 `revalidate` 는 이 앱에서 동작하지 않는다(ClerkProvider dynamic) —
 *    Data Cache 가 유일하게 동작하는 캐시다 (lib/home/cached-home-data.ts 와 같은 이유).
 *
 * ## 비용 구조
 * - 킥오프 창(-150분~+180분) 밖이면 **아웃바운드 fetch 0회** (DB 1회 보고 즉시 none)
 * - eventId 해석(721KB HTML fetch)은 경기당 불변 → 24h 캐시로 경기당 1~2회
 * - 라인업 JSON(50KB)은 300s 캐시 — 발표 전 pending 폴링을 이 TTL 이 흡수한다
 *
 * ## 홈/원정 배치 (R6 — 자동 스왑 금지)
 * betman 홈/원정과 soccerway 가 뒤집혀 있을 수 있다. 1차로 매핑 행의
 * page_home_en/page_away_en 과 라인업 API 참가팀명을 문자열 대조하고, 대조가 성립할
 * 때만 betman 기준으로 배치한다. 애매하면 스왑을 추측하지 않고 none — 뒤집힌 라인업은
 * 안 보여주는 것보다 나쁘다.
 */

const WINDOW_BEFORE_MS = 150 * 60 * 1000
const WINDOW_AFTER_MS = 180 * 60 * 1000

export interface DisplayPlayer {
  /** 화면 표기 — 사전에 있으면 한글, 없으면 로마자 (운영자 결정: 혼용 허용) */
  label: string
  number: number | null
}

export interface DisplaySide {
  /** betman 한글 팀명 (카드와 같은 라벨) */
  teamLabel: string
  formation: string | null
  starters: DisplayPlayer[]
  bench: DisplayPlayer[]
}

export type LineupResponse =
  | { status: "none" }
  | { status: "pending"; kickoff: string }
  | { status: "ready"; kickoff: string; home: DisplaySide; away: DisplaySide; fetchedAt: string }

/* ── 팀명 정규화 대조 ── */

/** "Sheffield Utd" vs "Sheffield United" 급 변형 흡수 — 토큰 교집합으로 느슨 대조 */
function teamNameMatches(a: string, b: string): boolean {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !["the", "club", "fc", "afc", "utd", "united"].includes(t))
    )
  const ta = tok(a)
  const tb = tok(b)
  if (ta.size === 0 || tb.size === 0) return false
  for (const t of ta) if (tb.has(t)) return true
  return false
}

/* ── 캐시 계층 ── */

/**
 * candidate_url → 검증된 eventId. 24h 캐시 (eventId 는 경기당 불변).
 * 후보 추출(HTML 앵커)과 채택(라인업 API 참가팀명 대조)을 분리한다 — 오탐 eventId 는
 * **남의 경기 라인업**이라, 대조 없이는 절대 채택하지 않는다.
 */
function cachedResolveEventId(candidateUrl: string, pageHomeEn: string, pageAwayEn: string) {
  return unstable_cache(
    async (): Promise<string | null> => {
      try {
        const fetched = await fetchMatchPage(candidateUrl)
        if (!fetched.html) return null
        const ids = extractLivesportEventIds(fetched.html)
        for (const id of ids) {
          const lineup = await fetchLineup(id)
          if (!lineup) {
            // 라인업 미발표 시각에도 eventId 자체는 채택하고 싶지만, 참가팀 대조 없이는
            // 확정할 수 없다 — 이 회차는 null 로 두고 발표 후 재시도에 맡긴다 (24h 캐시라
            // 미발표 상태가 오래 박히면 안 되므로 null 은 캐시하지 않도록 아래에서 throw).
            continue
          }
          const teams = [lineup.home.teamNameEn, lineup.away.teamNameEn]
          const homeOk = teams.some((t) => teamNameMatches(t, pageHomeEn))
          const awayOk = teams.some((t) => teamNameMatches(t, pageAwayEn))
          if (homeOk && awayOk) return id
        }
        // 검증 실패 — 캐시에 null 을 24h 박으면 발표 후에도 계속 none 이 된다.
        // throw 로 캐시를 건너뛰고(unstable_cache 는 예외를 캐시하지 않는다) 다음 요청이 재시도.
        throw new Error("lineup-eventid-unverified")
      } catch (e) {
        if ((e as Error).message === "lineup-eventid-unverified") throw e
        throw new Error("lineup-eventid-unverified")
      }
    },
    ["lineup-eventid", candidateUrl],
    { revalidate: 24 * 3600 }
  )
}

function cachedLineup(eventId: string) {
  return unstable_cache(async () => fetchLineup(eventId), ["lineup-body", eventId], {
    revalidate: 300,
  })
}

/**
 * 표기 사전 인물 목록 — 1h 캐시.
 * ⚠️ Notation 전체를 캐시하면 안 된다 — labels 가 Map 이라 Data Cache 직렬화에서 죽는다.
 *    persons 배열(plain object)만 꺼내 캐시한다.
 * 사전 접근은 반드시 lib/news/notation 경유 (notation-single-door 아키텍처 가드).
 */
const cachedPersons = unstable_cache(
  async () => {
    const notation = await loadNotationSafe(createServiceRoleClient())
    return notation.persons.map((p) => ({ romanized: p.romanized, preferred_ko: p.preferred_ko }))
  },
  ["lineup-notation-persons"],
  { revalidate: 3600 }
)

/* ── 본체 ── */

function toDisplay(
  side: { formation: string | null; starters: LineupPlayer[]; bench: LineupPlayer[] },
  teamLabel: string,
  persons: { romanized: string | null; preferred_ko: string }[]
): DisplaySide {
  const label = (p: LineupPlayer): string => {
    // 풀네임 슬러그("cooper michael")가 이니셜형 listName 보다 신원 판정이 강하다.
    // 동명이인이면 findUniqueRomanizedMatch 가 null — 틀린 한글로 부르느니 로마자.
    const hit = findUniqueRomanizedMatch(persons, p.romanizedFull ?? p.name)
    return hit?.preferred_ko ?? p.name
  }
  return {
    teamLabel,
    formation: side.formation,
    starters: side.starters.map((p) => ({ label: label(p), number: p.number })),
    bench: side.bench.map((p) => ({ label: label(p), number: p.number })),
  }
}

export async function getLineupForGame(gameId: string): Promise<LineupResponse> {
  const supabase = createServiceRoleClient()

  // ① 경기 확인 + 킥오프 창 게이트 (창 밖이면 아웃바운드 0)
  const { data: game } = await supabase
    .from("betman_games")
    .select("id, sport, home_team_name, away_team_name, match_time")
    .eq("id", gameId)
    .maybeSingle()
  if (!game || game.sport !== "축구" || !game.match_time) return { status: "none" }

  const kickoff = new Date(game.match_time as string)
  const now = Date.now()
  if (now < kickoff.getTime() - WINDOW_BEFORE_MS || now > kickoff.getTime() + WINDOW_AFTER_MS) {
    return { status: "none" }
  }

  // ② 형제 row 확장 — 마켓별 다중 row 라 proposed 가 어느 id 에 붙었을지 모른다
  const { data: siblings } = await supabase
    .from("betman_games")
    .select("id")
    .eq("home_team_name", game.home_team_name)
    .eq("away_team_name", game.away_team_name)
    .eq("match_time", game.match_time)
  const ids = (siblings ?? []).map((s) => s.id as string)
  if (ids.length === 0) return { status: "none" }

  // ③ proposed 매핑 행 (읽기 전용 — 실기록은 게이트 통과 후의 일)
  const { data: attempt } = await supabase
    .from("match_mapping_attempts")
    .select("candidate_url, page_home_en, page_away_en, home_away_flip")
    .in("game_id", ids)
    .eq("outcome", "proposed")
    .not("candidate_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!attempt?.candidate_url || !attempt.page_home_en || !attempt.page_away_en) {
    return { status: "none" }
  }

  // ④ eventId 해석 (24h 캐시, 검증 실패는 throw 로 캐시 회피)
  let eventId: string | null = null
  try {
    eventId = await cachedResolveEventId(
      attempt.candidate_url as string,
      attempt.page_home_en as string,
      attempt.page_away_en as string
    )()
  } catch {
    // 미발표라 검증을 못 한 상태 — 발표되면 다음 요청이 뚫는다
    return { status: "pending", kickoff: kickoff.toISOString() }
  }
  if (!eventId) return { status: "pending", kickoff: kickoff.toISOString() }

  // ⑤ 라인업 (300s 캐시)
  const lineup: RawLineup | null = await cachedLineup(eventId)()
  if (!lineup) return { status: "pending", kickoff: kickoff.toISOString() }

  // ⑥⑦ 한글화 + betman 기준 홈/원정 배치
  const persons = await cachedPersons().catch(
    () => [] as { romanized: string | null; preferred_ko: string }[]
  )

  // soccerway HOME 이 매핑 행의 page_home_en 과 같은 팀인지 대조.
  // page_home_en 은 "soccerway 페이지 기준 홈"이고, home_away_flip 이 betman 과의
  // 뒤집힘을 말해준다. (flip=true → soccerway 홈 = betman 원정)
  const swHomeIsPageHome = teamNameMatches(lineup.home.teamNameEn, attempt.page_home_en as string)
  const swAwayIsPageAway = teamNameMatches(lineup.away.teamNameEn, attempt.page_away_en as string)
  if (!swHomeIsPageHome || !swAwayIsPageAway) return { status: "none" } // 대조 불성립 — 추측 금지

  const flip = attempt.home_away_flip === true
  const betmanHomeSide = flip ? lineup.away : lineup.home
  const betmanAwaySide = flip ? lineup.home : lineup.away

  return {
    status: "ready",
    kickoff: kickoff.toISOString(),
    home: toDisplay(betmanHomeSide, game.home_team_name as string, persons),
    away: toDisplay(betmanAwaySide, game.away_team_name as string, persons),
    fetchedAt: new Date().toISOString(),
  }
}

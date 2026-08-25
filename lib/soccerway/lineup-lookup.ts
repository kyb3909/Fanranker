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
// 종료 후에도 하루 동안은 라인업을 보여준다 — 매치 페이지(2026-08-16)가 "새벽 경기
// 어떻게 됐지?"에 답하려면 FT 후 조회가 돼야 한다. 캐시(eventId 24h·본문 300s) 덕에
// 창을 넓혀도 아웃바운드 비용은 거의 그대로다. 그 이상의 과거는 단계 3 영속화의 몫.
const WINDOW_AFTER_MS = 24 * 3600 * 1000

interface DisplayPlayer {
  /** 화면 표기 — 사전에 있으면 한글, 없으면 로마자 (운영자 결정: 혼용 허용) */
  label: string
  number: number | null
  /** 풀네임 로마자 (슬러그 유래) — 리포트 파이프라인이 기사 속 영문명과 대조하는 재료 */
  roman: string | null
  /* 인시던트 아이콘 재료 (2026-08-16) — 없으면 생략 (페이로드 절약) */
  goals?: number
  goalMinutes?: string[]
  ownGoals?: number
  red?: boolean
  subOut?: string | null
  subIn?: string | null
  /** 교체 상대 표시명 (한글 라벨 해석 후) — "누구랑 교체했는지" */
  subPartner?: string
}

interface DisplaySide {
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
export const cachedPersons = unstable_cache(
  async () => {
    const notation = await loadNotationSafe(createServiceRoleClient())
    return notation.persons.map((p) => ({ romanized: p.romanized, preferred_ko: p.preferred_ko }))
  },
  ["lineup-notation-persons"],
  { revalidate: 3600 }
)

/**
 * 팀 스쿼드 사전(team_squads) — slug → 한글명, 1h 캐시.
 * soccerway 선수 슬러그끼리의 **정확 매칭**이라 로마자 추측보다 강하다. 다만 표기 정본
 * 순위(운영자 확정 사전 > 수확분)에 따라 뉴스 표기 사전 unique 매칭이 먼저, 이건 2차.
 * Map 은 Data Cache 직렬화가 안 되므로 pair 배열로 캐시하고 사용처에서 Map 을 만든다.
 */
export const cachedSquadPairs = unstable_cache(
  async (): Promise<[string, string][]> => {
    const { data } = await createServiceRoleClient()
      .from("team_squads")
      .select("player_slug, name_kr")
      .not("name_kr", "is", null)
      .neq("status", "rejected")
    return (data ?? []).map((r) => [
      String(r.player_slug).replace(/-/g, " "), // romanizedFull 과 같은 공백 구분형으로
      String(r.name_kr),
    ])
  },
  ["lineup-squad-names"],
  { revalidate: 3600 }
)

/* ── 본체 ── */

/**
 * 한 팀의 선수 목록 → 표시용. 교체 상대(subPartner)는 같은 팀 전체(선발+벤치)에서
 * 로마자 슬러그로 찾아 **한글 라벨**로 해석한다 — 못 찾으면 원표기 폴백.
 */
function toDisplayPlayers(
  players: LineupPlayer[],
  side: { starters: LineupPlayer[]; bench: LineupPlayer[] },
  label: (p: LineupPlayer) => string
): DisplayPlayer[] {
  const romanToLabel = new Map<string, string>()
  for (const p of [...side.starters, ...side.bench]) {
    if (p.romanizedFull) romanToLabel.set(p.romanizedFull, label(p))
  }
  return players.map((p) => {
    const partner = p.subPartnerRoman
      ? (romanToLabel.get(p.subPartnerRoman) ?? p.subPartnerName)
      : p.subPartnerName
    return {
      label: label(p),
      number: p.number,
      roman: p.romanizedFull ?? p.name,
      ...(p.goals ? { goals: p.goals } : {}),
      ...(p.goalMinutes?.length ? { goalMinutes: p.goalMinutes } : {}),
      ...(p.ownGoals ? { ownGoals: p.ownGoals } : {}),
      ...(p.red ? { red: true } : {}),
      ...(p.subOut ? { subOut: p.subOut } : {}),
      ...(p.subIn ? { subIn: p.subIn } : {}),
      ...(partner ? { subPartner: partner } : {}),
    }
  })
}

function toDisplay(
  side: { formation: string | null; starters: LineupPlayer[]; bench: LineupPlayer[] },
  teamLabel: string,
  persons: { romanized: string | null; preferred_ko: string }[],
  squadKo: Map<string, string>
): DisplaySide {
  const label = (p: LineupPlayer): string => {
    // 풀네임 슬러그("cooper michael")가 이니셜형 listName 보다 신원 판정이 강하다.
    // 동명이인이면 findUniqueRomanizedMatch 가 null — 틀린 한글로 부르느니 로마자.
    const hit = findUniqueRomanizedMatch(persons, p.romanizedFull ?? p.name)
    if (hit) return hit.preferred_ko
    // 2차: 팀 스쿼드 사전 — soccerway 슬러그 정확 매칭 (harvest-squads.ts 수확분)
    const squadHit = p.romanizedFull ? squadKo.get(p.romanizedFull) : undefined
    return squadHit ?? p.name
  }
  return {
    teamLabel,
    formation: side.formation,
    starters: toDisplayPlayers(side.starters, side, label),
    bench: toDisplayPlayers(side.bench, side, label),
  }
}

/** 경기 → 검증된 Livesport eventId (① 창 게이트 → ② 형제 확장 → ③ 매핑 행 → ④ 해석) */
interface ResolvedEvent {
  status: "ok"
  eventId: string
  kickoff: Date
  /**
   * ⚠️ **스코어를 반드시 함께 싣는다** (2026-08-25 2차 실사고).
   *    종전엔 팀 이름 둘만 담아 돌려줬는데, 읽는 쪽(resolveMatchEvent)은 여기서
   *    `home_score` 를 꺼내려 했다. 캐스팅으로 타입 검사를 피해 가서 **에러 없이
   *    항상 null** 이 됐고, 그래서 리포트 스코어 게이트가 **한 번도 돈 적이 없다.**
   *    조회문(select)엔 처음부터 스코어가 있었다 — 옮겨 담는 자리에서 흘린 것이다.
   */
  game: {
    home_team_name: string
    away_team_name: string
    home_score: number | null
    away_score: number | null
    /** 산 피드(LFA) 하루치 색인과 조인하는 데 필요하다 — 리포트 스코어 교차검증 */
    league_code: string | null
    match_time: string
  }
  attempt: { page_home_en: string; page_away_en: string; home_away_flip: boolean | null }
}

async function resolveEventCore(
  gameId: string
): Promise<ResolvedEvent | { status: "none" } | { status: "pending"; kickoff: Date }> {
  const supabase = createServiceRoleClient()

  // ① 경기 확인 + 킥오프 창 게이트 (창 밖이면 아웃바운드 0)
  const { data: game } = await supabase
    .from("betman_games")
    .select(
      "id, sport, home_team_name, away_team_name, match_time, home_score, away_score, league_code"
    )
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
    return { status: "pending", kickoff }
  }
  if (!eventId) return { status: "pending", kickoff }

  return {
    status: "ok",
    eventId,
    kickoff,
    game: {
      home_team_name: String(game.home_team_name),
      away_team_name: String(game.away_team_name),
      home_score: typeof game.home_score === "number" ? game.home_score : null,
      away_score: typeof game.away_score === "number" ? game.away_score : null,
      league_code: game.league_code ? String(game.league_code) : null,
      match_time: String(game.match_time),
    },
    attempt: {
      page_home_en: String(attempt.page_home_en),
      page_away_en: String(attempt.page_away_en),
      home_away_flip: attempt.home_away_flip as boolean | null,
    },
  }
}

/** 매치 부가정보(스탯·리포트)가 같은 해석을 재사용한다 — match-extras.ts 소비 */
export async function resolveMatchEvent(gameId: string): Promise<{
  eventId: string
  homeTeam: string
  awayTeam: string
  /** ⚠️ betman 확정 스코어. 리포트가 기사에서 뽑은 값 대신 **이걸** 써야 한다
   *  (2026-08-25: 같은 경기를 3회 생성했더니 3-2 / 3-2 / 3-3 으로 갈렸다). */
  homeScore: number | null
  awayScore: number | null
  /** 산 피드 교차검증용 (lookupLfaDayEntry 가 이 둘로 조인한다) */
  leagueCode: string | null
  matchTime: string
} | null> {
  try {
    const r = await resolveEventCore(gameId)
    if (r.status !== "ok") return null
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
    return {
      eventId: r.eventId,
      homeTeam: r.game.home_team_name,
      awayTeam: r.game.away_team_name,
      // ⚠️ 캐스팅으로 꺼내지 마라 — 그 방식이 위 실사고의 원인이었다 (없는 필드를
      //    읽어도 에러가 안 나서 게이트가 조용히 죽었다). 타입에 실려 있어야 한다.
      homeScore: num(r.game.home_score),
      awayScore: num(r.game.away_score),
      leagueCode: r.game.league_code,
      matchTime: r.game.match_time,
    }
  } catch {
    return null
  }
}

/**
 * 저장해 둔 라인업 (있으면 창 밖이어도 그대로 보여준다).
 *
 * ⚠️ 창(킥오프 −150분 ~ +24시간)은 **바깥에 요청을 보낼지**만 정한다. 화면에 뭘 보여줄지는
 *    저장분이 정한다. 종전엔 둘이 붙어 있어서, 하루 지난 경기를 열면 라인업·리포트·스탯이
 *    한꺼번에 사라졌다 — 같은 페이지가 열어보는 시각에 따라 달라졌다 (2026-08-18 운영자).
 */
async function loadStoredLineup(gameId: string): Promise<LineupResponse | null> {
  const { data } = await createServiceRoleClient()
    .from("match_lineups")
    .select("payload")
    .eq("game_id", gameId)
    .maybeSingle()
  const payload = data?.payload as LineupResponse | undefined
  return payload && payload.status === "ready" ? payload : null
}

/** 확보한 라인업을 영구 보관 — soccerway 는 하루 뒤 더 이상 주지 않는다 */
export async function storeLineupPayload(gameId: string, eventId: string, payload: LineupResponse) {
  return storeLineup(gameId, eventId, payload)
}

async function storeLineup(gameId: string, eventId: string, payload: LineupResponse) {
  if (payload.status !== "ready") return
  await createServiceRoleClient()
    .from("match_lineups")
    .upsert(
      { game_id: gameId, event_id: eventId, payload, updated_at: new Date().toISOString() },
      { onConflict: "game_id" }
    )
}

export async function getLineupForGame(gameId: string): Promise<LineupResponse> {
  // 저장분이 있으면 그것이 정답 — 원본이 이미 지웠을 수 있다
  const stored = await loadStoredLineup(gameId).catch(() => null)
  if (stored) return stored

  const resolved = await resolveEventCore(gameId)
  if (resolved.status === "none") return { status: "none" }
  if (resolved.status === "pending") {
    return { status: "pending", kickoff: resolved.kickoff.toISOString() }
  }
  const { eventId, kickoff, game, attempt } = resolved

  // ⑤ 라인업 (300s 캐시)
  const lineup: RawLineup | null = await cachedLineup(eventId)()
  if (!lineup) return { status: "pending", kickoff: kickoff.toISOString() }

  // ⑥⑦ 한글화 + betman 기준 홈/원정 배치
  const persons = await cachedPersons().catch(
    () => [] as { romanized: string | null; preferred_ko: string }[]
  )
  const squadPairs = await cachedSquadPairs().catch(() => [] as [string, string][])
  // 같은 슬러그가 서로 다른 한글명으로 두 번 나오면(전 소속팀 잔재 등) 둘 다 버린다
  const squadKo = new Map<string, string>()
  const clash = new Set<string>()
  for (const [slug, ko] of squadPairs) {
    const prev = squadKo.get(slug)
    if (prev !== undefined && prev !== ko) clash.add(slug)
    else squadKo.set(slug, ko)
  }
  for (const s of clash) squadKo.delete(s)

  // soccerway HOME 이 매핑 행의 page_home_en 과 같은 팀인지 대조.
  // page_home_en 은 "soccerway 페이지 기준 홈"이고, home_away_flip 이 betman 과의
  // 뒤집힘을 말해준다. (flip=true → soccerway 홈 = betman 원정)
  const swHomeIsPageHome = teamNameMatches(lineup.home.teamNameEn, attempt.page_home_en as string)
  const swAwayIsPageAway = teamNameMatches(lineup.away.teamNameEn, attempt.page_away_en as string)
  if (!swHomeIsPageHome || !swAwayIsPageAway) return { status: "none" } // 대조 불성립 — 추측 금지

  const flip = attempt.home_away_flip === true
  const betmanHomeSide = flip ? lineup.away : lineup.home
  const betmanAwaySide = flip ? lineup.home : lineup.away

  const ready: LineupResponse = {
    status: "ready",
    kickoff: kickoff.toISOString(),
    home: toDisplay(betmanHomeSide, game.home_team_name as string, persons, squadKo),
    away: toDisplay(betmanAwaySide, game.away_team_name as string, persons, squadKo),
    fetchedAt: new Date().toISOString(),
  }
  // 저장 실패가 화면을 막지는 않는다 (fail-open) — 다음 요청이 다시 시도한다
  await storeLineup(gameId, eventId, ready).catch(() => {})
  return ready
}

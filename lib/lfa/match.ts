import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import { lfaFetch, type LfaMatch, type LfaMatchDetails } from "@/lib/lfa/client"
import { getLineupForGame, type LineupResponse } from "@/lib/soccerway/lineup-lookup"
import {
  readDayMatches,
  readMatchDetails,
  writeDayMatches,
  writeMatchDetails,
} from "@/lib/lfa/persist"
import { resolveTeamId } from "@/lib/match/resolve-team-id"

/**
 * betman 경기 → live-football-api 경기 해석 + 스코어/스탯 (2026-08-17).
 *
 * ## 해석 방식 (fail-closed)
 * (킥오프 UTC 날짜) → `/matches?date=` 한 번 → 리그 id 로 좁힘 → 팀명 대조 →
 * **정확히 1건일 때만** 채택. 애매하면 null — 남의 경기 스코어를 붙이는 것이 최악이다.
 *
 * 팀명은 betman 한글 → `team_dictionary.name_en` → LFA 영문명 대조다. LFA 는 축약형을
 * 쓰므로("Man. City") 정확일치가 아니라 토큰 접두 매칭을 쓴다 ("man" ⊂ "manchester").
 *
 * ## 크레딧
 * 날짜별 목록은 **날짜 하나당 1회**만 받아 그날 전 경기가 공유한다 (경기별 호출 금지).
 * 진행 중이면 60초, 종료됐으면 6시간 캐시 — 끝난 경기를 다시 물어볼 이유가 없다.
 */

/* ── 팀명 대조 ── */

/**
 * betman 한글 팀명 → 영문명 (1h 캐시).
 *
 * 두 사전을 합친다:
 *  · `team_dictionary` — soccerway 경로가 쓰는 정본 (PK 가 soccerway_team_id)
 *  · `lfa_team_names`  — soccerway 에 없어 위 표에 행을 만들 수 없는 팀 (2026-08-24)
 *
 * ⚠️ 여기서 못 찾으면 **한글명이 그대로** 대조에 들어가고, teamMatches 의 토큰화가
 *    한글을 지워 빈 배열이 되므로 **무조건 매칭 실패**한다 — 그 경기의 라인업·스탯·
 *    타임라인이 통째로 사라지고 불판(라인업 조건)도 안 생긴다. 조용한 전멸이라
 *    사전 커버리지가 곧 기능 가용성이다 (2026-08-23 브라이턴·본머스 실사고).
 *    백필: `pnpm exec tsx scripts/backfill-team-dictionary-from-lfa.ts --post`
 */
export const cachedTeamEn = unstable_cache(
  async (): Promise<[string, string][]> => {
    const supabase = createServiceRoleClient()
    const [{ data }, { data: lfaNames }] = await Promise.all([
      supabase
        .from("team_dictionary")
        .select("name_kr, aliases_kr, name_en")
        .neq("status", "rejected"),
      supabase.from("lfa_team_names").select("name_kr, name_en"),
    ])
    const out: [string, string][] = []
    for (const r of data ?? []) {
      const en = String(r.name_en ?? "").trim()
      if (!en) continue
      if (r.name_kr) out.push([String(r.name_kr).trim(), en])
      for (const a of (r.aliases_kr as string[] | null) ?? []) {
        if (a) out.push([String(a).trim(), en])
      }
    }
    // 보조 사전은 뒤에 붙인다 — Map 생성 시 나중 값이 이기므로 정본을 덮지 않으려면
    // 호출부가 먼저 온 값을 쓰게 해야 한다. resolveMatch 는 `new Map(...)` 이라
    // 뒤가 이긴다 → 정본에 이미 있는 팀은 보조에 넣지 않는 것이 백필 스크립트의 규칙.
    for (const r of lfaNames ?? []) {
      const en = String(r.name_en ?? "").trim()
      if (en && r.name_kr) out.push([String(r.name_kr).trim(), en])
    }
    return out
  },
  ["lfa-team-en-v2"],
  { revalidate: 3600 }
)

function tokens(s: string): string[] {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      // 3글자 미만은 버린다 — "fc"·"sc" 같은 접미가 서로 다른 팀을 이어붙인다
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
  )
}

/**
 * LFA 축약명과 우리 영문명이 같은 팀인가 — **느슨한 양방향 접두 겹침**.
 *
 * 엄격한 전체 토큰 일치는 실패한다: 양쪽의 축약 방식이 다르다
 * (LFA "M. Hollyhock" vs 우리 "Mito", LFA "Man. City" vs 우리 "Manchester City").
 * 유의미한 토큰이 하나라도 서로의 접두사면 후보로 보고, 최종 확정은 호출부의
 * "정확히 1건" 규칙이 담당한다.
 */
export function teamMatches(lfaName: string, ourEn: string): boolean {
  const a = tokens(lfaName)
  const b = tokens(ourEn)
  if (a.length === 0 || b.length === 0) return false
  return a.some((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)))
}

/* ── 날짜별 경기 목록 (크레딧 절약의 핵심) ── */

/**
 * 날짜별 전 경기 목록. **크레딧 비용의 대부분이 여기서 결정된다** — 캐시 키가 날짜뿐이라
 * 그날 모든 경기·모든 방문자가 이 한 번을 나눠 쓴다. TTL 을 짧게 줄이면 비용이 그대로
 * 배로 뛴다: 5분 → 하루 최대 576회, 1분 → 2,880회. 라이브 중계를 하지 않으므로
 * 5분이면 충분하다 (betman 은 90분 걸린다).
 */
function cachedDayMatches(dateUtc: string, live: boolean) {
  return unstable_cache(
    async () => {
      const data = await lfaFetch<{ matches?: LfaMatch[] }>("matches", {
        date: dateUtc,
        lang: "en",
      })
      // ⚠️ API 실패(null)를 빈 배열로 캐시하면 settled 12시간·live 5분 동안 그날
      //    전 경기의 해석이 통째로 죽는다 (2026-08-20 프로덕션 실사고: 라이브 매치가
      //    "진행 중" 라벨만 남았다). throw 로 캐시를 회피한다 — cachedDetails 의
      //    빈 페이로드 교훈과 같은 병. 성공했는데 정말 경기가 없는 날(matches: [])은
      //    정상 값이라 그대로 캐시한다.
      if (!data) throw new Error("lfa-day-failed")
      return data.matches ?? []
    },
    ["lfa-day", dateUtc, live ? "live" : "settled"],
    { revalidate: live ? 300 : 12 * 3600 }
  )
}

/**
 * 하루치 목록 — **DB 먼저** (2026-08-24).
 *
 * `unstable_cache` 는 배포마다 초기화되는데 이 호출은 913KB·최대 46초라 가장 자주 실패한다.
 * 그리고 이게 비면 경기 해석이 막혀 라인업·스탯·타임라인·불판이 **한꺼번에** 죽는다.
 * 그래서 DB 를 정본 창고로 두고, LFA 는 그 창고를 채우는 쪽으로 역할을 바꾼다.
 * LFA 가 느리거나 죽으면 마지막으로 받은 목록을 쓴다 — 빈 화면보다 낫다.
 */
const getDayMatches = cache(async (dateUtc: string, live: boolean): Promise<LfaMatch[]> => {
  const cached = await readDayMatches(dateUtc, live)
  if (cached && !cached.stale) return cached.matches

  try {
    const fresh = await cachedDayMatches(dateUtc, live)()
    if (fresh.length > 0 || !cached) {
      await writeDayMatches(dateUtc, fresh)
      return fresh
    }
    return cached.matches
  } catch {
    return cached?.matches ?? []
  }
})

function cachedDetails(matchId: string, live: boolean, retryEmpty: boolean) {
  return unstable_cache(
    async () => {
      const d = await lfaFetch<LfaMatchDetails>("live_match_details", {
        match_id: matchId,
        lang: "en",
      })
      // ⚠️ LFA 는 일부 경기의 이벤트·스탯을 FT 후 **몇 시간 뒤에** 채운다. 빈 응답을
      //    6시간 캐시에 박으면 그동안 득점자·스탯이 통째로 사라진 경기 페이지가 된다
      //    (2026-08-19 실사고: 라싱 2:2 비야레알 — 직접 조회하면 이벤트 21건인데 화면은 0).
      //    throw 로 캐시를 회피한다(unstable_cache 는 예외를 캐시하지 않는다) — 채워질
      //    때까지 요청마다 재조회하고, 호출부는 catch 로 fail-open(스코어는 day 목록에서
      //    이미 확보). 리포트 negative-cache 와 같은 교훈이다.
      //    판정은 **이벤트만** 본다 (2026-08-20 실사고 2탄): FT 전환 순간 LFA 가
      //    스탯만 있고 이벤트가 빈 반쪽 페이로드를 주는데, "둘 다 빈 경우"만 걸렀더니
      //    그 반쪽이 6시간 캐시에 박혀 타임라인·득점자가 증발했다. 프로 경기에
      //    이벤트 0(교체 포함)은 존재하지 않는다 — 이벤트가 비면 무조건 미완성이다.
      // ⚠️ 단, 이 재조회에는 **상한이 있어야 한다** (2026-08-23 크레딧 30,100 소진 사고):
      //    LFA 가 끝내 이벤트를 안 채우는 경기(하부 리그·중단 경기)는 이 throw 가 영원히
      //    캐시를 막아 **방문할 때마다 1크레딧**을 태운다. 재조회는 호출부가 준 창
      //    (retryEmpty) 안에서만 하고, 그 밖에서는 빈 응답도 그대로 캐시한다.
      if (!live && retryEmpty && d && (d.events?.length ?? 0) === 0) {
        throw new Error("lfa-details-empty")
      }
      return d
    },
    // v2: 반쪽 페이로드가 이미 박힌 캐시 무효화 (2026-08-20)
    ["lfa-details-v2", matchId, live ? "live" : "settled"],
    // 라이브 60→120초 (2026-08-23 절감): LiveRefresher 도 같은 주기라 화면 체감은
    // 그대로고 크레딧은 절반이 된다. betman 이 90분 걸리는 것에 비하면 여전히 실시간.
    { revalidate: live ? 120 : 6 * 3600 }
  )
}

/* ── 스탯 한글화 ── */

/**
 * LFA 지표명 → 한글. 원문은 터키어 기계번역이라 영어가 이상하다
 * ("PLAYING THE BALL" = 점유율, "Winning a Duo Challenge" = 경합 승리).
 * **목록에 없는 지표는 버린다** — 뜻이 불확실한 것을 지면에 올리지 않는다.
 * 순서가 곧 표시 순서다.
 */
const STAT_LABELS: [string, string][] = [
  ["Goal Expectation (xG)", "기대득점 (xG)"],
  ["PLAYING THE BALL", "점유율"],
  ["Total Shots", "슈팅"],
  ["Accurate Shot", "유효 슈팅"],
  ["corner", "코너킥"],
  ["Receiving the Ball in the Opponent's Penalty Area", "상대 박스 침투"],
  ["Pass Accuracy%", "패스 성공률"],
  ["Foul", "파울"],
  ["Offside", "오프사이드"],
]

/** "%41" → "41%", "2,19" → "2.19" (터키식 소수점 쉼표 + 퍼센트 접두) */
function normalizeStatValue(raw: string): { text: string; num: number | null } {
  const s = String(raw ?? "").trim()
  const pct = s.startsWith("%")
  const body = (pct ? s.slice(1) : s).replace(",", ".")
  const num = Number(body)
  if (!Number.isFinite(num)) return { text: s, num: null }
  return { text: pct ? `${body}%` : body, num }
}

export interface LfaStatRow {
  label: string
  home: string
  away: string
  homeNum: number | null
  awayNum: number | null
}

/**
 * 매치 타임라인 한 건 (2026-08-19 데이터 회수 1차).
 *
 * 종전 "주요 기록"은 골·퇴장만 실었는데, 그건 데이터가 없어서가 아니라 우리가 걸러서였다
 * (실측 8경기: 교체 68·옐로 26·골 12·퇴장 4·자책 2, 어시스트는 골 12중 5건). 팬 패널의
 * 재방문 1순위가 "완전한 타임라인" — 이제 전부 싣는다. 선수 평점·히트맵 제외 정책과 무관.
 */
export interface LfaTimelineEvent {
  minute: string
  side: "home" | "away"
  kind: "goal" | "pen" | "og" | "yellow" | "red" | "sub"
  /** 한글화 시도된 표기 (자책골이면 실축한 상대 팀 선수) */
  player: string
  /** 골 계열 전용 — 도움 */
  assist?: string
  /** sub 전용 — 들어온 선수 (player 가 나간 선수) */
  inPlayer?: string
  /** 골 계열 전용 — 그 시점 스코어 */
  score?: string
}

export interface LfaMatchInfo {
  matchId: string
  /** LFA 기준 종료 여부 — betman 이 늦어도 이건 즉시 참이 된다 */
  finished: boolean
  live: boolean
  /** 진행 중일 때의 경기 분("12", "45+2") — 라이브가 아니면 null (2026-08-20 라이브 매치센터) */
  minute: string | null
  homeScore: number | null
  awayScore: number | null
  /** 전반 스코어 — 경기 서사의 절반 (전반 0-0 과 2-0 은 다른 경기다) */
  htHome: number | null
  htAway: number | null
  stats: LfaStatRow[]
  /** 시간순 전체 타임라인 — 골·어시·카드·교체 */
  timeline: LfaTimelineEvent[]
}

/* ── 득점자 한글화 ── */

/**
 * LFA 득점자명("R. Calafiori")을 그 경기 라인업의 한글 표기로 바꾼다.
 *
 * 콘텐츠는 한글이 원칙이라 영문 이름을 그대로 올릴 수 없다. 근거는 LLM 의 감이 아니라
 * **그 경기의 실제 라인업**이다 (match-extras.ts 의 groundPlayerNames 와 같은 규율).
 * 22명으로 후보가 좁혀지므로 성(姓) 하나로도 거의 유일하게 결정된다
 * (2026-08-16 실측: 40명 중 39명 자동 매칭). 애매하면 원문 유지 — 틀린 한글보다 낫다.
 */
function localizeScorer(lfaName: string, lineup: LineupResponse): string {
  if (lineup.status !== "ready") return lfaName
  const roster = [
    ...lineup.home.starters,
    ...lineup.home.bench,
    ...lineup.away.starters,
    ...lineup.away.bench,
  ]
  // 앞 이니셜("R.")을 떼고 남은 성을 로마자 슬러그 토큰과 대조
  const surname = tokens(lfaName.replace(/^[A-Za-z]\.\s*/, ""))
  if (surname.length === 0) return lfaName
  const hits = roster.filter((p) => {
    const rt = tokens(p.roman ?? "")
    return surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))
  })
  return hits.length === 1 ? hits[0].label : lfaName
}

/** 한글이 섞였나 — 한글화가 실제로 됐는지의 유일한 판정 기준 */
function hasHangul(s: string): boolean {
  return /[가-힣]/.test(s)
}

/** 사전에 등재된 한 팀의 선수 (스쿼드 폴백용) */
interface SquadName {
  nameEn: string
  nameKr: string
}

/**
 * 팀 한글명 → 그 팀 스쿼드의 (영문명, 한글명) — 1시간 캐시.
 * `team_squads.name_en` 은 "성 이름" 순이다 ("Pepe Nicolas").
 */
const cachedSquad = unstable_cache(
  async (teamKr: string): Promise<SquadName[]> => {
    // ⚠️ 정확일치로 찾지 않는다 — betman 표기와 사전 표기가 어긋나면(브라이턴&호브 앨비언 ↔
    //    브라이턴) 그 팀 선수 이름이 통째로 영문으로 남는다 (2026-08-24).
    const teamId = await resolveTeamId(teamKr)
    if (!teamId) return []
    const { data } = await createServiceRoleClient()
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", teamId)
      .not("name_kr", "is", null)
      .neq("status", "rejected")
    return (data ?? []).map((r) => ({ nameEn: String(r.name_en ?? ""), nameKr: String(r.name_kr) }))
  },
  ["lfa-squad-names-v3"],
  { revalidate: 3600 } // 사전이 자주 갱신되는 시기라 짧게 — 이름 수정이 하루 뒤 반영되면 운영이 막힌다
)

/**
 * 라인업 없이 득점자를 한글화한다 — **스쿼드 사전 폴백**.
 *
 * ⚠️ 종전엔 한글화가 라인업에 전적으로 매달려 있었다. 라인업은 경기 20여 시간 뒤 원본에서
 *    사라지므로, 지난 경기를 열면 득점자만 영문으로 남았다 ("N. Pepe") — 라인업이 안 뜨는
 *    것과 득점자가 영문인 것은 **같은 원인**이었다 (2026-08-18 운영자 제보).
 *    스쿼드 사전은 영구 저장이라 시간이 지나도 한글이 유지된다.
 *
 * 팀을 반드시 좁혀서 본다: 같은 성이 양 팀에 있을 수 있다 (이 경기에 게예가 둘 —
 * 비야레알 파페 게예, 라싱 마게테 게예). 이니셜이 오면 이름 첫 글자로 한 번 더 거른다.
 */
function localizeFromSquad(lfaName: string, squad: SquadName[]): string {
  if (squad.length === 0) return lfaName
  const initial = lfaName.match(/^([A-Za-z])\.\s*/)?.[1]?.toLowerCase() ?? null
  const surname = tokens(lfaName.replace(/^[A-Za-z]\.\s*/, ""))
  if (surname.length === 0) return lfaName

  const hits = squad.filter((p) => {
    const rt = tokens(p.nameEn)
    if (!surname.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))) {
      return false
    }
    if (!initial) return true
    // 성 토큰이 아닌 나머지(=이름) 중 하나가 이니셜로 시작해야 한다
    const rest = rt.filter(
      (u) => !surname.some((t) => u === t || u.startsWith(t) || t.startsWith(u))
    )
    return rest.length === 0 || rest.some((u) => u.startsWith(initial))
  })
  return hits.length === 1 ? hits[0].nameKr : lfaName
}

/* ── 본체 ── */

interface BetmanGameKey {
  /** betman_games.id — 라인업 조회(득점자 한글화)에 쓴다 */
  gameId: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  leagueCode: string
}

/** 킥오프 UTC 날짜 (LFA 의 date 파라미터는 UTC 기준이다) */
function utcDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

async function resolveMatch(game: BetmanGameKey): Promise<LfaMatch | null> {
  const leagueId = lfaLeagueId(game.leagueCode)
  if (!leagueId) return null

  // 킥오프 시각으로 진행 중일 법한지 판단해 캐시 주기를 고른다 (킥오프 ~ +3h)
  const ko = new Date(game.matchTime).getTime()
  const now = Date.now()
  const live = now >= ko && now <= ko + 3 * 3600_000

  const all = await getDayMatches(utcDate(game.matchTime), live)
  const inLeague = all.filter((m) => m.league?.id === leagueId)
  if (inLeague.length === 0) return null

  // ① 킥오프 시각(UTC HH:MM)이 가장 강한 신호다 — 팀명 표기 차이를 타지 않는다.
  //    (2026-08-16 실측: 매치 페이지 대상 리그 10경기 전부 이 단계에서 확정)
  const hhmm = new Date(game.matchTime).toISOString().slice(11, 16)
  const sameTime = inLeague.filter((m) => m.kickoff === hhmm)
  if (sameTime.length === 1) return sameTime[0]

  // ② 같은 시각에 여러 경기(리그 라운드 동시 킥오프)면 팀명으로 좁힌다.
  //    시각이 아예 안 맞으면(양쪽 일정 편차) 리그 전체를 후보로 둔다.
  const dict = new Map(await cachedTeamEn())
  const homeEn = dict.get(game.homeTeam.trim()) ?? game.homeTeam
  const awayEn = dict.get(game.awayTeam.trim()) ?? game.awayTeam
  const pool = sameTime.length > 0 ? sameTime : inLeague
  const hits = pool.filter(
    (m) => teamMatches(m.home?.name ?? "", homeEn) && teamMatches(m.away?.name ?? "", awayEn)
  )
  // 정확히 1건일 때만 — 애매하면 붙이지 않는다 (남의 경기 스코어가 최악)
  return hits.length === 1 ? hits[0] : null
}

/* ── 일정 페이지용 하루치 색인 ── */

export interface LfaDayEntry {
  finished: boolean
  homeScore: number | null
  awayScore: number | null
}

/** (리그id|킥오프 UTC HH:MM) — 일정 페이지는 이 키로 조인한다 */
function dayKey(leagueId: string, hhmm: string): string {
  return `${leagueId}|${hhmm}`
}

/**
 * KST 달력 하루의 LFA 스코어 색인.
 *
 * KST 하루는 UTC 두 날짜에 걸치므로 `/matches?date=` 를 최대 2회 부른다 — 그 2회가
 * 그날 **모든 경기**를 덮는다 (경기별 호출이면 20~30회가 됐을 것). 캐시 TTL 은 지난
 * 날짜면 12시간, 오늘·미래면 5분. 라이브 중계를 하지 않으므로 분 단위 갱신이 필요 없다.
 *
 * ⚠️ 호출부는 betman 이 이미 정산한 날에는 이 함수를 부르지 말 것 — 크레딧이 나간다.
 */
export async function getLfaDayIndex(dateKst: string): Promise<Map<string, LfaDayEntry>> {
  const index = new Map<string, LfaDayEntry>()
  try {
    const startMs = new Date(`${dateKst}T00:00:00+09:00`).getTime()
    if (!Number.isFinite(startMs)) return index
    const endMs = startMs + 24 * 3600_000
    const dates = new Set([
      new Date(startMs).toISOString().slice(0, 10),
      new Date(endMs - 1).toISOString().slice(0, 10),
    ])
    // 이미 다 지난 날이면 값이 굳었으므로 길게 캐시한다
    const elapsed = Date.now() > endMs

    for (const d of dates) {
      const matches = await getDayMatches(d, !elapsed)
      for (const m of matches) {
        const lid = m.league?.id
        const ko = m.kickoff
        if (!lid || !ko) continue
        const toNum = (v: string | null | undefined) => {
          const n = Number(v)
          return v != null && v !== "" && Number.isFinite(n) ? n : null
        }
        index.set(dayKey(lid, ko), {
          finished: m.status?.state === "postGame" || m.status?.display === "FT",
          homeScore: toNum(m.home?.score),
          awayScore: toNum(m.away?.score),
        })
      }
    }
  } catch {
    // fail-open — 색인이 비면 호출부가 betman 값을 그대로 쓴다
  }
  return index
}

/** betman 경기에 대응하는 색인 항목 (리그 매핑 + 킥오프 시각으로 조인) */
export function lookupLfaDayEntry(
  index: Map<string, LfaDayEntry>,
  game: { leagueCode: string; matchTime: string }
): LfaDayEntry | null {
  const lid = lfaLeagueId(game.leagueCode)
  if (!lid) return null
  const hhmm = new Date(game.matchTime).toISOString().slice(11, 16)
  return index.get(dayKey(lid, hhmm)) ?? null
}

/**
 * betman 경기의 LFA 스코어·스탯. 해석 실패·API 장애는 전부 null (fail-open).
 * 상세(스탯)는 경기가 시작된 뒤에만 부른다 — 예정 경기에 크레딧을 쓰지 않는다.
 */
export async function getLfaMatchInfo(game: BetmanGameKey): Promise<LfaMatchInfo | null> {
  // ① 우리 DB 먼저 (2026-08-24). 신선하면 그대로 — 외부 API 를 아예 안 부른다.
  //    화면이 LFA 의 그날 컨디션에 매달려 있던 것이 "데이터가 제때 안 뜬다" 의 정체였다.
  const cached = await readMatchDetails(game.gameId)
  if (cached && !cached.stale) return cached.info

  try {
    const fresh = await computeLfaMatchInfo(game)
    if (fresh) {
      await writeMatchDetails(game.gameId, fresh)
      return fresh
    }
    // ② LFA 가 못 줬으면 **낡은 값이라도** 내준다 — 빈 화면보다 낫다
    return cached?.info ?? null
  } catch {
    return cached?.info ?? null
  }
}

/** 실제 LFA 조회 — 위 캐시 계층이 미스일 때만 탄다 */
async function computeLfaMatchInfo(game: BetmanGameKey): Promise<LfaMatchInfo | null> {
  try {
    const m = await resolveMatch(game)
    if (!m) return null

    const state = m.status?.state ?? ""
    const live = m.status?.is_live === true
    const finished = state === "postGame" || m.status?.display === "FT"
    const toNum = (v: string | null | undefined) => {
      const n = Number(v)
      return v != null && v !== "" && Number.isFinite(n) ? n : null
    }

    const info: LfaMatchInfo = {
      matchId: m.id,
      finished,
      live,
      minute: null,
      homeScore: toNum(m.home?.score),
      awayScore: toNum(m.away?.score),
      htHome: Number.isFinite(m.halftime?.home) ? (m.halftime!.home as number) : null,
      htAway: Number.isFinite(m.halftime?.away) ? (m.halftime!.away as number) : null,
      stats: [],
      timeline: [],
    }

    // 킥오프 전이면 상세를 부르지 않는다 (크레딧 절약)
    if (!live && !finished) return info

    // 빈 페이로드 throw(위 cachedDetails 주석)를 fail-open 으로 받는다 — 스코어는 이미 있다.
    // 재조회 창 = 킥오프 후 6시간까지 (LFA 가 몇 시간 뒤 채우는 경우를 덮되, 끝내 안 채우는
    // 경기가 크레딧을 무한히 태우는 것은 막는다 — 2026-08-23 소진 사고)
    const kickoffMs = new Date(game.matchTime).getTime()
    const retryEmpty = Number.isFinite(kickoffMs) && Date.now() - kickoffMs < 6 * 3600_000
    const d = await cachedDetails(m.id, live, retryEmpty)().catch(() => null)
    if (!d) return info

    if (live) {
      // 경기 분 + 상세의 최신 스코어 — day 목록(5분 캐시)보다 상세(60초 캐시)가 새롭다.
      // 라이브 중 골이 day 목록에 늦게 반영되어 스코어가 뒷걸음치는 것을 막는다.
      info.minute = d.header?.status?.minute?.trim() || null
      const dh = toNum(d.header?.home?.score)
      const da = toNum(d.header?.away?.score)
      if (dh != null) info.homeScore = dh
      if (da != null) info.awayScore = da
    }

    for (const [en, ko] of STAT_LABELS) {
      const s = d.stats?.find((x) => x.label === en)
      if (!s) continue
      const h = normalizeStatValue(s.home)
      const a = normalizeStatValue(s.away)
      info.stats.push({ label: ko, home: h.text, away: a.text, homeNum: h.num, awayNum: a.num })
    }

    // ⚠️ LFA 이벤트 타입은 표기가 섞인다 — 실측: "Goal"(대문자·공백) 과 "red_card"
    //    (소문자·언더스코어)가 같은 응답에 함께 온다. 반드시 정규화하고 비교할 것.
    const norm = (t: unknown) =>
      String(t ?? "")
        .toLowerCase()
        .replace(/_/g, " ")
        .trim()
    const kindOf = (t: string): LfaTimelineEvent["kind"] | null => {
      if (t === "goal") return "goal"
      if (t === "penalty" || t.includes("penalty goal")) return "pen"
      if (t === "own goal") return "og"
      if (t === "yellow card") return "yellow"
      // 다이렉트 퇴장과 경고 누적 퇴장 둘 다 퇴장이다
      if (t.includes("red card") || t.includes("second yellow")) return "red"
      if (t === "substitution") return "sub"
      return null // VAR 등 — 뜻이 불확실한 이벤트는 싣지 않는다
    }

    const rawEvents = (d.events ?? [])
      .map((e) => ({ e, kind: kindOf(norm(e.type)) }))
      .filter(
        (x): x is { e: (typeof d.events)[number]; kind: LfaTimelineEvent["kind"] } =>
          x.kind !== null
      )
    // 라인업은 실을 사건이 있을 때만 부른다 (없으면 한글화할 대상도 없다)
    const lineup: LineupResponse = rawEvents.length
      ? await getLineupForGame(game.gameId).catch(() => ({ status: "none" }) as LineupResponse)
      : { status: "none" }

    // 라인업이 없어도(=지난 경기) 스쿼드 사전으로 한글화한다. 사건이 있을 때만 부른다.
    const [homeSquad, awaySquad] = rawEvents.length
      ? await Promise.all([cachedSquad(game.homeTeam), cachedSquad(game.awayTeam)])
      : [[], []]

    // 이름 한글화 한 사람분 — 라인업 라벨 → 스쿼드 사전 폴백.
    // ⚠️ 판정 기준은 "값이 바뀌었나" 가 아니라 **한글이 됐나** 다 (2026-08-18 실사고:
    //    라인업이 로마자 라벨을 돌려주면 바뀐 걸로 착각해 폴백을 건너뛰었다).
    const localizeName = (raw: string | undefined, side: "home" | "away"): string | null => {
      const name = raw?.trim()
      if (!name) return null
      const fromLineup = localizeScorer(name, lineup)
      if (hasHangul(fromLineup)) return fromLineup
      const squad = side === "away" ? awaySquad : homeSquad
      for (const candidate of [name, fromLineup]) {
        const ko = localizeFromSquad(candidate, squad)
        if (hasHangul(ko)) return ko
      }
      return fromLineup
    }

    for (const { e, kind } of rawEvents) {
      const minute = String(e.time ?? "")
      if (kind === "sub") {
        // player = 나간 선수(out), inPlayer = 들어온 선수 — 실측: 둘 다 이름이 온다
        const out = localizeName(e.detail?.out?.name, e.side)
        const inp = localizeName(e.detail?.in?.name, e.side)
        if (!out && !inp) continue
        info.timeline.push({
          minute,
          side: e.side,
          kind,
          player: out ?? "",
          ...(inp ? { inPlayer: inp } : {}),
        })
        continue
      }
      // ⚠️ 자책골의 실축 선수는 **상대 팀** 로스터에 있다 (side 는 득점이 오른 팀)
      const playerSide = kind === "og" ? (e.side === "home" ? "away" : "home") : e.side
      const player = localizeName(e.detail?.player?.name, playerSide)
      if (!player) continue
      const assist =
        kind === "goal" || kind === "pen" ? localizeName(e.detail?.assist?.name, e.side) : null
      info.timeline.push({
        minute,
        side: e.side,
        kind,
        player,
        ...(assist ? { assist } : {}),
        ...(kind === "goal" || kind === "pen" || kind === "og"
          ? { score: e.detail?.score ?? "" }
          : {}),
      })
    }

    return info
  } catch {
    return null
  }
}

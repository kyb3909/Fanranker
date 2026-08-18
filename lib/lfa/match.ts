import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import { lfaFetch, type LfaMatch, type LfaMatchDetails } from "@/lib/lfa/client"
import { getLineupForGame, type LineupResponse } from "@/lib/soccerway/lineup-lookup"

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

/** betman 한글 팀명 → 영문명 (team_dictionary, 1h 캐시) */
const cachedTeamEn = unstable_cache(
  async (): Promise<[string, string][]> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("name_kr, aliases_kr, name_en")
      .neq("status", "rejected")
    const out: [string, string][] = []
    for (const r of data ?? []) {
      const en = String(r.name_en ?? "").trim()
      if (!en) continue
      if (r.name_kr) out.push([String(r.name_kr).trim(), en])
      for (const a of (r.aliases_kr as string[] | null) ?? []) {
        if (a) out.push([String(a).trim(), en])
      }
    }
    return out
  },
  ["lfa-team-en"],
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
function teamMatches(lfaName: string, ourEn: string): boolean {
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
      return data?.matches ?? []
    },
    ["lfa-day", dateUtc, live ? "live" : "settled"],
    { revalidate: live ? 300 : 12 * 3600 }
  )
}

function cachedDetails(matchId: string, live: boolean) {
  return unstable_cache(
    async () => lfaFetch<LfaMatchDetails>("live_match_details", { match_id: matchId, lang: "en" }),
    ["lfa-details", matchId, live ? "live" : "settled"],
    { revalidate: live ? 60 : 6 * 3600 }
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

export interface LfaMatchInfo {
  matchId: string
  /** LFA 기준 종료 여부 — betman 이 늦어도 이건 즉시 참이 된다 */
  finished: boolean
  live: boolean
  homeScore: number | null
  awayScore: number | null
  stats: LfaStatRow[]
  /** 득점 (교체는 LFA 가 선수명을 안 줘서 제외) */
  goals: { minute: string; side: "home" | "away"; player: string; score: string }[]
  /** 퇴장 — 몇 분에 나갔는지가 경기 해석의 핵심이라 따로 싣는다 (2026-08-17 운영자) */
  reds: { minute: string; side: "home" | "away"; player: string }[]
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
 * 팀 한글명 → 그 팀 스쿼드의 (영문명, 한글명) — 6시간 캐시.
 * `team_squads.name_en` 은 "성 이름" 순이다 ("Pepe Nicolas").
 */
const cachedSquad = unstable_cache(
  async (teamKr: string): Promise<SquadName[]> => {
    const supabase = createServiceRoleClient()
    const { data: team } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id")
      .eq("name_kr", teamKr)
      .maybeSingle()
    if (!team) return []
    const { data } = await supabase
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", team.soccerway_team_id)
      .not("name_kr", "is", null)
      .neq("status", "rejected")
    return (data ?? []).map((r) => ({ nameEn: String(r.name_en ?? ""), nameKr: String(r.name_kr) }))
  },
  ["lfa-squad-names"],
  { revalidate: 21600 }
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

  const all = await cachedDayMatches(utcDate(game.matchTime), live)()
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
      const matches = await cachedDayMatches(d, !elapsed)()
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
      homeScore: toNum(m.home?.score),
      awayScore: toNum(m.away?.score),
      stats: [],
      goals: [],
      reds: [],
    }

    // 킥오프 전이면 상세를 부르지 않는다 (크레딧 절약)
    if (!live && !finished) return info

    const d = await cachedDetails(m.id, live)()
    if (!d) return info

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
    const isGoal = (t: string) => t === "goal" || t === "own goal" || t === "penalty"
    // 다이렉트 퇴장과 경고 누적 퇴장 둘 다 퇴장이다
    const isRed = (t: string) => t.includes("red card") || t.includes("second yellow")

    const rawEvents = (d.events ?? []).filter((e) => {
      const t = norm(e.type)
      return isGoal(t) || isRed(t)
    })
    // 라인업은 실을 사건이 있을 때만 부른다 (없으면 한글화할 대상도 없다)
    const lineup: LineupResponse = rawEvents.length
      ? await getLineupForGame(game.gameId).catch(() => ({ status: "none" }) as LineupResponse)
      : { status: "none" }

    // 라인업이 없어도(=지난 경기) 스쿼드 사전으로 한글화한다. 사건이 있을 때만 부른다.
    const [homeSquad, awaySquad] = rawEvents.length
      ? await Promise.all([cachedSquad(game.homeTeam), cachedSquad(game.awayTeam)])
      : [[], []]

    for (const e of rawEvents) {
      const player = e.detail?.player?.name?.trim()
      if (!player) continue
      const t = norm(e.type)
      const minute = String(e.time ?? "")
      // ⚠️ 판정 기준은 "값이 바뀌었나" 가 아니라 **한글이 됐나** 다.
      //    라인업 경로는 사전에 없는 선수에게 로마자 라벨을 돌려준다 — LFA 의 "P. Aubameyang"
      //    이 라인업 라벨 "Aubameyang P." 로 바뀌기만 하고 영문 그대로였는데, 바뀌었다는
      //    이유로 스쿼드 폴백을 건너뛰어 영문이 남았다 (2026-08-18 실측).
      const fromLineup = localizeScorer(player, lineup)
      const squad = e.side === "away" ? awaySquad : homeSquad
      let label = fromLineup
      if (!hasHangul(label)) {
        // 원문(LFA)과 라인업 라벨은 이니셜 위치가 서로 다르다 — 둘 다 시도한다
        for (const candidate of [player, fromLineup]) {
          const ko = localizeFromSquad(candidate, squad)
          if (hasHangul(ko)) {
            label = ko
            break
          }
        }
      }
      if (isGoal(t)) {
        info.goals.push({ minute, side: e.side, player: label, score: e.detail?.score ?? "" })
      } else {
        info.reds.push({ minute, side: e.side, player: label })
      }
    }

    return info
  } catch {
    return null
  }
}

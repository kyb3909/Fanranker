import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaLeagueId } from "@/lib/lfa/leagues"
import { lfaFetch, type LfaMatch, type LfaMatchDetails } from "@/lib/lfa/client"
import { getLfaLineup } from "@/lib/lfa/lineups"
import { loadStoredLfaLineup } from "@/lib/match/lineup-store"
import { matchLfaCounterpart } from "@/lib/match/pair-fixtures"
import { hasHangul, localizeFromSquad, localizeTimelineName } from "@/lib/lfa/scorer-name"

// 종전 공개 API 유지 — 판정 자체는 순수 모듈이 소유한다 (2026-08-30)
export { teamMatches } from "@/lib/match/pair-fixtures"
import {
  readDayMatches,
  readMatchDetails,
  writeDayMatches,
  writeMatchDetails,
} from "@/lib/lfa/persist"
import { withinBuyWindow } from "@/lib/lfa/day-freshness"
import { mapLfaStats } from "@/lib/lfa/stat-labels"
import { reportStatCoverageGap } from "@/lib/lfa/stat-coverage-notice"
import { resolveTeamId } from "@/lib/match/resolve-team-id"
import { getSupplementalFixture } from "@/lib/match/supplemental-fixtures"
import { isLfaFinishedStatus } from "@/lib/lfa/status"

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

/**
 * LFA 축약명과 우리 영문명이 같은 팀인가 — **느슨한 양방향 접두 겹침**.
 *
 * 엄격한 전체 토큰 일치는 실패한다: 양쪽의 축약 방식이 다르다
 * (LFA "M. Hollyhock" vs 우리 "Mito", LFA "Man. City" vs 우리 "Manchester City").
 * 유의미한 토큰이 하나라도 서로의 접두사면 후보로 보고, 최종 확정은 호출부의
 * "정확히 1건" 규칙이 담당한다.
 */

/* ── 날짜별 경기 목록 (크레딧 절약의 핵심) ── */

/**
 * 날짜별 전 경기 목록. **크레딧 비용의 대부분이 여기서 결정된다** — 캐시 키가 날짜뿐이라
 * 그날 모든 경기·모든 방문자가 이 한 번을 나눠 쓴다. TTL 을 짧게 줄이면 비용이 그대로
 * 배로 뛴다: 5분 → 하루 최대 576회, 1분 → 2,880회. 라이브 중계를 하지 않으므로
 * 5분이면 충분하다 (betman 은 90분 걸린다).
 */
function cachedDayMatches(dateUtc: string) {
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
      return { matches: data.matches ?? [], updatedAt: Date.now() }
    },
    ["lfa-day-v2", dateUtc],
    // 끝난 날짜의 재구매 중단은 DB 신선도 정책이 담당한다. false 호출로 12시간 굳히지 않는다.
    { revalidate: 300 }
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
const getDaySnapshot = cache(async (dateUtc: string, live: boolean) => {
  const cached = await readDayMatches(dateUtc, live)
  if (cached && !cached.stale) return cached

  // ⚠️⚠️ 살 수 있는 날짜에 **울타리**를 친다 (2026-08-25 크레딧 화재).
  //
  //    `/matches?date=` 가 형식만 맞으면 아무 날짜나 받았고, 그 페이지엔 이전/다음날
  //    화살표가 있다 — 크롤러에겐 무한 링크 공간이다. 실측: lfa_day_cache 에 2003~2047 년
  //    9,466일이 쌓였고 matches 호출이 2시간에 1,742건(하루 ~21,000크레딧, 평소의 32배).
  //    창 밖 날짜는 **사지 않는다**. 이미 산 게 있으면 그대로 주고, 없으면 빈 목록이다.
  //    (읽기는 위에서 이미 끝났으므로 캐시 히트는 여기 안 온다.)
  const fallback = cached ?? { matches: [] as LfaMatch[], updatedAt: 0 }
  if (!withinBuyWindow(dateUtc)) return fallback

  try {
    const fresh = await cachedDayMatches(dateUtc)()
    if (cached && fresh.updatedAt <= cached.updatedAt) return cached
    if (fresh.matches.length > 0 || !cached) {
      await writeDayMatches(dateUtc, fresh.matches, fresh.updatedAt)
      return fresh
    }
    return cached
  } catch {
    return fallback
  }
})

export const getDayMatches = cache(
  async (dateUtc: string, live: boolean): Promise<LfaMatch[]> =>
    (await getDaySnapshot(dateUtc, live)).matches
)

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
      if (!d) throw new Error("lfa-details-failed")
      return { details: d, updatedAt: Date.now() }
    },
    // v3: 원본 수집 시각을 함께 캐시한다. 재시도 창 여부도 키에 포함한다.
    ["lfa-details-v3", matchId, live ? "live" : "settled", String(retryEmpty)],
    // 라이브 60→120초 (2026-08-23 절감): LiveRefresher 도 같은 주기라 화면 체감은
    // 그대로고 크레딧은 절반이 된다. betman 이 90분 걸리는 것에 비하면 여전히 실시간.
    { revalidate: live ? 120 : 6 * 3600 }
  )
}

/* ── 스탯 한글화 ── */
/* 스탯 표·대조 규칙은 lib/lfa/stat-labels.ts (순수 모듈 — 시험 가능) */

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
  playerId?: string
  inPlayerId?: string
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
  /** 원본을 실제로 받은 시각. SWR 재조회로 DB 신선도를 연장하지 않는다. */
  sourceUpdatedAt?: number
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

export async function resolveLfaMatch(
  game: BetmanGameKey
): Promise<(LfaMatch & { sourceUpdatedAt: number }) | null> {
  const leagueId = lfaLeagueId(game.leagueCode)
  if (!leagueId) return null

  // 킥오프 시각으로 진행 중일 법한지 판단해 캐시 주기를 고른다 (킥오프 ~ +3h)
  const ko = new Date(game.matchTime).getTime()
  const now = Date.now()
  const live = now >= ko && now <= ko + 3 * 3600_000

  const snapshot = await getDaySnapshot(utcDate(game.matchTime), live)
  const all = snapshot.matches.map((m) => ({ ...m, sourceUpdatedAt: snapshot.updatedAt }))
  const inLeague = all.filter((m) => m.league?.id === leagueId)
  if (inLeague.length === 0) return null

  // LFA-only fixtures already have a provider identity. Never re-match their translated names.
  const supplemental = await getSupplementalFixture(game.gameId).catch(() => null)
  if (supplemental) return inLeague.find((m) => m.id === supplemental.lfa_match_id) ?? null

  const dict = new Map(await cachedTeamEn())
  // 일정 목록과 동일한 결정기를 사용한다. 시간이 바뀐 경기는 자동으로 범위를 넓히지 않는다.
  const decision = matchLfaCounterpart(
    game,
    inLeague.map((m) => ({
      homeTeam: m.home?.name ?? "",
      awayTeam: m.away?.name ?? "",
      leagueCode: game.leagueCode,
      matchTime: `${utcDate(game.matchTime)}T${m.kickoff}:00Z`,
      match: m,
    })),
    dict
  )
  return decision.candidate?.match ?? null
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

    /**
     * ⚠️⚠️ 같은 키에 경기가 둘 이상이면 **그 키는 버린다** (2026-09-02 실사고).
     *
     * 키가 (리그, 킥오프 HH:MM) 뿐이라 토요일 23:00 EPL 처럼 동시 킥오프가 흔한 슬롯에서는
     * 마지막에 쓴 경기 하나가 그 슬롯 전체를 대표했다. 8/30 22:00 KST EPL 3경기 —
     * 첼시 4-3 브라이턴, 리즈 1-1 브렌트퍼드가 둘 다 **선덜랜드 1-0 풀럼**의 점수를 받았다.
     * 결과 대조기는 그걸 "불일치"로 찍어 첼시 당첨 슬립을 63시간 얼렸고, 리포트
     * 파이프라인은 같은 점수로 스코어 접지에 실패해 첼시·인테르 리포트를 못 썼다.
     * 4일간 mismatch 45건 중 35건이 이 충돌이었다.
     *
     * 모호한 키는 null 을 돌려주는 게 맞다 — "모른다"는 "틀린 값"보다 언제나 낫다.
     * 경기 단위 정확한 값은 match_details_cache(경기별 LFA id) 가 들고 있으니 호출부는
     * 그쪽을 먼저 보고 색인은 폴백으로만 쓴다.
     */
    const seen = new Map<string, number>()
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
        const key = dayKey(lid, ko)
        seen.set(key, (seen.get(key) ?? 0) + 1)
        index.set(key, {
          finished: isLfaFinishedStatus(m.status),
          homeScore: toNum(m.home?.score),
          awayScore: toNum(m.away?.score),
        })
      }
    }
    for (const [key, n] of seen) if (n > 1) index.delete(key)
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
  const cached = await readMatchDetails(game.gameId, game.matchTime)
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
    const m = await resolveLfaMatch(game)
    if (!m) return null

    const live = m.status?.is_live === true
    const finished = isLfaFinishedStatus(m.status)
    const toNum = (v: string | null | undefined) => {
      const n = Number(v)
      return v != null && v !== "" && Number.isFinite(n) ? n : null
    }

    const info: LfaMatchInfo = {
      matchId: m.id,
      sourceUpdatedAt: m.sourceUpdatedAt,
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

    // 목록의 live 전환이 늦더라도 킥오프 이후의 상세는 조회한다. 예열 전에는 사지 않는다.
    const kickoffMs = new Date(game.matchTime).getTime()
    const inMatchWindow = Date.now() >= kickoffMs && Date.now() <= kickoffMs + 3.5 * 3600_000
    if (!live && !finished && !inMatchWindow) return info

    // 빈 페이로드 throw(위 cachedDetails 주석)를 fail-open 으로 받는다 — 스코어는 이미 있다.
    // 재조회 창 = 킥오프 후 6시간까지 (LFA 가 몇 시간 뒤 채우는 경우를 덮되, 끝내 안 채우는
    // 경기가 크레딧을 무한히 태우는 것은 막는다 — 2026-08-23 소진 사고)
    const retryEmpty = Number.isFinite(kickoffMs) && Date.now() - kickoffMs < 6 * 3600_000
    const detailSnapshot = await cachedDetails(
      m.id,
      !finished && (live || inMatchWindow),
      retryEmpty
    )().catch(() => null)
    if (!detailSnapshot) return info
    const d = detailSnapshot.details
    info.sourceUpdatedAt = Math.min(m.sourceUpdatedAt, detailSnapshot.updatedAt)

    // 목록/상세 중 실제로 더 최근에 받은 출처를 쓴다. 최대값 병합은 VAR 취소를 복구할 수 없다.
    // 홈/원정을 한 쌍으로 옮겨 서로 다른 시점의 점수를 합성하지 않는다.
    if (detailSnapshot.updatedAt >= m.sourceUpdatedAt) {
      const detailStatus = d.header?.status
      if (isLfaFinishedStatus(detailStatus)) {
        info.finished = true
        info.live = false
      } else if (!info.finished && detailStatus?.is_live === true) {
        info.live = true
      }
      const dh = toNum(d.header?.home?.score)
      const da = toNum(d.header?.away?.score)
      if (dh != null && da != null) {
        info.homeScore = dh
        info.awayScore = da
      }
    }
    if (info.live) info.minute = d.header?.status?.minute?.trim() || null

    const mapped = mapLfaStats(d.stats ?? null)
    info.stats.push(...mapped.rows)

    /**
     * ⚠️ 조용히 죽지 않게 한다. 이 사고의 본질은 "라벨이 바뀐 것"이 아니라
     *    **바뀐 걸 아무도 몰랐다는 것**이다 — 지면에 슈팅 한 줄만 뜬 채로 하루가 갔다.
     *    LFA 가 스탯을 넉넉히 줬는데 우리가 거의 못 알아보면 못 알아본 라벨을 남긴다.
     */
    const given = d.stats?.length ?? 0
    await reportStatCoverageGap(m.id, given, mapped.rows.length, mapped.unknown).catch(() => {})

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
    const storedLineup = rawEvents.length
      ? await loadStoredLfaLineup(game.gameId, m.id).catch(() => null)
      : null
    const lineup =
      storedLineup?.status === "ready"
        ? storedLineup
        : rawEvents.length
          ? await getLfaLineup(m.id, game.homeTeam, game.awayTeam).catch(() => null)
          : null

    // 라인업이 없어도(=지난 경기) 스쿼드 사전으로 한글화한다. 사건이 있을 때만 부른다.
    const [homeSquad, awaySquad] = rawEvents.length
      ? await Promise.all([cachedSquad(game.homeTeam), cachedSquad(game.awayTeam)])
      : [[], []]

    // 이름 한글화 한 사람분 — 판정은 순수 모듈이 소유한다 (백필 CLI 가 같은 규칙을 쓴다)
    const roster = lineup
      ? [
          ...lineup.home.starters,
          ...lineup.home.bench,
          ...lineup.away.starters,
          ...lineup.away.bench,
        ]
      : []
    const localizeName = (raw: string | undefined, side: "home" | "away"): string | null =>
      localizeTimelineName(raw, roster, side === "away" ? awaySquad : homeSquad)

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
          ...(e.detail?.out?.id ? { playerId: e.detail.out.id } : {}),
          ...(e.detail?.in?.id ? { inPlayerId: e.detail.in.id } : {}),
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
        ...(e.detail?.player?.id ? { playerId: e.detail.player.id } : {}),
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

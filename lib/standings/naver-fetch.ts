/**
 * 네이버 스포츠 순위표 api-gw fetch/파싱 (2026-08-06, gauntlet R9 / 단계 0-2)
 *
 * 원래 scripts/standings-scraper.ts 내부 함수였던 것을 Vercel cron
 * (app/api/cron/standings-refresh)과 공유하기 위해 추출. Playwright 불필요 —
 * 순수 fetch. 스크립트와 cron 이 같은 파서를 쓰므로 응답 포맷이 바뀌면 한 곳만 고친다.
 */

const NAVER_API = "https://api-gw.sports.naver.com"

const HEADERS = {
  Accept: "application/json",
  "Accept-Language": "ko-KR,ko;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
  Referer: "https://m.sports.naver.com/",
}

type StandingsRow = Record<string, string | number>

/** 네이버 API에서 해당 리그의 현재 시즌 코드 조회 (isDefault 우선, 없으면 마지막=최신) */
export async function fetchCurrentSeasonCode(categoryId: string): Promise<string | null> {
  const url = `${NAVER_API}/statistics/categories/${categoryId}/seasons`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: { seasons?: { seasonCode: string; isDefault: boolean }[] }
    }
    const seasons = json?.result?.seasons
    if (!Array.isArray(seasons) || seasons.length === 0) return null
    const def = seasons.find((s) => s.isDefault)
    if (def) return def.seasonCode
    return seasons[seasons.length - 1]?.seasonCode ?? null
  } catch {
    return null
  }
}

/** 네이버 API에서 팀 순위 데이터 조회 */
export async function fetchTeamsStandings(
  categoryId: string,
  seasonCode: string
): Promise<StandingsRow[]> {
  const url = `${NAVER_API}/statistics/categories/${categoryId}/seasons/${seasonCode}/teams`
  try {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) {
      console.error(`[standings] teams API ${res.status}: ${url}`)
      return []
    }
    const json = (await res.json()) as unknown
    return parseTeamsResponse(json)
  } catch (e) {
    console.error(`[standings] teams fetch 실패: ${url} — ${e}`)
    return []
  }
}

/** api-gw 응답 → standings_cache.data 행 포맷 (한글 키 — 위젯 렌더러 계약) */
export function parseTeamsResponse(data: unknown): StandingsRow[] {
  if (!data || typeof data !== "object") return []
  const o = data as Record<string, unknown>
  const result = o.result as Record<string, unknown> | undefined

  const arr =
    (result?.seasonTeamStats as unknown[]) ??
    (result?.teams as unknown[]) ??
    (result?.teamRank as unknown[]) ??
    (o.teams as unknown[]) ??
    (o.list as unknown[]) ??
    []

  if (!Array.isArray(arr) || arr.length === 0) return []

  return arr
    .map((row: unknown) => {
      if (!row || typeof row !== "object") return null
      const r = row as Record<string, unknown>
      const teamName = String(
        r.teamName ?? r.name ?? r.team ?? r.clubName ?? r.teamFullName ?? r.teamShortName ?? ""
      )
      const played =
        Number(r.matchesPlayed ?? r.played ?? r.gameCount ?? r.gp ?? r.playedGames ?? 0) || 0
      const points = Number(r.points ?? r.pts ?? r.point ?? 0) || 0
      const gd = Number(r.goalsDifference ?? r.goalDifference ?? r.goalDiff ?? r.gd ?? 0) || 0
      const wins = Number(r.wins ?? r.win ?? r.winGameCount ?? r.w ?? 0) || 0
      const losses = Number(r.losses ?? r.lose ?? r.loseGameCount ?? r.loss ?? r.l ?? 0) || 0
      const draws = Number(r.draws ?? r.draw ?? r.drawnGameCount ?? r.d ?? 0) || 0
      const group = String(r.conf ?? r.league ?? "")
      const division = String(r.division ?? "")
      if (!teamName) return null
      const out: StandingsRow = {
        팀명: teamName,
        경기: played,
        승점: points,
        골득실: gd,
        승: wins,
        패: losses,
        무: draws,
      }
      if (group) out.group = group
      if (division && division !== "null") out.division = division
      return out
    })
    .filter((row): row is StandingsRow => row !== null)
}

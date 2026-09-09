import "server-only"
import { createHash, randomUUID } from "node:crypto"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch } from "@/lib/lfa/client"
import { resolveTeamId } from "@/lib/match/resolve-team-id"
import { localizePlayerName, tidyFeedName, type SquadName } from "./player-name"
// 응답 모양 해석은 순수 모듈이 소유한다 — 필드명 오독이 이 기능을 통째로 죽였다 (2026-08-31)
import { normalizeLfaLineups, type LfaRawPlayer } from "./lineup-shape"

// 이 모듈로 쓰던 곳이 많다 — 순수 모듈로 옮기면서 import 경로는 유지한다
export { localizePlayerName, tidyFeedName, type SquadName }

/**
 * live-football-api 라인업 (2026-08-18 운영자: "라인업도 없고 서비스가 일관성이 없다").
 *
 * 경기 라인업의 유일한 외부 공급자. 베트맨 일정도 검증된 LFA match_id로 조회한다.
 * 예상 명단은 단기 캐시만 쓰며 확정 명단은 공용 저장소에 보존한다.
 *
 * ## 이름
 * LFA 는 "J. Agirrezabala" 식 축약형을 준다. 스쿼드 사전(`team_squads`)의 그 팀 선수와
 * 성(姓)으로 대조하고, 이니셜이 오면 이름 첫 글자로 한 번 더 거른다. **팀을 좁혀서**
 * 보는 것이 핵심이다 — 같은 성이 양 팀에 있을 수 있다. 못 찾으면 원문 유지
 * (틀린 한글보다 낫다).
 */

export interface LfaLineupPerson {
  id?: string
  label: string
  number: number | null
  roman: string | null
}

export interface LfaLineupSideOut {
  formation: string | null
  starters: LfaLineupPerson[]
  bench: LfaLineupPerson[]
}

async function fetchLineupSnapshot(matchId: string) {
  const observationId = randomUUID()
  const requestedAt = new Date().toISOString()
  const raw = await lfaFetch<unknown>("lineups", { match_id: matchId, lang: "en" })
  const fetchedAt = new Date().toISOString()
  const lineup = normalizeLfaLineups(raw)
  const rawProjected =
    raw && typeof raw === "object" && "is_projected" in raw ? raw.is_projected : null
  const fingerprint = lineup
    ? createHash("sha256").update(JSON.stringify(lineup)).digest("hex")
    : null
  // 실제 공급자 호출 안에서만 기록한다. 캐시 조회/DB 저장 시각과 구분한다.
  console.info(
    "[lfa-lineup-response]",
    JSON.stringify({
      matchId,
      observationId,
      requestedAt,
      fetchedAt,
      rawProjected: typeof rawProjected === "boolean" ? rawProjected : null,
      rawProjectedType: rawProjected === null ? "missing" : typeof rawProjected,
      fingerprint,
      projected: lineup?.projected ?? null,
      starters: lineup ? [lineup.home.starting.length, lineup.away.starting.length] : [],
      benches: lineup ? [lineup.home.subs.length, lineup.away.subs.length] : [],
    })
  )
  if (raw == null) throw new Error("lfa-lineup-unavailable")
  return { raw, fetchedAt, observation: { id: observationId, requestedAt, fingerprint } }
}

/** 방문자 요청만 SWR 캐시 사용. 자동 수집은 fresh 응답을 기다려 같은 실행에서 저장한다. */
function cachedLineups(matchId: string) {
  return unstable_cache(
    () => fetchLineupSnapshot(matchId),
    // v4: SWR로 받은 예상 명단에 현재 시각을 찍어 DB TTL을 다시 연장하지 않는다.
    ["lfa-lineups-v4", matchId],
    { revalidate: 120 }
  )
}

/** 팀 한글명 → 그 팀 스쿼드 (영문명은 "성 이름" 순) — 저장 라인업 재한글화에도 쓰인다 */
export const getTeamSquadNames = unstable_cache(
  async (teamKr: string): Promise<SquadName[]> => {
    // ⚠️ 정확일치 금지 — 사유는 lib/match/resolve-team-id.ts 주석 참조
    const teamId = await resolveTeamId(teamKr)
    if (!teamId) return []
    const { data } = await createServiceRoleClient()
      .from("team_squads")
      .select("name_en, name_kr")
      .eq("soccerway_team_id", teamId)
      .neq("status", "rejected")
    // ⚠️ 한글이 없는 선수도 **가져온다** — 예전엔 걸러냈고, 그래서 검수 전 선수는
    //    피드 약어("Palacios C.")가 그대로 화면에 나갔다. 영문 풀네임이라도 쓰려면
    //    목록에 있어야 한다. 한글 매칭은 아래에서 **먼저** 하므로 기존 동작은 안 변한다.
    return (data ?? []).map((r) => ({
      nameEn: String(r.name_en ?? ""),
      nameKr: r.name_kr ? String(r.name_kr) : null,
    }))
  },
  ["lfa-lineup-squad-v4"],
  { revalidate: 3600 } // 사전이 자주 갱신되는 시기라 짧게 — 이름 수정이 하루 뒤 반영되면 운영이 막힌다
)

function toPeople(list: LfaRawPlayer[] | undefined, squad: SquadName[]): LfaLineupPerson[] {
  const out: LfaLineupPerson[] = []
  for (const p of list ?? []) {
    const name = String(p.name ?? "").trim()
    if (!name) continue
    const n = Number(p.number)
    out.push({
      ...(p.id ? { id: p.id } : {}),
      label: localizePlayerName(name, squad),
      number: Number.isFinite(n) && n > 0 ? n : null,
      roman: name,
    })
  }
  return out
}

/**
 * LFA 라인업 — betman 기준 홈/원정 순서로 돌려준다.
 * LFA 의 home/away 는 이미 실제 홈/원정이라 뒤집기가 필요 없다 (soccerway 와 다른 점).
 */
export async function getLfaLineup(
  matchId: string,
  homeTeamKr: string,
  awayTeamKr: string,
  opts: { refresh?: boolean } = {}
): Promise<{
  home: LfaLineupSideOut
  away: LfaLineupSideOut
  projected: boolean
  fetchedAt: string
  observation: { id: string; requestedAt: string; fingerprint: string | null }
} | null> {
  const snapshot = await (
    opts.refresh ? fetchLineupSnapshot(matchId) : cachedLineups(matchId)()
  ).catch(() => null)
  if (!snapshot) return null
  const data = normalizeLfaLineups(snapshot.raw)
  if (!data) return null

  const [homeSquad, awaySquad] = await Promise.all([
    getTeamSquadNames(homeTeamKr).catch(() => [] as SquadName[]),
    getTeamSquadNames(awayTeamKr).catch(() => [] as SquadName[]),
  ])

  const side = (s: (typeof data)["home"], squad: SquadName[]): LfaLineupSideOut => ({
    formation: s.formation,
    starters: toPeople(s.starting, squad),
    bench: toPeople(s.subs, squad),
  })

  const home = side(data.home, homeSquad)
  const away = side(data.away, awaySquad)
  // 선발이 비면 라인업이라 부를 수 없다 — 빈 껍데기를 그리지 않는다
  if (home.starters.length === 0 || away.starters.length === 0) return null
  return {
    home,
    away,
    projected: data.projected,
    fetchedAt: snapshot.fetchedAt,
    observation: snapshot.observation,
  }
}

import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch } from "@/lib/lfa/client"
import { resolveTeamId } from "@/lib/match/resolve-team-id"
import { localizePlayerName, tidyFeedName, type SquadName } from "./player-name"

// 이 모듈로 쓰던 곳이 많다 — 순수 모듈로 옮기면서 import 경로는 유지한다
export { localizePlayerName, tidyFeedName, type SquadName }

/**
 * live-football-api 라인업 (2026-08-18 운영자: "라인업도 없고 서비스가 일관성이 없다").
 *
 * ## 왜 필요한가
 * soccerway 경로는 킥오프 −150분 ~ +24시간 창 안에서만 동작한다. 창을 벗어나면
 * 라인업·리포트·스탯이 **한꺼번에** 사라져, 같은 경기 페이지가 열어보는 시각에 따라
 * 다르게 보였다. LFA 는 끝난 경기의 라인업도 계속 준다 (실측: 36시간 지난 경기 OK).
 * 그래서 soccerway 가 침묵할 때 여기서 받아온다.
 *
 * ## 이름
 * LFA 는 "J. Agirrezabala" 식 축약형을 준다. 스쿼드 사전(`team_squads`)의 그 팀 선수와
 * 성(姓)으로 대조하고, 이니셜이 오면 이름 첫 글자로 한 번 더 거른다. **팀을 좁혀서**
 * 보는 것이 핵심이다 — 같은 성이 양 팀에 있을 수 있다. 못 찾으면 원문 유지
 * (틀린 한글보다 낫다).
 */

interface LfaLineupPlayer {
  id?: string
  name?: string
  number?: number | string | null
}

interface LfaLineupSide {
  formation?: string | null
  starting?: LfaLineupPlayer[]
  substitutes?: LfaLineupPlayer[]
  bench?: LfaLineupPlayer[]
}

interface LfaLineupsResponse {
  match_id?: string
  home?: LfaLineupSide
  away?: LfaLineupSide
}

export interface LfaLineupPerson {
  label: string
  number: number | null
  roman: string | null
}

export interface LfaLineupSideOut {
  formation: string | null
  starters: LfaLineupPerson[]
  bench: LfaLineupPerson[]
}

/** 끝난 경기도 값이 변하지 않는다 — 길게 잡는다 */
function cachedLineups(matchId: string) {
  return unstable_cache(
    async () => lfaFetch<LfaLineupsResponse>("lineups", { match_id: matchId, lang: "en" }),
    ["lfa-lineups", matchId],
    { revalidate: 12 * 3600 }
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

function toPeople(list: LfaLineupPlayer[] | undefined, squad: SquadName[]): LfaLineupPerson[] {
  const out: LfaLineupPerson[] = []
  for (const p of list ?? []) {
    const name = String(p.name ?? "").trim()
    if (!name) continue
    const n = Number(p.number)
    out.push({
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
  awayTeamKr: string
): Promise<{ home: LfaLineupSideOut; away: LfaLineupSideOut } | null> {
  const data = await cachedLineups(matchId)().catch(() => null)
  if (!data?.home || !data?.away) return null

  const [homeSquad, awaySquad] = await Promise.all([
    getTeamSquadNames(homeTeamKr).catch(() => [] as SquadName[]),
    getTeamSquadNames(awayTeamKr).catch(() => [] as SquadName[]),
  ])

  const side = (s: LfaLineupSide, squad: SquadName[]): LfaLineupSideOut => ({
    formation: s.formation ? String(s.formation) : null,
    starters: toPeople(s.starting, squad),
    bench: toPeople(s.substitutes ?? s.bench, squad),
  })

  const home = side(data.home, homeSquad)
  const away = side(data.away, awaySquad)
  // 선발이 비면 라인업이라 부를 수 없다 — 빈 껍데기를 그리지 않는다
  if (home.starters.length === 0 || away.starters.length === 0) return null
  return { home, away }
}

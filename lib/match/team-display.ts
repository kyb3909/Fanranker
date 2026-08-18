import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { teamMatchScore } from "@/lib/namu/team-match"

/**
 * 지면 표기용 팀 이름 (2026-08-19 운영자: "데포르티보 라 코루냐 A 는 그냥 데포르티보",
 * "인테르나치오날레 그냥 인테르").
 *
 * ## 왜 별도 계층인가
 * 팀 이름이 화면마다 다른 출처에서 온다 — 순위표는 네이버("데포르티보 라 코루냐 A"),
 * 일정·매치센터는 betman("인테르나치오날레 밀라노"). 출처를 고칠 수는 없으니
 * **지면에 그리기 직전에** 사전의 통칭(`team_dictionary.short_kr`)으로 바꾼다.
 *
 * ⚠️ 데이터 값을 바꾸지 않는다 — LFA·soccerway 해석이 전부 원래 팀명으로 대조하므로,
 *    저장·조회 값을 줄이면 경기 매칭이 통째로 깨진다. 오직 라벨만.
 *
 * ## 대조
 * 출처마다 표기가 흔들려서(라 코루냐 / 아코루냐 / 뒤에 붙는 "A") 정확일치로는 못 잇는다.
 * 나무위키 수확기와 같은 토큰 대조를 쓰고 **후보가 1건일 때만** 바꾼다 — 애매하면 원문이다.
 */

interface TeamName {
  nameKr: string
  shortKr: string | null
  aliases: string[]
}

const cachedNames = unstable_cache(
  async (): Promise<TeamName[]> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("name_kr, short_kr, aliases_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    return (data ?? []).map((r) => ({
      nameKr: String(r.name_kr),
      shortKr: r.short_kr ? String(r.short_kr) : null,
      aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
    }))
  },
  ["team-display-names"],
  { revalidate: 3600 }
)

/** 통칭이 붙은 팀만 담은 표 — 화면에서 한 번 만들어 행마다 재사용한다 */
export type TeamShortMap = ReadonlyArray<TeamName>

export async function loadTeamShortMap(): Promise<TeamShortMap> {
  return cachedNames().catch(() => [])
}

/**
 * 원문 팀명 → 지면 표기. 통칭이 없거나 대조가 애매하면 원문 그대로.
 * 이미 통칭만큼 짧으면(사전 이름과 같으면) 굳이 바꾸지 않는다.
 */
export function displayTeamName(raw: string, names: TeamShortMap): string {
  const src = String(raw ?? "").trim()
  if (!src) return src

  let best = 0
  const hits: TeamName[] = []
  for (const n of names) {
    const score = teamMatchScore(src, n.nameKr, n.aliases)
    if (score === 0) continue
    if (score > best) {
      best = score
      hits.length = 0
    }
    if (score === best) hits.push(n)
  }
  if (hits.length !== 1) return src
  return hits[0].shortKr || src
}

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

/**
 * 영문 → 한글 (2026-08-24). betman 에 짝이 없는 경기는 LFA 영문명이 그대로 지면에 올라온다
 * ("맨시티 – Bournemouth" 처럼 한 줄에 두 언어가 섞였다). 사전에 있는 팀만 바꾸고 없으면
 * 영문을 유지한다 — 지어내지 않는다. 재료는 `lfa_team_names`(운영자 확정 백필).
 */
interface DisplayNames {
  names: TeamName[]
  enToKr: Record<string, string>
}

const cachedNames = unstable_cache(
  async (): Promise<DisplayNames> => {
    const supabase = createServiceRoleClient()
    const [{ data }, { data: lfaNames }] = await Promise.all([
      supabase
        .from("team_dictionary")
        .select("name_kr, short_kr, aliases_kr, name_en")
        .neq("status", "rejected")
        .not("name_kr", "is", null),
      supabase.from("lfa_team_names").select("name_kr, name_en"),
    ])
    const enToKr: Record<string, string> = {}
    // team_dictionary(272팀)를 깔고 lfa_team_names 로 덮는다 — 후자는 LFA 철자에
    // 맞춰 백필한 것이라 표기가 정확하다 ("Not. Forest" 같은 축약형)
    for (const r of [...(data ?? []), ...(lfaNames ?? [])]) {
      const en = String(r.name_en ?? "").trim()
      const kr = String(r.name_kr ?? "").trim()
      if (en && kr) enToKr[en.toLowerCase()] = kr
    }
    return {
      names: (data ?? []).map((r) => ({
        nameKr: String(r.name_kr),
        shortKr: r.short_kr ? String(r.short_kr) : null,
        aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
      })),
      enToKr,
    }
  },
  ["team-display-names-v2"],
  { revalidate: 3600 }
)

/** 통칭이 붙은 팀만 담은 표 — 화면에서 한 번 만들어 행마다 재사용한다 */
export type TeamShortMap = DisplayNames

export async function loadTeamShortMap(): Promise<TeamShortMap> {
  return cachedNames().catch(() => ({ names: [], enToKr: {} }))
}

/**
 * 원문 팀명 → 지면 표기. 통칭이 없거나 대조가 애매하면 원문 그대로.
 * 이미 통칭만큼 짧으면(사전 이름과 같으면) 굳이 바꾸지 않는다.
 */
export function displayTeamName(raw: string, map: TeamShortMap): string {
  let src = String(raw ?? "").trim()
  if (!src) return src

  // 영문이면 먼저 한글로 (사전에 있을 때만) — 그 다음 아래 통칭 축약을 그대로 태운다
  const kr = map.enToKr[src.toLowerCase()]
  if (kr) src = kr

  const names = map.names
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

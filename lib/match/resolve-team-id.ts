import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { fetchTeamNames } from "@/lib/dictionary/squad-names"
import { resolveTeamName } from "./team-name-resolution"

/**
 * 팀 한글명 → `team_dictionary.soccerway_team_id` (2026-08-24).
 *
 * ## 왜 별도 계층인가
 * 스쿼드 조회가 두 곳에서 **정확일치**(`.eq("name_kr", teamKr)`)로 팀을 찾고 있었다. 그런데
 * 화면에 들어오는 이름은 betman 표기라 사전과 어긋난다 — betman "브라이턴&호브 앨비언" ↔
 * 사전 "브라이턴", "노팅엄 포리스트" ↔ "노팅엄 포레스트". 어긋나면 `maybeSingle()` 이 null 을
 * 주고 그 팀 선수 이름이 **통째로 영문으로 남는다**. 조용히 실패해서 알아채기 어려웠다.
 *
 * 그래서 표기 흔들림을 여기서 흡수한다: 정확일치 → 별칭 → **포함 관계**.
 *
 * ⚠️ 토큰 대조는 쓰지 않는다. 실측(2026-08-24)에서 "스타드 렌" 이 공용 토큰 "스타드" 하나로
 *    "스타드 브레스투아29" 에 붙었다 — 남의 팀 선수단을 다는 것이 최악의 실패다. 한쪽 이름이
 *    다른 쪽을 통째로 품을 때만(브라이턴&호브 앨비언 ⊃ 브라이턴) 채택하고, 그것도 후보가
 *    1건일 때만. 애매하면 붙이지 않는다 — 영문으로 남는 편이 오답보다 낫다.
 */

const cachedDict = unstable_cache(
  () => fetchTeamNames(createServiceRoleClient()),
  ["team-id-dict-v2"],
  { revalidate: 3600 }
)

export async function resolveTeamId(teamKr: string): Promise<string | null> {
  return resolveTeamName(await cachedDict(), String(teamKr ?? ""))
}

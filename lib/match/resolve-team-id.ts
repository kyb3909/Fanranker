import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"

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

/** 표기 흔들림 흡수용 정규화 — 공백·구두점·약어 기호를 지운다 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s&·．.\-_'"()]/g, "")
    .trim()
}

interface DictRow {
  id: string
  nameKr: string
  aliases: string[]
}

const cachedDict = unstable_cache(
  async (): Promise<DictRow[]> => {
    const { data } = await createServiceRoleClient()
      .from("team_dictionary")
      .select("soccerway_team_id, name_kr, aliases_kr")
      .neq("status", "rejected")
      .not("name_kr", "is", null)
    return (data ?? []).map((r) => ({
      id: String(r.soccerway_team_id),
      nameKr: String(r.name_kr),
      aliases: ((r.aliases_kr as string[] | null) ?? []).map(String),
    }))
  },
  ["team-id-dict-v1"],
  { revalidate: 3600 }
)

export async function resolveTeamId(teamKr: string): Promise<string | null> {
  const src = String(teamKr ?? "").trim()
  if (!src) return null

  const dict = await cachedDict().catch(() => [] as DictRow[])
  if (dict.length === 0) return null

  const exact = dict.find((d) => d.nameKr === src)
  if (exact) return exact.id

  const byAlias = dict.filter((d) => d.aliases.includes(src))
  if (byAlias.length === 1) return byAlias[0].id

  // 포함 관계 — 짧은 쪽이 3글자 미만이면 우연히 걸린다 ("렌"·"AC" 등) → 제외
  const a = norm(src)
  if (a.length < 3) return null
  const hits = dict.filter((d) => {
    const b = norm(d.nameKr)
    if (b.length < 3) return false
    return a.includes(b) || b.includes(a)
  })
  return hits.length === 1 ? hits[0].id : null
}

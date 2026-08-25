import "server-only"

import { createServiceRoleClient } from "@/lib/supabase/server"
import { unstable_cache } from "next/cache"

/**
 * 판타지 선수 이름에 **사전을 입힌다** (2026-08-25 운영자: "팀 이름들 있으니까 그 테이블과
 * 연동하면 되지 않을까?").
 *
 * ## 왜 런타임인가
 * JSON 을 한 번 고치는 방법도 있지만, 그러면 사전을 고쳐도 판타지는 안 바뀐다 —
 * 운영자 요구("한 군데서 고치면 다 반영")가 다시 깨진다. 그래서 **그릴 때 입힌다.**
 * FPL 고유 데이터(몸값·포인트·소유율)는 JSON 이 정본이고 이름만 덮는다.
 *
 * ## ⚠️ 팀 없이 성만으로 이으면 안 된다
 * 실측: 성만으로 대조하면 `Saka` 가 다른 팀 동명이인(마티스 사카)에게 붙었고,
 * `Gomes` 는 아예 다른 선수(구스타부 누니스)가 됐다. **팀을 먼저 좁히고** 그 안에서 성을 본다.
 *
 * ## ⚠️ 성 축약은 유지한다 (운영자 확정)
 * FPL 카드는 좁아서 "다비드 라야" 보다 "라야" 가 맞다. 사전 이름이 판타지 이름을
 * **포함하면** 축약으로 보고 그대로 둔다 (라야·살리바·화이트 등 238명).
 * 바꾸는 건 두 종류뿐:
 *   ① 판타지에 **로마자가 그대로** 남은 것 (실측 76명 — Nedeljkovic·Quenda…)
 *   ② 사전 이름이 판타지 이름을 **포함하지 않는** 것 = 진짜 다른 표기
 *      (실측 71명 — 아브라함 → 태미 에이브러햄, 구스토 → 말로 귀스토)
 */

interface NamedPlayer {
  name: string
  nameKo: string
  teamKo: string
}

/** 대조 키 — 악센트·대소문자·구두점을 지운다 */
function key(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

interface DictView {
  /** 판타지 teamKo → 그 팀의 [성 → 한글명] */
  byTeam: Record<string, Record<string, string>>
}

/**
 * 사전을 판타지가 쓰기 좋은 모양으로 눕힌다.
 *
 * ⚠️ **`status` 로 거르지 않는다** (2026-08-25 운영자: "사전 하나를 기반으로 판타지·기사·
 *    스탯·라인업이 전부 돌아가야 한다"). 종전엔 `confirmed` 만 썼는데, 확정은 79명뿐이고
 *    나머지 3,500여 명의 `name_kr` 은 **이미 라인업·매치센터 화면에 그려지고 있다.**
 *    그래서 같은 선수가 라인업에선 한글, 판타지에선 영문으로 나왔다 — 사전을 하나로 둔
 *    의미가 없어진다. 화면에 이미 나가는 표기면 게임 화면에도 나가는 게 맞다.
 *
 * ⚠️ 단 `name_kr_draft`(기계 추정 후보)는 여기 안 온다 — 그건 별도 칼럼이고 검수 전이다.
 */
const cachedDict = unstable_cache(
  async (): Promise<DictView> => {
    const supabase = createServiceRoleClient()

    const { data: teams } = await supabase
      .from("team_dictionary")
      .select("soccerway_team_id, name_kr, short_kr, aliases_kr")
      .not("name_kr", "is", null)

    // 팀 한글 표기(정식·통칭·별칭) 전부를 그 팀 id 로 잇는다 — 판타지의 teamKo 가
    // 셋 중 무엇이든 걸리게. 여러 팀이 같은 표기를 주장하면 그 표기는 버린다(모호).
    const teamIdOf = new Map<string, string | null>()
    for (const t of teams ?? []) {
      const id = String(t.soccerway_team_id)
      const labels = [t.name_kr, t.short_kr, ...(t.aliases_kr ?? [])].filter(Boolean) as string[]
      for (const l of labels) {
        teamIdOf.set(l, teamIdOf.has(l) && teamIdOf.get(l) !== id ? null : id)
      }
    }

    const squads: { soccerway_team_id: string; name_en: string; name_kr: string }[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase
        .from("team_squads")
        .select("soccerway_team_id, name_en, name_kr")
        .neq("status", "rejected")
        .not("name_kr", "is", null)
        .range(from, from + 999)
      squads.push(...((data ?? []) as (typeof squads)[number][]))
      if (!data || data.length < 1000) break
    }

    /**
     * 팀 id → (토큰 → 한글명).
     *
     * ⚠️ **성이 어느 쪽에 있는지 가정하지 않는다** (2026-08-25 실측).
     *    `team_squads.name_en` 은 **"성 이름" 순**이다 — "Arrizabalaga Kepa" 가 아니라
     *    "Kepa Arrizabalaga" 처럼 보이지만 실제 저장은 뒤집혀 있어서, 마지막 토큰을
     *    성으로 잡으면 `christos`·`kepa`(이름)가 키가 됐고 판타지의 `Arrizabalaga` 와
     *    한 건도 안 맞았다(보정 0명).
     *    그래서 **모든 토큰**을 키로 넣는다. 겹치면 버리므로(아래 null) 오히려 안전하다.
     * ⚠️ 3글자 미만 토큰은 버린다 — "de"·"da" 같은 조각이 엉뚱한 선수를 물어온다.
     */
    const byId = new Map<string, Map<string, string | null>>()
    for (const s of squads) {
      const id = String(s.soccerway_team_id)
      const m = byId.get(id) ?? new Map<string, string | null>()
      for (const tok of key(s.name_en).split(" ")) {
        if (tok.length < 3) continue
        m.set(tok, m.has(tok) && m.get(tok) !== s.name_kr ? null : s.name_kr)
      }
      byId.set(id, m)
    }

    const byTeam: Record<string, Record<string, string>> = {}
    for (const [label, id] of teamIdOf) {
      if (!id) continue
      const m = byId.get(id)
      if (!m) continue
      const out: Record<string, string> = {}
      for (const [last, kr] of m) if (kr) out[last] = kr
      if (Object.keys(out).length) byTeam[label] = out
    }
    return { byTeam }
  },
  ["draft-name-dictionary-v3"],
  { revalidate: 600 } // 검수 직후 반영이 10분 안에 보이게. 게임 데이터라 더 짧을 이유는 없다
)

/** 사전 이름이 판타지 이름을 담고 있으면 = 성만 쓴 축약. 그대로 둔다 */
function isAbbreviation(fantasy: string, dict: string): boolean {
  return dict.replace(/\s/g, "").includes(fantasy.replace(/\s/g, ""))
}

/**
 * 선수 목록의 `nameKo` 를 사전 표기로 보정한다. 다른 필드는 건드리지 않는다.
 * fail-open — 사전을 못 읽으면 원본 그대로 돌려준다 (게임이 멈추면 안 된다).
 */
export async function applyDictionaryNames<T extends NamedPlayer>(players: T[]): Promise<T[]> {
  let dict: DictView
  try {
    dict = await cachedDict()
  } catch {
    return players
  }

  return players.map((p) => {
    const team = dict.byTeam[p.teamKo]
    if (!team) return p

    // 판타지 쪽도 성이 앞뒤 어디든 올 수 있다 ("J.Timber", "Gabriel Jesus") — 토큰을 다 본다.
    // ⚠️ 서로 다른 선수를 가리키는 토큰이 섞이면 **바꾸지 않는다** (애매하면 원문).
    const hits = new Set<string>()
    for (const tok of key(p.name).split(" ")) {
      if (tok.length < 3) continue
      const kr = team[tok]
      if (kr) hits.add(kr)
    }
    if (hits.size !== 1) return p
    const kr = [...hits][0]

    const hasRoman = !p.nameKo || /[A-Za-z]/.test(p.nameKo)
    // 로마자가 남았으면 무조건 교체, 아니면 "축약이 아닐 때만" 교체
    if (hasRoman || !isAbbreviation(p.nameKo, kr)) return { ...p, nameKo: kr }
    return p
  })
}

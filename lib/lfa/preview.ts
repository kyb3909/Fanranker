import "server-only"

import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { lfaFetch } from "@/lib/lfa/client"
// 결장 사유 한글화는 순수 모듈로 분리했다 (2026-08-25) — 이 파일은 Supabase 를
// import 하므로 테스트가 env 없이 못 돈다. 기존 import 경로 호환을 위해 re-export.
import { localizeInjuryStatus } from "@/lib/lfa/injury-terms"
export { localizeInjuryStatus } from "@/lib/lfa/injury-terms"
// 팀명·선수명 대조도 같은 이유로 분리 (2026-08-25). 사전 조회는 아래에 남고,
// "받은 쌍 목록에서 고르기" 만 순수 모듈이 한다.
import { localizeTeam, localizePlayer } from "@/lib/lfa/name-match"

/**
 * 경기 부가 정보 — 심판·부상·최근 폼·상대 전적 (2026-08-17, 매치 센터).
 *
 * FotMob 의 "정보" 탭에 해당한다. 전부 경기당 불변에 가까운 데이터라 길게 캐시한다
 * (부상 명단만 경기 전에 바뀌므로 조금 짧게). 셋 다 fail-open — 없으면 섹션이 사라진다.
 *
 * ## 크레딧
 * 경기당 3콜이지만 **12시간 캐시**라 한 경기를 몇 명이 보든 3콜이다. 종료 후에는
 * 값이 굳으므로 재조회할 이유가 없다.
 */

export interface FormMatch {
  date: string
  home: { name: string }
  away: { name: string }
  score: string
}

export interface InjuryRow {
  name: string
  position: string | null
  status: string
}

export interface OfficialRow {
  role: string
  name: string
}

export interface MatchPreview {
  homeForm: FormMatch[]
  awayForm: FormMatch[]
  h2h: FormMatch[]
  injuries: { home: InjuryRow[]; away: InjuryRow[] }
  officials: OfficialRow[]
}

/** LFA 심판 역할 표기 → 한글. 기계번역이라 원문이 이상하다("YES" = VAR) */
const ROLE_LABELS: Record<string, string> = {
  Referee: "주심",
  "Assistant Referee": "부심",
  "4. Referee": "대기심",
  "4th Official": "대기심",
  YES: "VAR",
  VAR: "VAR",
  AVAR: "AVAR",
}

function toFormMatches(raw: unknown): FormMatch[] {
  if (!Array.isArray(raw)) return []
  const out: FormMatch[] = []
  for (const m of raw as Record<string, unknown>[]) {
    const home = (m.home ?? {}) as { name?: string }
    const away = (m.away ?? {}) as { name?: string }
    if (!home.name || !away.name) continue
    out.push({
      date: String(m.date ?? ""),
      home: { name: home.name },
      away: { name: away.name },
      score: String(m.score ?? ""),
    })
  }
  return out
}

/**
 * 영문 팀명 → 한글 (1h 캐시).
 *
 * ⚠️ **사전이 두 개다. 둘 다 봐야 한다** (2026-08-25).
 *  - `team_dictionary` — PK 가 `soccerway_team_id` 라 soccerway 에 있는 팀만 행을 만든다
 *  - `lfa_team_names`  — soccerway 에 없는 LFA 전용 팀 (2026-08-24 `3c49f26b` 에서 신설)
 *
 * 종전엔 여기서 **team_dictionary 만** 읽었다. 그래서 `lfa_team_names` 에 아무리 채워 넣어도
 * 매치센터 정보 탭은 계속 영문이었다 — `resolveMatch` 쪽은 이미 두 사전을 병합해 쓰는데
 * 이 경로만 빠져 있었다. 사전을 채운 사람은 "넣었는데 왜 안 바뀌지" 로 시간을 버린다.
 * ⚠️ 새로 사전을 읽는 코드를 만들 때 **두 테이블을 다 보는지** 먼저 확인할 것.
 */
const cachedTeamPairs = unstable_cache(
  async (): Promise<[string, string][]> => {
    const supabase = createServiceRoleClient()
    const [dict, lfa] = await Promise.all([
      supabase
        .from("team_dictionary")
        .select("name_en, name_kr")
        .neq("status", "rejected")
        .not("name_kr", "is", null),
      supabase.from("lfa_team_names").select("name_en, name_kr"),
    ])
    const rows = [...(dict.data ?? []), ...(lfa.data ?? [])]
    return rows
      .filter((r) => r.name_en && r.name_kr)
      .map((r) => [String(r.name_en), String(r.name_kr)] as [string, string])
  },
  ["lfa-preview-team-names-v2"],
  { revalidate: 3600 }
)

/** 팀 한글명 → 그 팀 스쿼드 (영문명은 "성 이름" 순) */
const cachedSquad = unstable_cache(
  async (teamKr: string): Promise<[string, string][]> => {
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
    return (data ?? []).map((r) => [String(r.name_en ?? ""), String(r.name_kr)] as [string, string])
  },
  ["lfa-preview-squad-v2"],
  { revalidate: 3600 } // 사전이 자주 갱신되는 시기라 짧게 — 이름 수정이 하루 뒤 반영되면 운영이 막힌다
)

async function fetchPreview(
  matchId: string,
  homeTeamKr: string,
  awayTeamKr: string
): Promise<MatchPreview> {
  const [h2hData, injData, offData] = await Promise.all([
    lfaFetch<{ home_form?: unknown; away_form?: unknown; h2h?: unknown }>("h2h", {
      match_id: matchId,
      lang: "en",
    }),
    lfaFetch<{ injuries?: { home?: unknown[]; away?: unknown[] } }>("injuries", {
      match_id: matchId,
      lang: "en",
    }),
    lfaFetch<{ officials?: unknown[] }>("officials", { match_id: matchId, lang: "en" }),
  ])

  // 한글화 재료 — 실패해도 원문이 남는다 (fail-open)
  const [teamPairs, homeSquad, awaySquad] = await Promise.all([
    cachedTeamPairs().catch(() => [] as [string, string][]),
    cachedSquad(homeTeamKr).catch(() => [] as [string, string][]),
    cachedSquad(awayTeamKr).catch(() => [] as [string, string][]),
  ])

  const toInjuries = (raw: unknown[] | undefined, squad: [string, string][]): InjuryRow[] =>
    (raw ?? [])
      .map((r) => r as { name?: string; position?: string; status?: string })
      .filter((r) => !!r.name)
      .map((r) => ({
        name: localizePlayer(String(r.name), squad),
        position: r.position ? String(r.position) : null,
        status: localizeInjuryStatus(String(r.status ?? "")),
      }))

  const koForm = (list: FormMatch[]): FormMatch[] =>
    list.map((m) => ({
      ...m,
      home: { name: localizeTeam(m.home.name, teamPairs) },
      away: { name: localizeTeam(m.away.name, teamPairs) },
    }))

  return {
    homeForm: koForm(toFormMatches(h2hData?.home_form)),
    awayForm: koForm(toFormMatches(h2hData?.away_form)),
    h2h: koForm(toFormMatches(h2hData?.h2h)),
    injuries: {
      home: toInjuries(injData?.injuries?.home, homeSquad),
      away: toInjuries(injData?.injuries?.away, awaySquad),
    },
    officials: (offData?.officials ?? [])
      .map((o) => o as { role?: string; name?: string })
      .filter((o) => !!o.name && !!o.role)
      .map((o) => ({ role: ROLE_LABELS[String(o.role)] ?? String(o.role), name: String(o.name) })),
  }
}

const EMPTY_PREVIEW: MatchPreview = {
  homeForm: [],
  awayForm: [],
  h2h: [],
  injuries: { home: [], away: [] },
  officials: [],
}

/**
 * 심판·결장자·최근 폼·상대 전적 — **호출당 3크레딧**(h2h + injuries + officials)이라
 * 이 API 에서 가장 비싼 묶음이다.
 *
 * ⚠️ 종전엔 `unstable_cache` 24시간이 전부였다. 그 캐시는 **배포마다 초기화**되므로
 *    배포가 잦은 날에는 매치 페이지를 열 때마다 3크레딧이 다시 나갔다 (2026-08-24 감사:
 *    하루 8배포 × 방문 매치 페이지 수 × 3). 그래서 DB(`match_preview_cache`)에 눕힌다.
 *
 * 신선도: **킥오프가 지났으면 영구**(심판·전적은 굳고 결장자는 더 안 바뀐다) /
 *         그 전이면 6시간(라인업 발표 전 결장자 갱신을 한 번은 받는다).
 */
export async function getMatchPreview(
  matchId: string,
  homeTeamKr: string,
  awayTeamKr: string,
  /** 킥오프가 지났는가 — 지났으면 다시 사지 않는다 */
  settled = false
): Promise<MatchPreview> {
  const supabase = createServiceRoleClient()

  try {
    const { data } = await supabase
      .from("match_preview_cache")
      .select("payload, settled, updated_at")
      .eq("lfa_match_id", matchId)
      .maybeSingle()
    if (data?.payload) {
      const age = Date.now() - new Date(String(data.updated_at)).getTime()
      if (data.settled || age < 6 * 3600_000) return data.payload as unknown as MatchPreview
    }
  } catch {
    /* fail-open — 캐시를 못 읽으면 평소대로 산다 */
  }

  // 메모리 캐시도 한 겹 유지 — 같은 배포 안에서 동시 방문이 겹칠 때 DB 왕복까지 아낀다
  const fresh = await unstable_cache(
    () => fetchPreview(matchId, homeTeamKr, awayTeamKr),
    ["lfa-preview-v5", matchId],
    { revalidate: 24 * 3600 }
  )().catch(() => null)
  if (!fresh) return EMPTY_PREVIEW

  try {
    await supabase.from("match_preview_cache").upsert(
      {
        lfa_match_id: matchId,
        payload: fresh as unknown as Record<string, unknown>,
        settled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lfa_match_id" }
    )
  } catch {
    /* 적재 실패가 화면을 깨면 안 된다 */
  }
  return fresh
}

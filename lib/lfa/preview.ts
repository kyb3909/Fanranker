import "server-only"

import { unstable_cache } from "next/cache"
import { lfaFetch } from "@/lib/lfa/client"

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

async function fetchPreview(matchId: string): Promise<MatchPreview> {
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

  const toInjuries = (raw: unknown[] | undefined): InjuryRow[] =>
    (raw ?? [])
      .map((r) => r as { name?: string; position?: string; status?: string })
      .filter((r) => !!r.name)
      .map((r) => ({
        name: String(r.name),
        position: r.position ? String(r.position) : null,
        status: String(r.status ?? ""),
      }))

  return {
    homeForm: toFormMatches(h2hData?.home_form),
    awayForm: toFormMatches(h2hData?.away_form),
    h2h: toFormMatches(h2hData?.h2h),
    injuries: {
      home: toInjuries(injData?.injuries?.home),
      away: toInjuries(injData?.injuries?.away),
    },
    officials: (offData?.officials ?? [])
      .map((o) => o as { role?: string; name?: string })
      .filter((o) => !!o.name && !!o.role)
      .map((o) => ({ role: ROLE_LABELS[String(o.role)] ?? String(o.role), name: String(o.name) })),
  }
}

/** 12시간 캐시 — 경기당 3콜이 그 시간 동안 모든 방문자를 덮는다 */
export function getMatchPreview(matchId: string): Promise<MatchPreview> {
  return unstable_cache(() => fetchPreview(matchId), ["lfa-preview", matchId], {
    revalidate: 12 * 3600,
  })().catch(() => ({
    homeForm: [],
    awayForm: [],
    h2h: [],
    injuries: { home: [], away: [] },
    officials: [],
  }))
}

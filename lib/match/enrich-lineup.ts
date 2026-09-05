import { foldLatin } from "@/lib/text/fold-latin"
import type { LineupResponse } from "@/lib/match/lineup-types"
import type { LfaTimelineEvent } from "@/lib/lfa/match"

/**
 * 라인업 × LFA 타임라인 보강 (2026-08-20 운영자 제보: "교체가 전혀 표기가 안 된다").
 *
 * 저장 라인업은 **킥오프 시점의 로스터 스냅샷**이라 인시던트(골·교체·퇴장)가 없다 —
 * soccerway 경로의 라인업은 인시던트를 실어주지만, 저장분·LFA 폴백 라인업은 명단뿐이다.
 * 경기 이벤트는 이미 LFA 타임라인으로 갖고 있으므로, 렌더 직전에 라인업 선수에게
 * 입힌다. 라인업 소스가 무엇이었든 인시던트가 나온다.
 *
 * 대조: 타임라인 선수명은 대부분 **그 라인업의 라벨로 한글화된 값**이라(localizeScorer)
 * 라벨 정확일치가 1순위, 한글화가 안 된 원문이면 roman 토큰 접두 대조가 폴백.
 * 애매하면(0건 또는 2건 이상) 그 이벤트는 건너뛴다 — 엉뚱한 선수에 아이콘이 최악.
 */

interface Player {
  id?: string
  label: string
  roman?: string | null
  number?: number | null
  goals?: number
  goalMinutes?: string[]
  ownGoals?: number
  red?: boolean
  subOut?: string | null
  subIn?: string | null
  subPartner?: string
}

function toks(s: string): string[] {
  // ⚠️ player-name.ts 와 **같은 규칙**이어야 한다. 여기만 foldLatin 이 빠져 있어서,
  //    라인업에는 한글로 뜨는 선수가 타임라인에는 "M. Ødegaard" 로 남았다 (2026-09-01).
  return foldLatin(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3)
}

/** 이름 → 선수 1명 (정확 라벨 → roman 토큰). 유일하지 않으면 null */
function findPlayer(name: string | undefined, pool: Player[], id?: string): Player | null {
  if (id) {
    const hits = pool.filter((p) => p.id === id)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1 || pool.some((p) => p.id)) return null
  }
  const n = name?.trim()
  if (!n) return null
  const exact = pool.filter((p) => p.label === n)
  if (exact.length === 1) return exact[0]
  const nt = toks(n)
  if (nt.length === 0) return null
  const hits = pool.filter((p) => {
    const rt = toks(p.roman ?? "")
    if (rt.length === 0) return false
    return nt.every((t) => rt.some((u) => u === t || u.startsWith(t) || t.startsWith(u)))
  })
  return hits.length === 1 ? hits[0] : null
}

export function enrichLineupWithTimeline(
  lineup: LineupResponse,
  timeline: LfaTimelineEvent[]
): LineupResponse {
  if (lineup.status !== "ready" || timeline.length === 0) return lineup

  // 이미 인시던트가 실려 있으면(soccerway 경로) 그대로 둔다 — 이중 집계 방지
  const all = [
    ...lineup.home.starters,
    ...lineup.home.bench,
    ...lineup.away.starters,
    ...lineup.away.bench,
  ] as Player[]
  if (all.some((p) => p.subOut || p.subIn || (p.goals ?? 0) > 0 || p.red)) return lineup

  const clone: LineupResponse = JSON.parse(JSON.stringify(lineup))
  if (clone.status !== "ready") return lineup
  const side = (s: "home" | "away") =>
    [...clone[s].starters, ...clone[s].bench] as unknown as Player[]

  for (const e of timeline) {
    const min = `${e.minute}'`
    if (e.kind === "sub") {
      const pool = side(e.side)
      const out = findPlayer(e.player, pool, e.playerId)
      const inp = findPlayer(e.inPlayer, pool, e.inPlayerId)
      if (out) {
        out.subOut = min
        if (inp) out.subPartner = inp.label
      }
      if (inp) {
        inp.subIn = min
        if (out) inp.subPartner = out.label
      }
      continue
    }
    if (e.kind === "goal" || e.kind === "pen") {
      const p = findPlayer(e.player, side(e.side), e.playerId)
      if (!p) continue
      p.goals = (p.goals ?? 0) + 1
      p.goalMinutes = [...(p.goalMinutes ?? []), min]
      continue
    }
    if (e.kind === "og") {
      // 자책골 — 실축자는 득점 인정 팀의 **상대** 로스터에 있다 (getLfaMatchInfo 규약)
      const p = findPlayer(e.player, side(e.side === "home" ? "away" : "home"), e.playerId)
      if (p) p.ownGoals = (p.ownGoals ?? 0) + 1
      continue
    }
    if (e.kind === "red") {
      const p = findPlayer(e.player, side(e.side), e.playerId)
      if (p) p.red = true
    }
    // yellow 는 라인업 표기 관행에 없다 (전광판·통계 탭의 일)
  }
  return clone
}

/**
 * 시계열 클럽 일관성 판정 (2026-08-07, 환각 방지 연구 P0-b — 디오망데 실사고)
 *
 * 레알-디오망데 오피셜이 "바르사"로 표기된 사고에서, 전날 같은 선수의 티커
 * 3건이 전부 "레알"이었다 — 우리 DB 의 시계열과 정면 모순인 오피셜은 기계가
 * 잡을 수 있었다. 이 판정이 그 층(L3)이다.
 *
 * 규칙 (결정론):
 *  - 최근 언급들에서 지배 클럽(≥2회 등장)이 존재하고,
 *  - 이번 오피셜의 클럽 집합이 최근 언급 클럽들과 전혀 겹치지 않으면 → 모순.
 *  - 언급 1회뿐이면 지배로 치지 않는다 (한 건으로 단정 금지).
 *  - 모순은 **자동 수정하지 않는다** — 진짜 막판 하이재킹 기사일 수 있다.
 *    보류(검수) + 알림이 정답 (연구 원칙 3).
 */

export interface ClubConsistencyVerdict {
  conflict: boolean
  /** 최근 언급의 지배 클럽 (모순 판단 근거) */
  dominant: string | null
  /** 최근 언급 클럽 빈도 (관측·알림용) */
  priorCounts: Record<string, number>
}

export function judgeClubConsistency(
  clubs: string[],
  priorClubMentions: string[][]
): ClubConsistencyVerdict {
  const norm = (c: string) => c.trim().toLowerCase()
  const priorCounts: Record<string, number> = {}
  for (const mention of priorClubMentions) {
    // 같은 언급 안의 중복은 1회로 (한 기사가 같은 클럽을 여러 번 말해도 1표)
    for (const club of new Set(mention.map(norm))) {
      if (!club) continue
      priorCounts[club] = (priorCounts[club] ?? 0) + 1
    }
  }

  const entries = Object.entries(priorCounts)
  const dominantEntry = entries.filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0] ?? null

  if (!dominantEntry || clubs.length === 0) {
    return { conflict: false, dominant: dominantEntry?.[0] ?? null, priorCounts }
  }

  const current = new Set(clubs.map(norm))
  const overlapsAny = entries.some(([club]) => current.has(club))

  return {
    conflict: !overlapsAny,
    dominant: dominantEntry[0],
    priorCounts,
  }
}

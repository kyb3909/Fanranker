import type { LineupResponse } from "@/lib/soccerway/lineup-lookup"

/**
 * MoTM 후보판 계산 — **순수 모듈** (2026-08-31 분리).
 *
 * ⚠️ `poll.ts` 안에 있던 것을 옮겼다. 거기는 `lib/supabase/server` 를 최상위에서
 *    import 하므로 테스트가 env 없이 못 돌았다 — 그래서 "교체 선수가 후보에서
 *    빠진다" 는 결함이 프로덕션에서 발견될 때까지 시험 밖에 있었다.
 *    player-name·pair-fixtures 와 같은 이유로 뺀다.
 *
 * ## 후보 = 출전 선수만
 * 선발 22명 + LFA 타임라인에서 교체 투입(subIn)이 확인된 벤치. 타임라인이 없으면
 * 선발만 — 출전 안 한 벤치를 후보에 올리는 것보다 좁은 게 정직하다.
 */

export interface MotmOption {
  key: string
  label: string
  number: number | null
  team: "home" | "away"
  team_label: string
  group: "starter" | "sub"
}

export type ReadyLineup = Extract<LineupResponse, { status: "ready" }>

interface LineupPlayerLike {
  label: string
  number: number | null
  roman?: string | null
  subIn?: string | null
}

function optionKeyFor(p: LineupPlayerLike, team: "home" | "away", used: Set<string>): string {
  const base =
    (p.roman ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || (p.number != null ? `n${p.number}` : "p")
  let key = `${team[0]}-${base}`
  let i = 2
  while (used.has(key)) key = `${team[0]}-${base}-${i++}`
  used.add(key)
  return key
}

/**
 * 라인업(타임라인 보강 후) → 후보 옵션. 선발 전원 + subIn 확인된 벤치.
 * 옵션 shape 는 polls.options 의 {key,label} 계약을 지키면서 표시용 필드만 더한다
 * (투표 API 는 key 만 본다 — app/api/polls/[id]/vote 의 화이트리스트 검증 그대로 통과).
 */
export function buildMotmOptions(lineup: LineupResponse): MotmOption[] | null {
  if (lineup.status !== "ready") return null
  const used = new Set<string>()
  const out: MotmOption[] = []
  for (const team of ["home", "away"] as const) {
    const side = lineup[team]
    for (const p of side.starters as LineupPlayerLike[]) {
      out.push({
        key: optionKeyFor(p, team, used),
        label: p.label,
        number: p.number ?? null,
        team,
        team_label: side.teamLabel,
        group: "starter",
      })
    }
    for (const p of side.bench as LineupPlayerLike[]) {
      if (!p.subIn) continue // 교체 투입 확인된 선수만 — 미출전 벤치는 후보가 아니다
      out.push({
        key: optionKeyFor(p, team, used),
        label: p.label,
        number: p.number ?? null,
        team,
        team_label: side.teamLabel,
        group: "sub",
      })
    }
  }
  // 양 팀 선발이 다 안 실린 반쪽 라인업이면 폴을 만들지 않는다 (빈 후보판 방지)
  return out.length >= 18 ? out : null
}

/**
 * 후보판 보강 (2026-08-31 운영자 제보: "MoTM 명단에 교체 선수가 빠져 있다").
 *
 * 라인업이 뒤늦게 고쳐진 폴을 되살린다. 표가 없으면 통째로 다시 만들고(선발까지 틀려
 * 있을 수 있다), **표가 있으면 빠진 후보만 덧붙인다** — 이미 던진 표의 key 를 흔들면
 * 그 표가 무효가 된다. 어느 쪽이든 후보가 늘지 않으면 아무것도 하지 않는다.
 */
export function mergeMotmOptions(
  existing: MotmOption[],
  rebuilt: MotmOption[],
  hasVotes: boolean
): MotmOption[] | null {
  if (!hasVotes) {
    return rebuilt.length > existing.length ? rebuilt : null
  }
  const have = new Set(existing.map((o) => o.key))
  const added = rebuilt.filter((o) => !have.has(o.key))
  return added.length > 0 ? [...existing, ...added] : null
}

/**
 * 형제 행(같은 경기의 betman 다중 마켓) 중 **가장 완전한** 라인업.
 * 벤치가 있는 쪽이 이긴다 — 종전엔 먼저 걸린 행을 그대로 썼고, 그게 벤치 0 짜리면
 * 교체 후보가 통째로 빠진 후보판이 만들어졌다.
 */
export function pickRichestLineup(payloads: (LineupResponse | null)[]): ReadyLineup | null {
  let best: ReadyLineup | null = null
  let bestBench = -1
  for (const p of payloads) {
    if (!p || p.status !== "ready") continue
    const bench = p.home.bench.length + p.away.bench.length
    if (bench > bestBench) {
      best = p
      bestBench = bench
    }
  }
  return best
}

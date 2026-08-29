/**
 * 득점 정본 + 소속 표기 게이트 (2026-08-29 실사고).
 *
 * ⚠️ Supabase 를 끌어오지 않는 **순수 모듈**이다 — match-extras.ts 안에 두면 테스트가
 *    env 없이 못 돈다 (score-gate·nickname-match 와 같은 이유).
 *
 * ## 왜 필요한가
 * 크리스털 팰리스 1-4 맨체스터 시티 리포트가 이렇게 나갔다:
 *
 *   "56분에는 크리스털 팰리스의 잔루이지 돈나룸마 자책골이 나오며 스코어가 3-0으로"
 *
 * 돈나룸마는 **맨시티 골키퍼**다. 그의 자책골은 당연히 팰리스 득점이고, 실제로 그게
 * 팰리스의 유일한 1골이었다. 리포트는 방향을 뒤집어 시티 득점으로 적었고, 그 바람에
 * 시티 골이 하나 늘어 **다섯 개를 나열해놓고 마지막을 "네 번째 득점"** 이라 적는
 * 모순까지 났다. 두 오류가 사실 한 오류였다.
 *
 * 정답은 이미 손에 있었다 — 라인업 페이로드에 득점자·시각·자책골이 **팀과 함께** 들어
 * 있다(셰르키 54'·59', 홀란드 17'·84', 돈나룸마 자책 1). 파이프라인은 라인업을 가져다
 * **이름 한글화에만** 쓰고 득점 사실은 버렸다. 누가 넣었는지는 영문 기사를 LLM 이 읽어
 * 다시 만들었고, 그 왕복에서 방향이 뒤집혔다.
 *
 * 기존 스코어 게이트가 못 잡은 이유: 그건 **최종 스코어 조합**만 본다. 제목의 1-4 는
 * 맞았다. 틀린 건 거기까지 가는 경로였다.
 */

import type { ReportLike } from "@/lib/soccerway/score-gate"

export interface GoalPlayerLike {
  label: string
  goals?: number
  /** 득점 시각들 ("54'", "59'") — goals 와 같은 순서. 자책골은 여기 안 들어온다 */
  goalMinutes?: string[]
  ownGoals?: number
}

export interface GoalSideLike {
  starters: GoalPlayerLike[]
  bench: GoalPlayerLike[]
}

export type TeamSide = "home" | "away"

export interface GoalFact {
  scorer: string
  minute: string | null
  /** 득점이 올라가는 팀 — 자책골이면 **넣은 선수의 상대 팀** */
  creditedTo: TeamSide
  /** 공을 넣은 선수의 소속 팀 */
  playerTeam: TeamSide
  own: boolean
}

export interface GoalFacts {
  goals: GoalFact[]
  /** 팀별 득점 합 — 자책골이 상대 쪽으로 넘어간 뒤의 값 */
  home: number
  away: number
}

const other = (t: TeamSide): TeamSide => (t === "home" ? "away" : "home")

/** 라인업 인시던트 → 득점 사실 목록. 자책골은 **상대 팀** 득점으로 계산한다 */
export function collectGoalFacts(lineup: { home: GoalSideLike; away: GoalSideLike }): GoalFacts {
  const goals: GoalFact[] = []
  const walk = (team: TeamSide, players: GoalPlayerLike[]) => {
    for (const p of players) {
      const mins = p.goalMinutes ?? []
      for (let i = 0; i < (p.goals ?? 0); i++) {
        goals.push({
          scorer: p.label,
          minute: mins[i] ?? null,
          creditedTo: team,
          playerTeam: team,
          own: false,
        })
      }
      for (let i = 0; i < (p.ownGoals ?? 0); i++) {
        goals.push({
          scorer: p.label,
          minute: null,
          creditedTo: other(team),
          playerTeam: team,
          own: true,
        })
      }
    }
  }
  walk("home", [...lineup.home.starters, ...lineup.home.bench])
  walk("away", [...lineup.away.starters, ...lineup.away.bench])

  return {
    goals,
    home: goals.filter((g) => g.creditedTo === "home").length,
    away: goals.filter((g) => g.creditedTo === "away").length,
  }
}

/**
 * 득점 정본을 **믿어도 되는가**.
 *
 * 라인업 인시던트는 늦게 채워지거나 빠질 수 있다. 확정 스코어와 합이 맞을 때만 정본으로
 * 쓴다 — 어긋나면 조용히 안 쓴다(불완전한 정본이 더 위험하다).
 */
export function goalFactsMatchScore(facts: GoalFacts, finalScore: string): boolean {
  const m = finalScore.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!m) return false
  return facts.home === Number(m[1]) && facts.away === Number(m[2])
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 소속 표기 게이트 — "○○의 <선수>" 에서 팀이 반대면 사유 문자열, 아니면 null.
 *
 * 실사고 문장이 정확히 이 형태였다: "크리스털 팰리스의 잔루이지 돈나룸마".
 * 자책골 서술이 소속을 뒤집는 사고를 LLM 판단 이전에 결정론으로 떨어뜨린다.
 *
 * ⚠️ 좁게 막는다. "○○의 <선수>" 패턴만 본다 — 문장 전체 의미를 추론하려 들면 오탐이
 *    나고, 오탐은 멀쩡한 리포트를 죽인다(스코어 게이트가 제목만 보는 것과 같은 이유).
 */
export function wrongTeamAttribution(
  report: ReportLike,
  players: { label: string; team: TeamSide }[],
  homeTeam: string,
  awayTeam: string
): string | null {
  const text = [report.title, ...report.paragraphs].join("\n")
  const teamName: Record<TeamSide, string> = { home: homeTeam, away: awayTeam }

  for (const p of players) {
    if (!p.label || !text.includes(p.label)) continue
    const wrong = teamName[other(p.team)]
    if (!wrong) continue
    // "크리스털 팰리스의 잔루이지 돈나룸마" — 사이에 수식어가 낄 수 있어 짧은 창을 준다
    const re = new RegExp(`${escapeRe(wrong)}의\\s*[^\\n]{0,12}?${escapeRe(p.label)}`)
    if (re.test(text)) {
      return `소속 표기 오류: "${p.label}" 은 ${teamName[p.team]} 소속인데 ${wrong} 소속으로 적었다`
    }
  }
  return null
}

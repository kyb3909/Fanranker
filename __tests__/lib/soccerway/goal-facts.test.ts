import { describe, it, expect } from "vitest"
import {
  collectGoalFacts,
  goalFactsMatchScore,
  wrongTeamAttribution,
} from "@/lib/soccerway/goal-facts"

/**
 * 실사고 재현 — 크리스털 팰리스 1-4 맨체스터 시티 (2026-08-28).
 *
 * 라인업 인시던트 실제 값:
 *   원정(맨시티) 셰르키 2골(54'·59') · 홀란드 2골(17'·84') · **돈나룸마 자책 1**
 *   홈(팰리스) 득점자 없음
 *
 * 즉 시티 4골, 팰리스 1골 — 그리고 팰리스의 그 1골이 곧 시티 GK 돈나룸마의 자책골이다.
 * 리포트는 이걸 뒤집어 "크리스털 팰리스의 잔루이지 돈나룸마 자책골 → 3-0 시티"로 적었고,
 * 그 바람에 시티 골이 다섯이 됐다.
 */
const PALACE_CITY = {
  home: { starters: [{ label: "딘 헨더슨" }, { label: "마크 게이" }], bench: [] },
  away: {
    starters: [
      { label: "잔루이지 돈나룸마", ownGoals: 1 },
      { label: "셰르키", goals: 2, goalMinutes: ["54'", "59'"] },
      { label: "엘링 홀란드", goals: 2, goalMinutes: ["17'", "84'"] },
    ],
    bench: [],
  },
}

describe("collectGoalFacts", () => {
  it("자책골을 상대 팀 득점으로 계산한다", () => {
    const facts = collectGoalFacts(PALACE_CITY)
    // 팰리스 1 (돈나룸마 자책) · 시티 4 (셰르키 2 + 홀란드 2)
    expect(facts.home).toBe(1)
    expect(facts.away).toBe(4)
  })

  it("자책골은 넣은 선수 소속과 득점 팀이 서로 다르다", () => {
    const og = collectGoalFacts(PALACE_CITY).goals.find((g) => g.own)
    expect(og).toBeDefined()
    expect(og!.scorer).toBe("잔루이지 돈나룸마")
    expect(og!.playerTeam).toBe("away") // 맨시티 소속
    expect(og!.creditedTo).toBe("home") // 득점은 팰리스
  })

  it("득점 시각을 골 순서대로 붙인다", () => {
    const cherki = collectGoalFacts(PALACE_CITY).goals.filter((g) => g.scorer === "셰르키")
    expect(cherki.map((g) => g.minute)).toEqual(["54'", "59'"])
  })
})

describe("goalFactsMatchScore", () => {
  it("확정 스코어와 합이 맞으면 정본으로 쓴다", () => {
    expect(goalFactsMatchScore(collectGoalFacts(PALACE_CITY), "1-4")).toBe(true)
  })

  it("인시던트가 덜 채워졌으면 정본으로 쓰지 않는다", () => {
    const partial = {
      home: { starters: [], bench: [] },
      away: { starters: [{ label: "엘링 홀란드", goals: 1, goalMinutes: ["17'"] }], bench: [] },
    }
    expect(goalFactsMatchScore(collectGoalFacts(partial), "1-4")).toBe(false)
  })
})

describe("wrongTeamAttribution", () => {
  const players = [
    { label: "잔루이지 돈나룸마", team: "away" as const },
    { label: "엘링 홀란드", team: "away" as const },
  ]

  it("실사고 문장을 잡는다 — 시티 선수를 팰리스 소속으로 적은 것", () => {
    const bad = {
      title: "홀란드 멀티골 앞세운 맨체스터 시티, 크리스털 팰리스에 1-4 승리",
      paragraphs: [
        "56분에는 크리스털 팰리스의 잔루이지 돈나룸마 자책골이 나오며 스코어가 3-0으로 벌어졌다.",
      ],
    }
    const problem = wrongTeamAttribution(bad, players, "크리스털 팰리스", "맨체스터 시티")
    expect(problem).toContain("잔루이지 돈나룸마")
  })

  it("소속을 바르게 적은 리포트는 통과시킨다", () => {
    const good = {
      title: "홀란드 멀티골 앞세운 맨체스터 시티, 크리스털 팰리스에 1-4 승리",
      paragraphs: [
        "맨체스터 시티의 엘링 홀란드가 17분 선제골을 넣었다.",
        "크리스털 팰리스는 잔루이지 돈나룸마의 자책골로 한 골을 만회했다.",
      ],
    }
    expect(wrongTeamAttribution(good, players, "크리스털 팰리스", "맨체스터 시티")).toBeNull()
  })

  it("리포트에 안 나오는 선수는 검사하지 않는다", () => {
    const report = { title: "맨체스터 시티 승리", paragraphs: ["경기는 조용했다."] }
    expect(wrongTeamAttribution(report, players, "크리스털 팰리스", "맨체스터 시티")).toBeNull()
  })
})

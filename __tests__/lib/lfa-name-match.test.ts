import { describe, it, expect } from "vitest"
import { localizeTeam, localizePlayer } from "@/lib/lfa/name-match"

/**
 * 매치센터 정보 탭의 팀명·선수명 대조 (2026-08-25 외부 감사).
 *
 * ⚠️ 이 함수의 가장 위험한 실패는 "못 바꾸는 것" 이 아니라 **틀린 팀으로 바꾸는 것**이다.
 *    그래서 애매하면 원문을 남기는 게 기본 방침이고, 그 폭을 여기서 못박는다.
 */

/** 실제 team_dictionary 를 축약한 표본 — 겹치는 이름을 일부러 포함한다 */
const PAIRS: [string, string][] = [
  ["Inter", "인테르"],
  ["Inter Miami", "인터 마이애미"],
  ["Inter Turku", "인터 투르쿠"],
  ["Aston Villa", "애스턴 빌라"],
  ["Villarreal", "비야레알"],
  ["AEK Athens", "AEK 아테네"],
  ["Real Betis", "레알 베티스"],
  ["Real Sociedad", "레알 소시에다드"],
  ["Almeria", "알메리아"],
]

describe("localizeTeam", () => {
  it("⭐실사고: 'Inter' 가 사전에 있는데도 영문으로 나왔다", () => {
    // Inter · Inter Miami · Inter Turku 셋이 `inter` 토큰을 정확일치로 갖고 있어
    // 3파전 동점 → "애매하면 원문" 규칙에 걸려 버려졌다.
    // **이름 전체가 같은 후보**가 하나뿐이면 그쪽이 이겨야 한다.
    expect(localizeTeam("Inter", PAIRS)).toBe("인테르")
  })

  it("전체 일치가 있어도 다른 팀을 침범하지 않는다", () => {
    expect(localizeTeam("Inter Miami", PAIRS)).toBe("인터 마이애미")
    expect(localizeTeam("Inter Turku", PAIRS)).toBe("인터 투르쿠")
  })

  it("⚠️접두 겹침으로 엉뚱한 팀이 되지 않는다 (2026-08-18 실사고 회귀)", () => {
    // "Ath." 가 "AEK Athens" 의 athens 에 걸려 AEK아테네가 됐던 건
    expect(localizeTeam("Ath.", PAIRS)).toBe("Ath.")
    // "Villarreal" 이 "Aston Villa" 와 동점이 돼 둘 다 버려졌던 건 — 이제 전체일치로 산다
    expect(localizeTeam("Villarreal", PAIRS)).toBe("비야레알")
  })

  it("악센트를 무시하고 대조한다", () => {
    expect(localizeTeam("Almería", PAIRS)).toBe("알메리아")
  })

  it("🚫 사전에 없으면 원문을 남긴다 — 틀린 한글보다 낫다", () => {
    expect(localizeTeam("Teruel", PAIRS)).toBe("Teruel")
    expect(localizeTeam("Doncaster", PAIRS)).toBe("Doncaster")
  })

  it("🚫 진짜 애매하면(전체일치 여럿) 원문을 남긴다", () => {
    const dup: [string, string][] = [
      ["Real", "레알 마드리드"],
      ["Real", "레알 베티스"],
    ]
    expect(localizeTeam("Real", dup)).toBe("Real")
  })

  it("빈 입력은 그대로", () => {
    expect(localizeTeam("", PAIRS)).toBe("")
  })
})

describe("localizePlayer", () => {
  const SQUAD: [string, string][] = [
    ["Guliashvili Giorgi", "굴리아슈빌리"],
    ["Petit Guillaume", "기욤 프티"],
    ["King Joshua", "조슈아 킹"],
  ]

  it("이니셜 표기를 성으로 대조한다", () => {
    expect(localizePlayer("G. Guliashvili", SQUAD)).toBe("굴리아슈빌리")
  })

  it("🚫 스쿼드가 비면 원문", () => {
    expect(localizePlayer("G. Petit", [])).toBe("G. Petit")
  })

  it("🚫 후보가 여럿이면 원문", () => {
    const amb: [string, string][] = [
      ["Silva Bernardo", "베르나르두 실바"],
      ["Silva Thiago", "치아구 시우바"],
    ]
    expect(localizePlayer("Silva", amb)).toBe("Silva")
  })
})

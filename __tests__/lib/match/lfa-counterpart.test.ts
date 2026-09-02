import { describe, it, expect } from "vitest"
import { normTeam, pickLfaCounterpart } from "@/lib/match/pair-fixtures"

/**
 * betman ↔ LFA 짝짓기 (2026-08-30 실사고 재현 + 근본 원인 고정).
 *
 * 증상: 일요일 EPL 3경기(22:00)와 세리에A 2경기(03:45)가 `/matches` 에서 매치 링크를
 * 잃었다. 링크가 없으면 불판도 안 깔리고 lfa-warm 예열에서도 빠져 라인업·스탯·
 * 타임라인·MOM·리포트가 통째로 끊긴다. 첼시가 2-0 으로 뛰는데 사용자가 그 매치
 * 페이지에 들어갈 방법이 없었다.
 *
 * 근본 원인: `normTeam` 의 `.normalize("NFD")` 가 한글을 자모로 분해하는데 화이트리스트가
 * 완성형(가-힣)만 남겨서 **모든 한글 팀명이 빈 문자열**이 됐다. 한글↔한글 대조가 한 번도
 * 성공한 적이 없었고, 후보가 하나일 때 이름 대조 없이 채택하는 분기가 그걸 가려주고 있었다.
 *
 * ⚠️ LFA 후보는 `getLfaFixturesForMatchday` 에서 **toKorean 을 거쳐 한글로 들어온다.**
 *    이 시험을 영문 후보로 쓰면 통과해버려 아무것도 못 막는다 (처음에 실제로 그랬다).
 */

interface Row {
  homeTeam: string
  awayTeam: string
}
const row = (homeTeam: string, awayTeam: string): Row => ({ homeTeam, awayTeam })

/** 2026-08-30 13:00 UTC EPL 슬롯 — toKorean 변환 후 실측값 */
const CANDIDATES = [
  row("첼시", "브라이턴"),
  row("리즈 유나이티드", "브렌트퍼드"),
  row("선덜랜드", "풀럼"),
]

/** 프로덕션 team_dictionary 실측값 */
const TEAM_EN = new Map<string, string>([
  ["첼시", "Chelsea"],
  ["브라이턴&호브 앨비언", "Brighton"],
  ["리즈 유나이티드", "Leeds"],
  ["브렌트퍼드", "Brentford"],
  ["선덜랜드", "Sunderland"],
  ["풀럼", "Fulham"],
])

describe("normTeam — 근본 원인 고정", () => {
  it("한글을 지우지 않는다 (NFD 분해 뒤 NFC 로 되돌린다)", () => {
    expect(normTeam("첼시")).toBe("첼시")
    expect(normTeam("리즈 유나이티드")).toBe("리즈유나이티드")
    expect(normTeam("브라이턴&호브 앨비언")).toBe("브라이턴호브앨비언")
  })

  it("라틴 발음부호는 여전히 떨어진다 (NFD 를 넣은 원래 목적)", () => {
    expect(normTeam("Atlético")).toBe("atletico")
    expect(normTeam("Bayern München")).toBe("bayernmunchen")
  })
})

describe("pickLfaCounterpart — 동시 킥오프 슬롯", () => {
  it("첼시 vs 브라이턴 — 후보 3개 중 정확히 하나", () => {
    const hit = pickLfaCounterpart(row("첼시", "브라이턴&호브 앨비언"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("첼시")
  })

  it("리즈 vs 브렌트퍼드", () => {
    const hit = pickLfaCounterpart(row("리즈 유나이티드", "브렌트퍼드"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("리즈 유나이티드")
  })

  it("선덜랜드 vs 풀럼", () => {
    const hit = pickLfaCounterpart(row("선덜랜드", "풀럼"), CANDIDATES, TEAM_EN)
    expect(hit?.homeTeam).toBe("선덜랜드")
  })

  it("사전이 없어도 한글끼리 붙는다 — 대조가 사전에만 기대지 않는다", () => {
    const hit = pickLfaCounterpart(row("첼시", "브라이턴&호브 앨비언"), CANDIDATES, new Map())
    expect(hit?.homeTeam).toBe("첼시")
  })

  it("후보가 하나이고 사전이 모르면 이름 대조 없이 채택한다 (실사고를 가려주던 분기)", () => {
    const only = row("파리FC", "니스")
    expect(pickLfaCounterpart(row("파리FC", "OGC니스"), [only], new Map())).toBe(only)
  })

  // 2026-09-02: 후보가 하나여도 사전이 양 팀을 알면 이름이 맞아야 한다 — 두 일정이 어긋난 날
  // 같은 시각의 남의 경기에 붙는 구멍. resolveMatch(lib/lfa/match.ts)와 같은 규칙.
  it("후보가 하나여도 사전이 양 팀을 아는데 이름이 다르면 붙이지 않는다", () => {
    const stranger = row("토트넘", "본머스")
    const dict = new Map([
      ["아스널", "Arsenal"],
      ["리즈 유나이티드", "Leeds"],
    ])
    expect(pickLfaCounterpart(row("아스널", "리즈 유나이티드"), [stranger], dict)).toBeNull()
  })

  it("후보가 하나이고 사전이 양 팀을 알며 이름이 맞으면 채택한다", () => {
    const only = row("첼시", "브라이턴")
    expect(pickLfaCounterpart(row("첼시", "브라이턴&호브 앨비언"), [only], TEAM_EN)).toBe(only)
  })

  // Regression: ISSUE-001 — 사전 표기("셀타 비고")와 betman 표기("RC셀타데비고")가 다르고
  // 홈은 LFA 축약("R. Sociedad")이라 한글화도 안 된 경기가, 팀명 가드 뒤 링크를 잃었다.
  // Found by /qa on 2026-09-02 (프로덕션 /matches?date=2026-09-03 실측)
  // Report: .gstack/qa-reports/qa-report-gongnori-fan-2026-09-02.md
  it("사전 한글 표기가 betman 과 달라도 LFA 영문 원명으로 붙는다 (레알 소시에다드–셀타 실사고)", () => {
    const dict = new Map([
      ["레알 소시에다드", "Real Sociedad"],
      ["RC셀타데비고", "Celta Vigo"],
    ])
    const betman = row("레알 소시에다드", "RC셀타데비고")
    const cand = {
      homeTeam: "R. Sociedad",
      awayTeam: "셀타 비고",
      homeTeamEn: "R. Sociedad",
      awayTeamEn: "Celta Vigo",
    }
    expect(pickLfaCounterpart(betman, [cand], dict)).toBe(cand)
    // 영문 원명이 없는 옛 호출부 입력은 여전히 실패한다 — 그게 이 사고의 모양이었다
    expect(pickLfaCounterpart(betman, [row("R. Sociedad", "셀타 비고")], dict)).toBeNull()
  })

  it("영문 원명이 있어도 다른 팀이면 붙지 않는다", () => {
    const dict = new Map([
      ["레알 소시에다드", "Real Sociedad"],
      ["RC셀타데비고", "Celta Vigo"],
    ])
    const stranger = {
      homeTeam: "Osasuna",
      awayTeam: "헤타페",
      homeTeamEn: "Osasuna",
      awayTeamEn: "Getafe",
    }
    expect(pickLfaCounterpart(row("레알 소시에다드", "RC셀타데비고"), [stranger], dict)).toBeNull()
  })

  it("엉뚱한 경기는 여전히 안 붙는다", () => {
    const hit = pickLfaCounterpart(row("아스널", "토트넘"), CANDIDATES, TEAM_EN)
    expect(hit).toBeNull()
  })
})

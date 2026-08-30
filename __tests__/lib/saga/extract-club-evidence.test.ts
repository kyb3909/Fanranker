import { describe, it, expect } from "vitest"
import { filterClubsByEvidence, buildTeamEvidenceIndex } from "@/lib/saga/extract"

/**
 * 클럽 증거 검사 — 디오망데 실사고(2026-08-07)의 재발 방지선.
 * "Comunicado Oficial: Yan Diomande"(클럽명 없음)에 VPS 요약이 "바르사"를
 * 환각으로 채웠고 추출 LLM 이 clubs=["Barcelona"] confidence 1 로 전파 —
 * 실제 오피셜은 레알 마드리드. 원제목에 증거 없는 클럽은 채택 금지.
 */
describe("filterClubsByEvidence", () => {
  it("실사고 재현: 원제에 클럽명이 없으면 환각 클럽을 버린다", () => {
    const r = filterClubsByEvidence(["Barcelona"], "Comunicado Oficial: Yan Diomande")
    expect(r.clubs).toEqual([])
    expect(r.dropped).toEqual(["Barcelona"])
  })

  it("원제에 등장하는 클럽은 통과", () => {
    const r = filterClubsByEvidence(
      ["Real Madrid", "RB Leipzig"],
      "Real Madrid sign Diomande from RB Leipzig"
    )
    expect(r.clubs).toEqual(["Real Madrid", "RB Leipzig"])
    expect(r.dropped).toEqual([])
  })

  it("별칭 증거 인정: Barça → Barcelona, Spurs → Tottenham", () => {
    expect(filterClubsByEvidence(["Barcelona"], "Barça confirm signing").clubs).toEqual([
      "Barcelona",
    ])
    expect(filterClubsByEvidence(["Tottenham"], "Spurs agree fee for winger").clubs).toEqual([
      "Tottenham",
    ])
  })

  it("짧은 첫 토큰 폴백 금지 — 'Real'만으로 Real Madrid 인정하지 않음", () => {
    const r = filterClubsByEvidence(["Real Madrid"], "The real story behind the transfer")
    expect(r.clubs).toEqual([])
  })

  it("혼합: 증거 있는 클럽만 남긴다", () => {
    const r = filterClubsByEvidence(
      ["Arsenal", "Barcelona"],
      "Arsenal complete signing of defender"
    )
    expect(r.clubs).toEqual(["Arsenal"])
    expect(r.dropped).toEqual(["Barcelona"])
  })
})

describe("filterClubsByEvidence — 팀 사전 색인", () => {
  /** 실제 사전 모양: team_dictionary 행 + 뉴스 표기 사전 team 행 */
  const index = buildTeamEvidenceIndex([
    ["Bournemouth", "AFC본머스", "the cherries"],
    ["Daejeon", "대전 하나시티즌"],
    ["Machida", "FC마치다 젤비아"],
    ["Paris Saint-Germain", "PSG", "psg"],
    ["Real Madrid", "레알"],
  ])

  it("별명 증거: 기사가 'the Cherries'라 써도 Bournemouth 를 인정한다", () => {
    const r = filterClubsByEvidence(["Bournemouth"], "The Cherries seal deal for winger", index)
    expect(r.clubs).toEqual(["Bournemouth"])
  })

  it("모델이 정본 풀네임을 내고 제목은 축약형인 경우 — 사전이 잇는다", () => {
    // 사전 키는 "Daejeon" 인데 모델은 "Daejeon Hana Citizen" 을 낸다
    const r = filterClubsByEvidence(
      ["Daejeon Hana Citizen"],
      "[오피셜] 대전 소속 김도연, 독일행",
      index
    )
    expect(r.clubs).toEqual(["Daejeon Hana Citizen"])
  })

  it("한글 표기 안의 라틴 접두를 떼고 대조한다 (FC마치다 젤비아 → 마치다)", () => {
    const r = filterClubsByEvidence(["Machida Zelvia"], "J리그 마치다, 이기혁 영입 검토", index)
    expect(r.clubs).toEqual(["Machida Zelvia"])
  })

  it("사전이 있어도 증거 없는 클럽은 여전히 버린다 (디오망데 실사고선 유지)", () => {
    const r = filterClubsByEvidence(["Real Madrid"], "Comunicado Oficial: Yan Diomande", index)
    expect(r.clubs).toEqual([])
    expect(r.dropped).toEqual(["Real Madrid"])
  })

  it("사전이 있어도 'Real' 같은 짧은 라틴 토큰으로는 인정하지 않는다", () => {
    const r = filterClubsByEvidence(["Real Madrid"], "The real story behind the transfer", index)
    expect(r.clubs).toEqual([])
  })

  it("색인을 안 넘기면 종전 동작 그대로 (하드코딩 별칭)", () => {
    expect(filterClubsByEvidence(["Bournemouth"], "The Cherries seal deal").clubs).toEqual([])
    expect(filterClubsByEvidence(["Tottenham"], "Spurs agree fee").clubs).toEqual(["Tottenham"])
  })
})

describe("filterClubsByEvidence — 전 토큰 대조", () => {
  it("첫 토큰이 아니어도 인정: Eintracht Frankfurt ← 'Frankfurt'", () => {
    const r = filterClubsByEvidence(["Eintracht Frankfurt"], "Hull agree deal with Frankfurt")
    expect(r.clubs).toEqual(["Eintracht Frankfurt"])
  })

  it("Nottingham Forest ← 'Forest'", () => {
    const r = filterClubsByEvidence(["Nottingham Forest"], "Forest to bid £40m for Armstrong")
    expect(r.clubs).toEqual(["Nottingham Forest"])
  })
})

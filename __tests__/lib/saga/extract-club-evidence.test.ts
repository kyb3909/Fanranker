import { describe, it, expect } from "vitest"
import { filterClubsByEvidence } from "@/lib/saga/extract"

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

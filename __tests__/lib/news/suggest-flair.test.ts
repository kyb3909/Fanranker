import { describe, it, expect } from "vitest"
import { suggestFlairs } from "@/lib/news/suggest-flair"

const FLAIRS = [
  { id: "f-transfer", name: "이적", team_id: null },
  { id: "f-news", name: "뉴스", team_id: null },
  { id: "f-chelsea", name: "첼시", team_id: "chelsea" },
]

describe("suggestFlairs — 성격 말머리", () => {
  it("이적 키워드 → 이적", () => {
    expect(suggestFlairs("첼시, 조던 헨더슨 영입 완료", FLAIRS).kindFlairId).toBe("f-transfer")
  })

  it("FIFA/UEFA 는 이적이 아니다 — 'FA' 부분 매칭 실사고 (2026-08-04)", () => {
    expect(
      suggestFlairs("UEFA, FIFA 인판티노 회장에 법적 조치 검토 및 문서 보존 요구", FLAIRS)
        .kindFlairId
    ).toBe("f-news")
    expect(suggestFlairs("FIFA 회장 인판티노, 반대 세력 언급", FLAIRS).kindFlairId).toBe("f-news")
  })

  it("일반 뉴스 → 뉴스", () => {
    expect(suggestFlairs("프리미어리그 개막전 일정 발표", FLAIRS).kindFlairId).toBe("f-news")
  })
})

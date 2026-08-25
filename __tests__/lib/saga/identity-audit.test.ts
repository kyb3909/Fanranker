import { describe, it, expect } from "vitest"
import { findIdentityMismatches } from "@/lib/saga/identity-audit"

const aliases = [
  { romanized: "Savinho", preferredKo: "사비뉴" },
  { romanized: "Fabinho", preferredKo: "파비뉴" },
  { romanized: "Álvarez", preferredKo: "알바레스" },
  { romanized: "Leao Rafael", preferredKo: "하파엘 레앙" },
  { romanized: "Lewis Hall", preferredKo: "루이스 홀" },
  { romanized: "Jordan Henderson", preferredKo: "조던 헨더슨" },
]

const saga = (playerKey: string, playerNameKr: string, entryCount = 1) => ({
  slug: `${playerKey}-in-2026s`,
  playerKey,
  playerNameKr,
  entryCount,
})

describe("findIdentityMismatches", () => {
  it("⭐실사고 — 한글은 사비뉴인데 키가 fabinho 다", () => {
    const out = findIdentityMismatches([saga("fabinho", "사비뉴", 4)], aliases)
    expect(out).toHaveLength(1)
    expect(out[0].dictKeys).toEqual(["savinho"])
  })

  it("⚠️한 글자 차이도 잡는다 — luis vs lewis 는 다른 철자다", () => {
    // 편집거리를 허용했다면 놓쳤을 것이다. 이 도메인에선 한 글자가 곧 다른 사람이다.
    expect(findIdentityMismatches([saga("luis-hall", "루이스 홀")], aliases)).toHaveLength(1)
  })

  it("악센트만 다른 건 같은 사람이다", () => {
    expect(findIdentityMismatches([saga("alvarez", "알바레스")], aliases)).toEqual([])
  })

  it("토큰 순서가 뒤집혀도 같은 사람이다", () => {
    expect(findIdentityMismatches([saga("rafael-leao", "하파엘 레앙")], aliases)).toEqual([])
  })

  it("성만 쓴 축약도 같은 사람이다 (부분집합)", () => {
    expect(findIdentityMismatches([saga("henderson", "조던 헨더슨")], aliases)).toEqual([])
  })

  it("한글이 사전에 없으면 판정하지 않는다 — 근거 없이 경보하지 않는다", () => {
    expect(findIdentityMismatches([saga("nobody", "아무개")], aliases)).toEqual([])
  })

  it("한글이 없는 사가는 건너뛴다", () => {
    const out = findIdentityMismatches(
      [{ slug: "x", playerKey: "fabinho", playerNameKr: null, entryCount: 1 }],
      aliases
    )
    expect(out).toEqual([])
  })

  it("엔트리가 많은 것부터 보고한다", () => {
    const out = findIdentityMismatches(
      [saga("fabinho", "사비뉴", 2), saga("luis-hall", "루이스 홀", 9)],
      aliases
    )
    expect(out.map((m) => m.slug)).toEqual(["luis-hall-in-2026s", "fabinho-in-2026s"])
  })
})

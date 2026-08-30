import { describe, it, expect } from "vitest"
import { normalizeLfaLineups, formationText } from "@/lib/lfa/lineup-shape"

/**
 * 2026-08-31 운영자 제보 — "첼시 경기에 교체 선수 기록이 하나도 없다".
 *
 * 원인은 필드 이름 오독이었다: LFA 는 벤치를 `subs` 로 주는데 코드가
 * `substitutes ?? bench` 를 읽었다. 없는 필드라 에러 없이 `[]` 가 됐고, LFA 폴백으로
 * 채워진 라인업은 전부 벤치 0 명으로 저장됐다 (최근 14일 329건 중 148건).
 *
 * 아래 픽스처는 **실제 응답에서 옮긴 값**이다 (첼시 4–3 브라이턴, match_id
 * 40c1vmb9vw5uej4dtni094jro). 모양이 다시 바뀌면 여기서 먼저 깨진다.
 */
const REAL_RESPONSE = {
  match_id: "40c1vmb9vw5uej4dtni094jro",
  formation: { home: 3421, away: 4231 },
  is_projected: false,
  home: {
    starting: [
      { id: "a1", name: "E. Martínez", number: "26", position: "Goalkeeper" },
      { id: "a2", name: "W. Fofana", number: "3", position: "Defender" },
    ],
    subs: [
      { id: "b1", name: "M. Penders", number: "39", position: null },
      { id: "b2", name: "M. Caicedo", number: "25", position: null },
      { id: "b3", name: "R. James", number: "24", position: null },
    ],
    coach: { id: "c1", name: "Xabi Alonso" },
  },
  away: {
    starting: [{ id: "d1", name: "B. Verbruggen", number: "1", position: "Goalkeeper" }],
    subs: [{ id: "e1", name: "I. Osman", number: "15", position: null }],
    coach: { id: "c2", name: "Fabian Hürzeler" },
  },
}

describe("normalizeLfaLineups", () => {
  it("벤치를 `subs` 에서 읽는다 (이 한 줄이 교체 표기 전체를 좌우한다)", () => {
    const out = normalizeLfaLineups(REAL_RESPONSE)
    expect(out).not.toBeNull()
    expect(out!.home.subs.map((p) => p.name)).toEqual(["M. Penders", "M. Caicedo", "R. James"])
    expect(out!.away.subs.map((p) => p.name)).toEqual(["I. Osman"])
  })

  it("포메이션은 최상위 숫자에서 온다 — 팀 객체 안에는 없다", () => {
    const out = normalizeLfaLineups(REAL_RESPONSE)
    expect(out!.home.formation).toBe("3-4-2-1")
    expect(out!.away.formation).toBe("4-2-3-1")
  })

  it("선발을 그대로 싣는다", () => {
    const out = normalizeLfaLineups(REAL_RESPONSE)
    expect(out!.home.starting).toHaveLength(2)
    expect(out!.home.starting[0].number).toBe("26")
  })

  it("피드가 옛 이름(substitutes/bench)으로 돌아와도 견딘다", () => {
    const out = normalizeLfaLineups({
      home: { starting: [{ name: "A" }], substitutes: [{ name: "S" }] },
      away: { starting: [{ name: "B" }], bench: [{ name: "T" }] },
    })
    expect(out!.home.subs.map((p) => p.name)).toEqual(["S"])
    expect(out!.away.subs.map((p) => p.name)).toEqual(["T"])
  })

  it("벤치가 진짜로 없으면 빈 배열 — 선발만으로도 라인업은 성립한다", () => {
    const out = normalizeLfaLineups({
      home: { starting: [{ name: "A" }] },
      away: { starting: [{ name: "B" }] },
    })
    expect(out!.home.subs).toEqual([])
    expect(out!.home.formation).toBeNull()
  })

  it("한쪽 선발이 비면 라인업이 아니다 — 반쪽을 저장하면 영구히 굳는다", () => {
    expect(
      normalizeLfaLineups({ home: { starting: [{ name: "A" }] }, away: { starting: [] } })
    ).toBeNull()
    expect(normalizeLfaLineups({ home: { starting: [{ name: "A" }] } })).toBeNull()
    expect(normalizeLfaLineups(null)).toBeNull()
  })
})

describe("formationText", () => {
  it("숫자를 자릿수로 편다", () => {
    expect(formationText(3421)).toBe("3-4-2-1")
    expect(formationText(442)).toBe("4-4-2")
    expect(formationText("451")).toBe("4-5-1")
  })

  it("이미 문자열이면 그대로 쓴다", () => {
    expect(formationText("4-2-3-1")).toBe("4-2-3-1")
  })

  it("합이 10(필드 플레이어)이 아니면 뜻을 모르는 값이다 — 화면에 내보내지 않는다", () => {
    expect(formationText(999)).toBeNull() // 합 27
    expect(formationText(431)).toBeNull() // 합 8
    expect(formationText(4402)).toBeNull() // 0 명인 줄은 없다
    expect(formationText("abc")).toBeNull()
    expect(formationText(null)).toBeNull()
    expect(formationText("")).toBeNull()
  })
})

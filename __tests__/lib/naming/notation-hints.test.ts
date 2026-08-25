import { describe, it, expect } from "vitest"
import { buildNotationHints } from "@/lib/news/notation/rules"

/**
 * 2026-08-25 실사고: 맨시티 이적 기사의 "Savio" 가 **"사비오"** 로 나갔다.
 * 정답(사비뉴)은 스쿼드 사전에 있었는데 뉴스 사전에 그 철자가 없었다.
 *
 * ⚠️ 이 테스트의 핵심은 "성씨를 쓰게 하자" 가 아니라 **"팀 없이는 쓰지 말자"** 다.
 *    실측으로 `savio` 를 전역 조회하면 J리그 우라와 레드의 마테우스 사비우가 나온다.
 *    고치려다 더 크게 틀리는 길이 바로 옆에 있다.
 */
const row = (o: Partial<Parameters<typeof buildNotationHints>[0][number]>) => ({
  category: "player",
  preferred_ko: "사비뉴",
  romanized: "Savio Moreira de Oliveira",
  surfaces: ["savio moreira de oliveira", "사비뉴", "savio"],
  disambiguation: "Manchester City|맨체스터 시티|맨시티",
  ...o,
})

describe("buildNotationHints — 팀 맥락", () => {
  it("성씨 한 토막은 enTeam 으로 격리된다 (전역 en 에 없다)", () => {
    const [h] = buildNotationHints([row({})])
    expect(h.en).toContain("savio moreira de oliveira")
    expect(h.en).not.toContain("savio")
    expect(h.enTeam).toContain("savio")
  })

  it("사람과 라벨을 구분한다 — 이름 환각 검사가 이걸로 범위를 좁힌다", () => {
    const [person] = buildNotationHints([row({})])
    expect(person.kind).toBe("person")
    const [label] = buildNotationHints([
      {
        category: "team",
        preferred_ko: "아스널",
        romanized: "Arsenal",
        surfaces: ["arsenal"],
        disambiguation: null,
      },
    ])
    expect(label.kind).toBe("label")
  })

  it("팀 열쇠가 함께 실린다", () => {
    const [h] = buildNotationHints([row({})])
    expect(h.team).toEqual(["Manchester City", "맨체스터 시티", "맨시티"])
  })

  it("⚠️팀 정보가 없는 옛 항목은 종전대로 전역이다 — 멀쩡한 교정을 죽이지 않는다", () => {
    // 'simons' 는 사람이 넣어 잘 돌던 표기다. 갑자기 잠그면 있던 교정이 사라진다.
    const [h] = buildNotationHints([
      {
        category: "player",
        preferred_ko: "사비 시몬스",
        romanized: "Xavi Simons",
        surfaces: ["xavi simons", "simons"],
        disambiguation: null,
      },
    ])
    expect(h.en).toContain("simons")
    expect(h.enTeam).toBeUndefined()
  })

  it("한글·짧은 조각은 영어 원문 대조에 무의미하므로 빠진다", () => {
    const [h] = buildNotationHints([row({ surfaces: ["savio", "사비뉴", "de"] })])
    expect([...(h.en ?? []), ...(h.enTeam ?? [])]).not.toContain("사비뉴")
    expect([...(h.en ?? []), ...(h.enTeam ?? [])]).not.toContain("de")
  })
})

import { describe, it, expect } from "vitest"
import { matchByNickname } from "@/lib/soccerway/nickname-match"

/**
 * 애칭 보정 — "Josh King" ↔ 사전의 "King Joshua" (2026-08-25 실측).
 *
 * 영어권 매체는 짧은 형태를, 사전은 정식명을 쓴다. 토큰 집합 비교로는 영영 안 붙어서
 * 리포트에 영문 이름이 남았다. 다만 **느슨해지면 엉뚱한 사람을 확정**하므로, 이 테스트가
 * 규칙의 좁은 폭을 지킨다 — 넓히려면 여기 먼저 통과시킬 것.
 */

const d = (...romans: string[]) => romans.map((romanized) => ({ romanized }))

describe("matchByNickname", () => {
  it("⭐성씨가 정확히 같고 이름이 접두사면 붙인다 (Josh → Joshua)", () => {
    expect(matchByNickname(d("king joshua"), "Josh King")?.romanized).toBe("king joshua")
  })

  it("흔한 축약형들을 받는다", () => {
    expect(matchByNickname(d("smith benjamin"), "Ben Smith")).not.toBeNull()
    expect(matchByNickname(d("jones alexander"), "Alex Jones")).not.toBeNull()
    expect(matchByNickname(d("brown matthew"), "Matt Brown")).not.toBeNull()
  })

  it("반대 방향(사전이 짧고 기사가 긴 경우)도 된다", () => {
    expect(matchByNickname(d("king josh"), "Joshua King")?.romanized).toBe("king josh")
  })

  it("🚫 후보가 둘 이상이면 판단하지 않는다", () => {
    // 같은 팀에 King Joshua 와 King Joshuah 가 동시에 있으면 확정 불가
    expect(matchByNickname(d("king joshua", "king joshuah"), "Josh King")).toBeNull()
  })

  it("🚫 정확히 일치하는 토큰이 하나도 없으면 거부한다", () => {
    // 성씨까지 접두사면 남남일 수 있다 (Kin/King, Jos/Josh)
    expect(matchByNickname(d("kingsley joshua"), "Josh Kin")).toBeNull()
  })

  it("🚫 접두사가 하나도 없으면(=완전 일치) 이 규칙의 몫이 아니다", () => {
    // 완전 일치는 상위 티어가 이미 잡는다. 여기서 또 잡으면 중복이다.
    expect(matchByNickname(d("king joshua"), "Joshua King")).toBeNull()
  })

  it("🚫 2글자 축약은 거부한다 — 너무 위험하다", () => {
    // "Jo King" 은 Joshua/Joseph/John 누구든 될 수 있다
    expect(matchByNickname(d("king joshua"), "Jo King")).toBeNull()
  })

  it("🚫 토큰 수가 다르면 거부한다", () => {
    expect(matchByNickname(d("king joshua christopher"), "Josh King")).toBeNull()
  })

  it("🚫 성씨가 다르면 이름이 같아도 거부한다", () => {
    expect(matchByNickname(d("smith joshua"), "Josh King")).toBeNull()
  })

  it("이름 한 토큰만 주어지면 판단하지 않는다", () => {
    expect(matchByNickname(d("king joshua"), "King")).toBeNull()
  })
})

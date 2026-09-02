import { describe, it, expect } from "vitest"
import { deriveResultFromScore, mapGameResult, parseScore } from "@/lib/betman/result-mapper"

describe("mapGameResult", () => {
  describe("cancelled 게임", () => {
    it("GAME_RESULT='4'는 모든 게임 타입에서 cancelled", () => {
      expect(mapGameResult("4", "일반")).toEqual({ result: "cancelled", status: "cancelled" })
      expect(mapGameResult("4", "핸디캡")).toEqual({ result: "cancelled", status: "cancelled" })
      expect(mapGameResult("4", "언더오버")).toEqual({ result: "cancelled", status: "cancelled" })
      expect(mapGameResult("4", "SUM")).toEqual({ result: "cancelled", status: "cancelled" })
    })

    it("숫자로 들어와도 동일 동작", () => {
      expect(mapGameResult(4, "일반")).toEqual({ result: "cancelled", status: "cancelled" })
    })
  })

  describe("일반 / 핸디캡 / S핸디캡", () => {
    it.each(["일반", "핸디캡", "S핸디캡"] as const)("%s: 0=home, 1=draw, 2=away", (gameType) => {
      expect(mapGameResult("0", gameType)).toEqual({ result: "home", status: "completed" })
      expect(mapGameResult("1", gameType)).toEqual({ result: "draw", status: "completed" })
      expect(mapGameResult("2", gameType)).toEqual({ result: "away", status: "completed" })
    })
  })

  describe("언더오버 / S언더오버", () => {
    it.each(["언더오버", "S언더오버"] as const)("%s: 0=under, 2=over", (gameType) => {
      expect(mapGameResult("0", gameType)).toEqual({ result: "under", status: "completed" })
      expect(mapGameResult("2", gameType)).toEqual({ result: "over", status: "completed" })
    })

    it("draw 코드(1)는 언더오버에서 매핑 실패 → 빈 결과", () => {
      expect(mapGameResult("1", "언더오버")).toEqual({ result: "", status: "completed" })
    })
  })

  describe("SUM (홀짝)", () => {
    it("0=odd, 2=even", () => {
      expect(mapGameResult("0", "SUM")).toEqual({ result: "odd", status: "completed" })
      expect(mapGameResult("2", "SUM")).toEqual({ result: "even", status: "completed" })
    })
  })

  describe("fallback", () => {
    it("알 수 없는 코드 → status completed + 빈 결과 (score 추론으로 재시도 유도)", () => {
      expect(mapGameResult("9", "일반")).toEqual({ result: "", status: "completed" })
      expect(mapGameResult("", "핸디캡")).toEqual({ result: "", status: "completed" })
    })

    it("알 수 없는 게임 타입 → 빈 결과", () => {
      expect(mapGameResult("0", "알수없음")).toEqual({ result: "", status: "completed" })
    })
  })
})

describe("deriveResultFromScore", () => {
  describe("일반", () => {
    it("홈 승", () => {
      expect(deriveResultFromScore(3, 1, "일반", null, null)).toBe("home")
    })
    it("원정 승", () => {
      expect(deriveResultFromScore(0, 2, "일반", null, null)).toBe("away")
    })
    it("무승부", () => {
      expect(deriveResultFromScore(1, 1, "일반", null, null)).toBe("draw")
    })
  })

  describe("핸디캡 / S핸디캡", () => {
    it.each(["핸디캡", "S핸디캡"] as const)("%s: handicap 반영해 홈 승", (gameType) => {
      // 1:2 에서 홈 핸디캡 +2 → 3:2 → home
      expect(deriveResultFromScore(1, 2, gameType, 2, null)).toBe("home")
    })

    it.each(["핸디캡", "S핸디캡"] as const)("%s: handicap 반영해 무승부", (gameType) => {
      // 1:2 에서 홈 핸디캡 +1 → 2:2 → draw
      expect(deriveResultFromScore(1, 2, gameType, 1, null)).toBe("draw")
    })

    it.each(["핸디캡", "S핸디캡"] as const)("%s: handicap이 null이면 0으로 취급", (gameType) => {
      expect(deriveResultFromScore(3, 1, gameType, null, null)).toBe("home")
    })
  })

  describe("소수핸디캡 — 2026-09-02 실사고 재현", () => {
    it("바르사 5-2 · 핸디 −3.5 → away (종전엔 분기가 없어 home 으로 떨어졌다)", () => {
      // 5 − 3.5 = 1.5 < 2 → 핸디캡 적용 후 원정 승. 대조기가 이걸 mismatch 로 찍어
      // 4일간 6경기가 가짜 불일치였다.
      expect(deriveResultFromScore(5, 2, "소수핸디캡", -3.5, null)).toBe("away")
    })
    it("맨유 5-2 · 핸디 −2.5 → home", () => {
      expect(deriveResultFromScore(5, 2, "소수핸디캡", -2.5, null)).toBe("home")
    })
    it("반점 핸디는 무승부가 나올 수 없다", () => {
      expect(deriveResultFromScore(1, 1, "소수핸디캡", -0.5, null)).toBe("away")
      expect(deriveResultFromScore(1, 1, "소수핸디캡", 0.5, null)).toBe("home")
    })

    it.each(["핸디캡", "S핸디캡"] as const)("%s: 음수 handicap (원정 우위)", (gameType) => {
      // 2:1 에서 홈 핸디캡 -2 → 0:1 → away
      expect(deriveResultFromScore(2, 1, gameType, -2, null)).toBe("away")
    })
  })

  describe("언더오버 / S언더오버", () => {
    it.each(["언더오버", "S언더오버"] as const)("%s: 총점 > line → over", (gameType) => {
      expect(deriveResultFromScore(3, 2, gameType, null, 2.5)).toBe("over")
    })

    it.each(["언더오버", "S언더오버"] as const)("%s: 총점 < line → under", (gameType) => {
      expect(deriveResultFromScore(1, 0, gameType, null, 2.5)).toBe("under")
    })

    it.each(["언더오버", "S언더오버"] as const)("%s: 총점 == line → 빈 결과 (push)", (gameType) => {
      expect(deriveResultFromScore(1, 1, gameType, null, 2)).toBe("")
    })

    it.each(["언더오버", "S언더오버"] as const)("%s: line === 0/null → 빈 결과", (gameType) => {
      expect(deriveResultFromScore(3, 2, gameType, null, 0)).toBe("")
      expect(deriveResultFromScore(3, 2, gameType, null, null)).toBe("")
    })
  })

  describe("SUM (홀짝)", () => {
    it("짝수 총점 → even", () => {
      expect(deriveResultFromScore(2, 2, "SUM", null, null)).toBe("even")
      expect(deriveResultFromScore(0, 0, "SUM", null, null)).toBe("even")
    })
    it("홀수 총점 → odd", () => {
      expect(deriveResultFromScore(3, 2, "SUM", null, null)).toBe("odd")
    })
  })

  describe("fallback (알 수 없는 게임 타입)", () => {
    it("그냥 점수로 비교", () => {
      expect(deriveResultFromScore(2, 1, "알수없음", null, null)).toBe("home")
      expect(deriveResultFromScore(1, 2, "알수없음", null, null)).toBe("away")
      expect(deriveResultFromScore(1, 1, "알수없음", null, null)).toBe("draw")
    })
  })
})

describe("parseScore", () => {
  it("정상 스코어 파싱", () => {
    expect(parseScore("3:1")).toEqual({ home: 3, away: 1 })
    expect(parseScore("0:0")).toEqual({ home: 0, away: 0 })
    expect(parseScore("10:7")).toEqual({ home: 10, away: 7 })
  })

  it("빈 문자열 / null / undefined → null", () => {
    expect(parseScore("")).toBeNull()
    expect(parseScore(null)).toBeNull()
    expect(parseScore(undefined)).toBeNull()
  })

  it("구분자 없음 → null", () => {
    expect(parseScore("3-1")).toBeNull()
    expect(parseScore("31")).toBeNull()
  })

  it("숫자 아닌 값 → null", () => {
    expect(parseScore("a:b")).toBeNull()
    expect(parseScore("3:a")).toBeNull()
  })

  it("소수 스코어 → null (integer만 허용)", () => {
    expect(parseScore("3.5:1")).toBeNull()
  })
})

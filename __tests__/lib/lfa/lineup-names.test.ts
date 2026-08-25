import { describe, it, expect } from "vitest"
import { localizePlayerName, tidyFeedName, type SquadName } from "@/lib/lfa/player-name"

/**
 * 2026-08-25 외부 감사 P1-5 — MoTM 투표판에 피드 약어가 그대로 떠 있었다
 * ("Palacios C." · "Quenda G." · "Budimir A."). 한국 독자에게 이건 이름이 아니라
 * 시스템 찌꺼기로 읽힌다.
 *
 * 원인은 사전이 비어서가 아니라, 스쿼드에 **한글이 아직 안 채워진** 선수를 조회에서
 * 통째로 걸러내 영문 풀네임조차 못 쓰고 있었기 때문이다.
 */
const squad: SquadName[] = [
  { nameEn: "César Palacios Pérez", nameKr: null },
  { nameEn: "Ante Budimir", nameKr: null },
  { nameEn: "Cole Palmer", nameKr: "콜 파머" },
  { nameEn: "Agirrezabala Julen", nameKr: "훌렌 아기레사발라" },
  // 같은 성 + 한쪽만 한글 — 순서를 잘못 짜면 '파머'가 사라지는 함정
  { nameEn: "Palmer Junior", nameKr: null },
]

describe("localizePlayerName", () => {
  it("한글이 있으면 한글 (기존 동작)", () => {
    expect(localizePlayerName("J. Agirrezabala", squad)).toBe("훌렌 아기레사발라")
  })

  it("⭐한글이 없으면 영문 풀네임 — 피드 약어를 그대로 내보내지 않는다", () => {
    expect(localizePlayerName("Palacios C.", squad)).toBe("César Palacios Pérez")
    expect(localizePlayerName("Budimir A.", squad)).toBe("Ante Budimir")
  })

  it("⚠️미검수 동명이인이 있어도 한글은 안 사라진다 — 한글 매칭이 먼저다", () => {
    // 'Palmer' 로 둘이 걸리지만 한글 후보는 하나뿐이라 콜 파머가 이긴다
    expect(localizePlayerName("C. Palmer", squad)).toBe("콜 파머")
  })

  it("아무도 못 찾으면 최소한 통상 순서로 뒤집는다", () => {
    expect(localizePlayerName("Nobody X.", squad)).toBe("X. Nobody")
  })

  it("스쿼드가 비어도 약어를 그대로 두지 않는다", () => {
    expect(localizePlayerName("Palacios C.", [])).toBe("C. Palacios")
  })
})

describe("tidyFeedName", () => {
  it("성 뒤 이니셜을 앞으로", () => {
    expect(tidyFeedName("Palacios C.")).toBe("C. Palacios")
    expect(tidyFeedName("Joao Gomes")).toBe("Joao Gomes")
  })
  it("이미 앞에 있으면 그대로", () => {
    expect(tidyFeedName("J. Agirrezabala")).toBe("J. Agirrezabala")
  })
})

describe("영문 폴백의 품질 문턱", () => {
  it("⚠️지저분한 영문명은 안 쓴다 — 첼시 Quenda 실측", () => {
    // 스쿼드에 "G. Tcherno Tcherno Quenda" 로 들어 있다. 이니셜 + 토큰 중복.
    // 그대로 쓰면 "G. Quenda" 보다 나쁘다.
    const dirty: SquadName[] = [{ nameEn: "G. Tcherno Tcherno Quenda", nameKr: null }]
    expect(localizePlayerName("Quenda G.", dirty)).toBe("G. Quenda")
  })

  it("성 하나뿐인 영문명도 안 쓴다 — 정보가 안 는다", () => {
    expect(localizePlayerName("Silva D.", [{ nameEn: "Silva", nameKr: null }])).toBe("D. Silva")
  })
})

import { describe, it, expect } from "vitest"
import {
  localizePlayerName,
  resolvePlayerName,
  tidyFeedName,
  type SquadName,
} from "@/lib/lfa/player-name"

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

describe("선수 ID와 표기 충돌", () => {
  const solanke: SquadName[] = [
    {
      playerId: "lfa-solanke",
      source: "lfa",
      status: "confirmed",
      nameEn: "D. Solanke",
      nameKr: "도미닉 솔랑케",
    },
    {
      playerId: "sw-solanke",
      source: "namu",
      status: "confirmed",
      nameEn: "Solanke Dominic",
      nameKr: "도미닉 솔랑케",
    },
  ]
  it("동일 한글의 출처별 두 행이어도 LFA ID가 확인되면 선택한다", () => {
    expect(
      resolvePlayerName("D. Solanke", solanke, { provider: "lfa", playerId: "lfa-solanke" })
    ).toEqual({ label: "도미닉 솔랑케", reason: "provider-id" })
  })
  it("ID 없이 후보 전원이 같은 한글이면 표기만 합의한다 — 행은 합치지 않는다 (2026-09-17 무조건 한글)", () => {
    expect(resolvePlayerName("D. Solanke", solanke)).toEqual({
      label: "도미닉 솔랑케",
      reason: "unanimous-name",
    })
  })
  it("ID 없이 후보의 한글이 갈리면 원문을 유지한다", () => {
    const tel: SquadName[] = [
      { playerId: "tel", source: "lfa", nameEn: "M. Tel", nameKr: "마르쿠스 텔" },
      { playerId: "sw-tel", source: "namu", nameEn: "Tel Mathys", nameKr: "마티스 텔" },
    ]
    expect(localizePlayerName("M. Tel", tel)).toBe("M. Tel")
  })
  it("서로 다른 공급자의 같은 ID 문자열은 직접 매칭하지 않는다", () => {
    expect(
      localizePlayerName("Nobody X.", solanke, { provider: "lfa", playerId: "sw-solanke" })
    ).toBe("X. Nobody")
  })
  it("출처가 표기 수확기로 덮어써졌으면 공급자를 추정하지 않는다", () => {
    expect(
      localizePlayerName("Nobody X.", [{ ...solanke[0], source: "namu_pw" }], {
        provider: "lfa",
        playerId: "lfa-solanke",
      })
    ).toBe("X. Nobody")
  })
  it("정확한 ID가 있어도 출처 간 한글 충돌은 검수 대상으로 남긴다", () => {
    const tel: SquadName[] = [
      {
        playerId: "tel",
        source: "lfa",
        status: "confirmed",
        nameEn: "M. Tel",
        nameKr: "마르쿠스 텔",
      },
      {
        playerId: "sw-tel",
        source: "namu",
        status: "confirmed",
        nameEn: "Tel Mathys",
        nameKr: "마티스 텔",
      },
    ]
    expect(resolvePlayerName("M. Tel", tel, { provider: "lfa", playerId: "tel" })).toEqual({
      label: "M. Tel",
      reason: "translation-conflict",
    })
  })
  it("같은 공급자의 다른 ID로 식별된 동명이인은 구별한다", () => {
    const rows = [solanke[0], { ...solanke[0], playerId: "other", nameKr: "다른 솔랑케" }]
    expect(
      localizePlayerName("D. Solanke", rows, { provider: "lfa", playerId: "lfa-solanke" })
    ).toBe("도미닉 솔랑케")
  })
  it("다른 ID인 선수를 이름이 같다는 이유로 선택하지 않는다", () => {
    expect(
      localizePlayerName("D. Solanke", [solanke[0]], { provider: "lfa", playerId: "different" })
    ).toBe("D. Solanke")
    expect(
      localizePlayerName("D. Solanke", solanke, { provider: "lfa", playerId: "different" })
    ).toBe("D. Solanke")
  })
  it("후보 중 한글이 한 가지뿐이면 그 한글을 쓴다 (2026-09-17 운영자 승인 '넣어')", () => {
    expect(resolvePlayerName("D. Solanke", [solanke[0], { ...solanke[1], nameKr: null }])).toEqual({
      label: "도미닉 솔랑케",
      reason: "single-korean",
    })
  })
  it("직접 ID 행에 한글이 없으면 같은 팀 다른 출처 행의 유일한 한글을 쓴다", () => {
    expect(
      resolvePlayerName("D. Solanke", [{ ...solanke[0], nameKr: null }, solanke[1]], {
        provider: "lfa",
        playerId: "lfa-solanke",
      })
    ).toEqual({ label: "도미닉 솔랑케", reason: "single-korean" })
  })
  it("다른 출처 행의 한글이 두 가지면 고르지 않는다", () => {
    const rows: SquadName[] = [
      { ...solanke[0], nameKr: null },
      solanke[1],
      { ...solanke[1], playerId: "sw-2", nameKr: "다른 솔랑케" },
    ]
    expect(
      localizePlayerName("D. Solanke", rows, { provider: "lfa", playerId: "lfa-solanke" })
    ).toBe("D. Solanke")
  })
  it("rejected는 사용하지 않고 이적한 선수는 과거 표기에 사용할 수 있다", () => {
    expect(
      localizePlayerName("D. Solanke", [{ ...solanke[0], status: "rejected" }], {
        provider: "lfa",
        playerId: "lfa-solanke",
      })
    ).toBe("D. Solanke")
    expect(
      localizePlayerName("D. Solanke", [{ ...solanke[0], status: "left" }], {
        provider: "lfa",
        playerId: "lfa-solanke",
      })
    ).toBe("도미닉 솔랑케")
  })
  it("다른 팀의 명단에는 해당 ID가 없으면 원문을 유지한다", () => {
    expect(
      localizePlayerName("D. Solanke", squad, { provider: "lfa", playerId: "lfa-solanke" })
    ).toBe("D. Solanke")
  })
  it("성만 있는 후보의 이니셜 불일치를 무시하지 않는다", () => {
    expect(localizePlayerName("A. Smith", [{ nameEn: "B. Smith", nameKr: "비 스미스" }])).toBe(
      "A. Smith"
    )
  })
  it("성의 일부 문자열로 다른 선수를 선택하지 않는다", () => {
    expect(localizePlayerName("D. Sol", solanke)).toBe("D. Sol")
  })
})

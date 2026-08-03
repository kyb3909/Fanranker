import { describe, it, expect } from "vitest"
import { normalizePlayerKey, transferIdentityKey, identityKey, baseSlug } from "@/lib/saga/identity"
import { STAGE_FLOW, STAGE_LABEL, stageIndex, nextStage } from "@/lib/saga/stages"

describe("normalizePlayerKey", () => {
  it("소문자·공백 접기", () => {
    expect(normalizePlayerKey("Victor Osimhen")).toBe("victor-osimhen")
  })

  it("분음부호 제거 (Sáenz → saenz)", () => {
    expect(normalizePlayerKey("Sáenz")).toBe("saenz")
    expect(normalizePlayerKey("Nicolò Zaniolo")).toBe("nicolo-zaniolo")
  })

  it("특수문자·연속 구분자 접기 + 양끝 trim", () => {
    expect(normalizePlayerKey("  O'Brien Jr. ")).toBe("o-brien-jr")
  })
})

describe("transferIdentityKey — D2: 목적지 클럽은 identity 에 없다", () => {
  it("같은 선수·방향·윈도우면 목적지가 달라도 같은 키", () => {
    // 밀란 관심 기사와 바이에른 관심 기사가 문서를 쪼개면 안 된다
    const key = transferIdentityKey({
      playerKey: "Victor Osimhen",
      direction: "in",
      windowKey: "2026-summer",
    })
    expect(key).toBe("transfer:victor-osimhen:in:2026-summer")
  })

  it("방향이 다르면 다른 사가 (IN 과 OUT 은 별개 드라마)", () => {
    const base = { playerKey: "son heung-min", windowKey: "2026-summer" }
    expect(transferIdentityKey({ ...base, direction: "in" })).not.toBe(
      transferIdentityKey({ ...base, direction: "out" })
    )
  })

  it("표기 변형이 같은 키로 수렴 (멱등 생성의 전제)", () => {
    const a = transferIdentityKey({
      playerKey: "Kolo Muani",
      direction: "in",
      windowKey: "2026-summer",
    })
    const b = transferIdentityKey({
      playerKey: "kolo  muani",
      direction: "in",
      windowKey: "2026-summer",
    })
    expect(a).toBe(b)
  })
})

describe("identityKey — saga_type 분기 (match/season 무마이그레이션 확장)", () => {
  it("transfer: subject jsonb 에서 조립", () => {
    expect(
      identityKey("transfer", {
        player_key: "victor osimhen",
        direction: "in",
        window_key: "2026-summer",
      })
    ).toBe("transfer:victor-osimhen:in:2026-summer")
  })

  it("direction 미지정은 in 으로 폴백", () => {
    expect(identityKey("transfer", { player_key: "x", window_key: "w" })).toContain(":in:")
  })

  it("match: fixture_id 가 곧 identity (D3)", () => {
    expect(identityKey("match", { fixture_id: 12345 })).toBe("match:12345")
  })

  it("season: 팀 + 시즌 (D4)", () => {
    expect(identityKey("season", { team_id: "arsenal", season: "2026-27" })).toBe(
      "season:arsenal:2026-27"
    )
  })
})

describe("baseSlug", () => {
  it("transfer: 선수-방향-윈도우 축약", () => {
    expect(
      baseSlug("transfer", {
        player_key: "victor osimhen",
        direction: "in",
        window_key: "2026-summer",
      })
    ).toBe("victor-osimhen-in-2026s")
  })

  it("match: m-fixture", () => {
    expect(baseSlug("match", { fixture_id: 777 })).toBe("m-777")
  })
})

describe("stages — transfer 플로우", () => {
  it("interest → done 순서 고정", () => {
    expect(STAGE_FLOW.transfer[0]).toBe("interest")
    expect(STAGE_FLOW.transfer[STAGE_FLOW.transfer.length - 1]).toBe("done")
  })

  it("stageIndex: 미지의 stage 는 0 폴백 (진행도 바 렌더가 죽으면 안 된다)", () => {
    expect(stageIndex("transfer", "bid")).toBeGreaterThan(0)
    expect(stageIndex("transfer", "nonsense")).toBe(0)
  })

  it("nextStage: 전진·후퇴 모두 허용, 유효 세트 밖 값만 거부 (PRD §4.2 — 후퇴도 이벤트)", () => {
    expect(nextStage("transfer", "bid", "medical")).toBe("medical")
    // 협상 결렬 임박 → 단계가 뒤로 가는 것도 드라마의 일부
    expect(nextStage("transfer", "negotiation", "interest")).toBe("interest")
    // match stage 를 transfer 에 꽂으면 거부 — 교차 오염 방지 (DB CHECK 없음의 대가를 코드가 진다)
    expect(nextStage("transfer", "bid", "live")).toBe("bid")
    expect(nextStage("transfer", "bid", null)).toBe("bid")
  })

  it("모든 transfer stage 에 한글 라벨 존재", () => {
    for (const st of STAGE_FLOW.transfer) {
      expect(STAGE_LABEL[st], `label for ${st}`).toBeTruthy()
    }
  })
})

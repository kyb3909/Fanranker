import { describe, it, expect } from "vitest"
import {
  normalizePlayerKey,
  transferIdentityKey,
  identityKey,
  baseSlug,
  isSamePlayerKey,
} from "@/lib/saga/identity"
import { buildAliasIndex, canonicalizePlayer } from "@/lib/saga/canonical"
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

describe("isSamePlayerKey — 성만 쓴 표기와 풀네임 병합 (2026-08-04)", () => {
  it("조던 헨더슨 = 헨더슨 (한쪽이 부분집합)", () => {
    expect(isSamePlayerKey("jordan-henderson", "henderson")).toBe(true)
    expect(isSamePlayerKey("henderson", "jordan-henderson")).toBe(true)
  })

  it("성만 같고 이름이 다르면 남 (james vs jordan)", () => {
    expect(isSamePlayerKey("james-henderson", "jordan-henderson")).toBe(false)
  })

  it("성이 다르면 남", () => {
    expect(isSamePlayerKey("jordan-henderson", "jordan-pickford")).toBe(false)
  })

  it("jr 접미는 무시", () => {
    expect(isSamePlayerKey("vinicius-jr", "vinicius")).toBe(true)
  })

  it("하이픈 복합 성은 마지막 토큰만 같은 다른 선수와 합치지 않는다", () => {
    expect(isSamePlayerKey("james-ward-prowse", "ward-prowse")).toBe(true)
    expect(isSamePlayerKey("james-ward-prowse", "matt-prowse")).toBe(false)
  })

  it("빈 키는 동일인으로 취급하지 않는다", () => {
    expect(isSamePlayerKey("", "henderson")).toBe(false)
  })
})

describe("canonicalizePlayer — 사전 성(姓) 폴백", () => {
  const index = buildAliasIndex([
    { romanized: "Jordan Henderson", preferred_ko: "조던 헨더슨", surfaces: ["헨더슨"] },
    // 동성이인 — 성만으로는 병합 금지
    { romanized: "Gabriel Silva", preferred_ko: "가브리엘 실바", surfaces: [] },
    { romanized: "Thiago Silva", preferred_ko: "치아구 실바", surfaces: [] },
  ])

  it("풀네임 exact 매칭", () => {
    expect(canonicalizePlayer("Jordan Henderson", index)).toMatchObject({
      key: "jordan-henderson",
      matched: true,
    })
  })

  it("성만 와도 유일하면 병합 (Henderson → jordan-henderson)", () => {
    expect(canonicalizePlayer("Henderson", index)).toMatchObject({
      key: "jordan-henderson",
      ko: "조던 헨더슨",
      matched: true,
    })
  })

  it("동성이인 성은 병합하지 않음 (Silva)", () => {
    expect(canonicalizePlayer("Silva", index).matched).toBe(false)
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

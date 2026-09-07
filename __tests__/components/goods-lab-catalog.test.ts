import { describe, expect, it } from "vitest"
import {
  FAN_SCENE,
  GALLERY,
  GOAL,
  ITEMS,
  SELL_ITEMS,
  SIGNAL_ITEM,
  STAGE_POLICY,
  acceptsInterest,
  canRequest,
  demandFor,
  interestItemsOf,
  itemDemand,
  itemOf,
  partnerRollup,
  piecesWanting,
  splitOf,
} from "@/app/goods-lab/fixtures"

/**
 * 굿즈랩 카탈로그·파트너 요약 (2026-09-08).
 *
 * 이 파일이 지키는 것은 하나다 — **화면에 뜨는 모든 수요 숫자는 `demandFor` 에서 나온다.**
 * 요약이 따로 계산하면 아래 보드와 갈리고, 표를 읽는 사람이 미팅에서 그 자리에 잡아낸다.
 * (이전에 같은 맨유 PVC 가 한쪽 53, 다른 쪽 178 로 갈렸던 사고의 재발 방지)
 */

describe("품목 정책", () => {
  it("판매·요청은 다른 축이다 — 신호 품목은 안 팔지만 요청은 받는다", () => {
    expect(acceptsInterest(itemOf("sticker"))).toBe(true)
    expect(acceptsInterest(SIGNAL_ITEM)).toBe(true)
    expect(SIGNAL_ITEM.stage).toBe("signal")
    // 2단계 품목은 아직 요청도 받지 않는다
    expect(acceptsInterest(itemOf("pvcfig"))).toBe(false)
  })

  it("모든 품목이 왜 파는지/왜 아직인지 설명을 갖는다", () => {
    for (const item of ITEMS) {
      const policy = STAGE_POLICY[item.stage]
      expect(policy, item.id).toBeTruthy()
      expect(policy.why.length, item.id).toBeGreaterThan(10)
    }
  })

  it("파는 것은 인쇄 소품 3종뿐이다", () => {
    expect(SELL_ITEMS.map((i) => i.id).sort()).toEqual(["acrylkeyring", "acrylstand", "sticker"])
  })
})

describe("품목별 작품 연결", () => {
  it("작가가 연 작품만 그 품목으로 요청받는다", () => {
    for (const piece of piecesWanting("acrylstand")) {
      expect(canRequest(piece.id, "acrylstand"), piece.id).toBe(true)
      expect(piece.opened, piece.id).toBe(true)
    }
  })

  it("아직 요청을 안 받는 품목에는 연결된 작품이 없다", () => {
    expect(piecesWanting("pvcfig")).toEqual([])
  })

  it("품목 합계는 작품별 요청의 합과 정확히 같다", () => {
    for (const item of [...SELL_ITEMS, SIGNAL_ITEM]) {
      const bySum = GALLERY.filter((g) => g.opened).reduce(
        (sum, g) => sum + demandFor(g.id, item.id, FAN_SCENE),
        0
      )
      expect(itemDemand(item.id, FAN_SCENE), item.id).toBe(bySum)
    }
  })

  it("팬이 고른 관심 하나가 품목 합계에 한 건만 반영된다", () => {
    const piece = piecesWanting("sticker")[0]
    const before = itemDemand("sticker", FAN_SCENE)
    const after = itemDemand("sticker", FAN_SCENE, { [`${piece.id}:sticker`]: true })
    expect(after - before).toBe(1)
  })
})

describe("파트너 요약 — 아래 보드와 같은 값이어야 한다", () => {
  const rollup = partnerRollup(FAN_SCENE)

  it("총 요청은 작품×품목 전수 합과 같다", () => {
    const bySum = GALLERY.reduce(
      (sum, piece) =>
        sum +
        interestItemsOf(piece).reduce((s, item) => s + demandFor(piece.id, item.id, FAN_SCENE), 0),
      0
    )
    expect(rollup.requests).toBe(bySum)
  })

  it("금액에 신호 품목을 넣지 않는다 — 팔지 않는 것에서 매출이 생기면 안 된다", () => {
    const signalDemand = itemDemand(SIGNAL_ITEM.id, FAN_SCENE)
    expect(signalDemand).toBeGreaterThan(0)
    // 신호 요청이 있는데도 금액은 판매 3종만으로 설명된다
    const sellOnly = SELL_ITEMS.reduce(
      (sum, item) => sum + item.price * itemDemand(item.id, FAN_SCENE),
      0
    )
    expect(rollup.grossCeilingWon).toBe(sellOnly)
  })

  it("로열티·작가 몫은 splitOf 와 같은 배분을 쓴다", () => {
    const royalty = SELL_ITEMS.reduce(
      (sum, item) => sum + splitOf(item.price).rights * itemDemand(item.id, FAN_SCENE),
      0
    )
    const creator = SELL_ITEMS.reduce(
      (sum, item) => sum + splitOf(item.price).creator * itemDemand(item.id, FAN_SCENE),
      0
    )
    expect(rollup.royaltyCeilingWon).toBe(royalty)
    expect(rollup.creatorCeilingWon).toBe(creator)
    // 로열티는 소비자가 합보다 작다 — 자릿수 사고 방지
    expect(rollup.royaltyCeilingWon).toBeLessThan(rollup.grossCeilingWon)
  })

  it("제작 검토선을 넘긴 조합만 센다", () => {
    const combos = GALLERY.flatMap((piece) =>
      interestItemsOf(piece).map((item) => demandFor(piece.id, item.id, FAN_SCENE))
    ).filter((n) => n >= GOAL)
    expect(rollup.readyCombos).toBe(combos.length)
  })

  it("승인 주체가 없는 건을 큐에 세지 않고 따로 센다", () => {
    expect(rollup.blocked).toBeGreaterThan(0)
  })

  it("시나리오를 바꾸면 요청과 금액이 함께 움직인다", () => {
    const warming = partnerRollup("warming")
    const licensing = partnerRollup("licensing")
    expect(warming.requests).toBeLessThan(licensing.requests)
    expect(warming.grossCeilingWon).toBeLessThan(licensing.grossCeilingWon)
  })
})

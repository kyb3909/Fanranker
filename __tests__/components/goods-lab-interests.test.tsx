import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import {
  CAMPAIGNS,
  FAN_SCENE,
  GALLERY,
  canRequest,
  demandFor,
  fanCampaigns,
  fanStateOf,
  findPiece,
  parseWanted,
  pieceDemand,
  pieceOf,
  teamDemand,
} from "@/app/goods-lab/fixtures"
import { InterestProvider, useInterests } from "@/app/goods-lab/interest-provider"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe("굿즈 관심 집계", () => {
  it("작가가 닫은 작품/품목과 없는 주소는 다른 작품으로 대체하지 않는다", () => {
    expect(findPiece("unknown")).toBeUndefined()
    expect(canRequest("g5", "sticker")).toBe(false)
    expect(canRequest("g7", "acrylkeyring")).toBe(false)
    expect(demandFor("g5", "sticker", FAN_SCENE, { "g5:sticker": true })).toBe(0)
    expect(demandFor("g7", "acrylkeyring", FAN_SCENE, { "g7:acrylkeyring": true })).toBe(0)
  })

  it("한 팬의 두 품목 선택은 작품과 팀 보드에 각각 한 건씩 반영한다", () => {
    const wanted = { "g7:sticker": true, "g7:acrylstand": true }
    expect(
      pieceDemand(pieceOf("g7"), FAN_SCENE, wanted) - pieceDemand(pieceOf("g7"), FAN_SCENE)
    ).toBe(2)
    for (const itemId of ["sticker", "acrylstand"]) {
      expect(
        teamDemand("jeonbuk", itemId, FAN_SCENE, wanted) - teamDemand("jeonbuk", itemId, FAN_SCENE)
      ).toBe(1)
    }
    expect(teamDemand("jeonbuk", "acrylkeyring", FAN_SCENE)).toBe(
      demandFor("g14", "acrylkeyring", FAN_SCENE)
    )
  })

  it("승인 및 30명 관심을 제작 확정으로 취급하지 않는다", () => {
    const campaign = { ...CAMPAIGNS[0], pieceId: "g7", itemId: "sticker" }
    const baseline = demandFor("g7", "sticker", "warming")
    const threshold = { ...pieceOf("g7"), requests: 37 }
    const original = GALLERY.findIndex((piece) => piece.id === threshold.id)
    const saved = GALLERY[original]
    try {
      GALLERY[original] = threshold
      expect(demandFor("g7", "sticker", "warming")).toBe(29)
      expect(fanStateOf(campaign, "warming")).toBe("collecting")
      expect(fanStateOf(campaign, "warming", { "g7:sticker": true })).toBe("checking")
      expect(fanStateOf(campaign, "licensing")).toBe("preparing")
    } finally {
      GALLERY[original] = saved
    }
    expect(demandFor("g7", "sticker", "warming")).toBe(baseline)
  })

  it("수정/보류 결과는 관심 수와 무관하게 남긴다", () => {
    const rejected = CAMPAIGNS.find((campaign) => campaign.id === "c4")!
    const revision = CAMPAIGNS.find((campaign) => campaign.id === "c3")!
    expect(fanCampaigns(FAN_SCENE)).toContain(rejected)
    expect(fanStateOf(rejected, FAN_SCENE)).toBe("paused")
    expect(fanStateOf(revision, FAN_SCENE)).toBe("revising")
  })

  it("손상되거나 더 이상 허용되지 않는 저장값을 버린다", () => {
    expect(parseWanted("invalid-json")).toEqual({})
    expect(parseWanted("[]")).toEqual({})
    expect(
      parseWanted(
        JSON.stringify({
          "g7:sticker": true,
          "g7:acrylkeyring": true,
          "g5:sticker": true,
          "unknown:solid": true,
          "g7:solid": "true",
        })
      )
    ).toEqual({ "g7:sticker": true })
  })
})

describe("시연 선택 유지", () => {
  it("복원 전에 저장값을 덮어쓰지 않고, 재진입과 선택 취소를 유지한다", async () => {
    window.localStorage.setItem("goods-lab:interests:v1", JSON.stringify({ "g7:sticker": true }))
    const first = renderHook(() => useInterests(), { wrapper: InterestProvider })
    await waitFor(() => expect(first.result.current.hydrated).toBe(true))
    expect(first.result.current.wanted["g7:sticker"]).toBe(true)
    act(() => first.result.current.toggle("g7", "acrylstand"))
    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("goods-lab:interests:v1")!)).toEqual({
        "g7:sticker": true,
        "g7:acrylstand": true,
      })
    )
    first.unmount()
    const second = renderHook(() => useInterests(), { wrapper: InterestProvider })
    await waitFor(() => expect(second.result.current.wanted["g7:acrylstand"]).toBe(true))
    act(() => second.result.current.toggle("g7", "sticker"))
    expect(second.result.current.wanted["g7:sticker"]).toBeUndefined()
  })

  it("저장이 차단되어도 현재 화면에서 관심 선택과 취소가 동작한다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    const { result } = renderHook(() => useInterests(), { wrapper: InterestProvider })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    act(() => result.current.toggle("g7", "sticker"))
    expect(result.current.persistent).toBe(false)
    expect(result.current.wanted["g7:sticker"]).toBe(true)
    act(() => result.current.toggle("g7", "sticker"))
    expect(result.current.wanted["g7:sticker"]).toBeUndefined()
  })
})

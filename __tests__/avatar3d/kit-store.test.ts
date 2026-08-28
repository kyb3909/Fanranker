import { describe, expect, it } from "vitest"
import { createInitialKitStore, kitStoreReducer, ownsKit } from "@/lib/metaverse/avatar3d/kit-store"
import { KIT_REFERENCE_SOURCES } from "@/lib/metaverse/avatar3d/kit-reference-sources"
import {
  AVAILABLE_CLUBS,
  CLUB_ROADMAP,
  DEFAULT_KIT_KEY,
  getKitsForClub,
  KIT_BY_KEY,
  KIT_CATALOG,
} from "@/lib/metaverse/avatar3d/kits"

describe("avatar kit store", () => {
  it("previews an unowned kit without purchasing it", () => {
    const state = kitStoreReducer(createInitialKitStore(), {
      type: "preview",
      kitKey: "mersey-deep-red-26-home",
    })

    expect(state.previewKitKey).toBe("mersey-deep-red-26-home")
    expect(ownsKit(state, "mersey-deep-red-26-home")).toBe(false)
    expect(state.balanceGold).toBe(2_400)
  })

  it("charges once, grants ownership, and equips after purchase", () => {
    const pending = kitStoreReducer(createInitialKitStore(), {
      type: "purchase-start",
      kitKey: "mersey-deep-red-26-home",
    })
    const purchased = kitStoreReducer(pending, {
      type: "purchase-success",
      kitKey: "mersey-deep-red-26-home",
    })
    const duplicate = kitStoreReducer(purchased, {
      type: "purchase-start",
      kitKey: "mersey-deep-red-26-home",
    })

    expect(purchased.balanceGold).toBe(1_850)
    expect(purchased.equippedKitKey).toBe("mersey-deep-red-26-home")
    expect(ownsKit(purchased, "mersey-deep-red-26-home")).toBe(true)
    expect(duplicate.balanceGold).toBe(1_850)
    expect(duplicate.ownedKitKeys).toHaveLength(2)
  })

  it("does not equip an unowned kit", () => {
    const state = kitStoreReducer(createInitialKitStore(), {
      type: "equip",
      kitKey: "manchester-sky-26-home",
    })

    expect(state.equippedKitKey).toBe("red-horizon-home")
    expect(state.notice).toBe("먼저 유니폼을 구매해야 합니다.")
  })

  it("clears pending state without charging when a purchase fails", () => {
    const pending = kitStoreReducer(createInitialKitStore(), {
      type: "purchase-start",
      kitKey: "mersey-deep-red-26-home",
    })
    const failed = kitStoreReducer(pending, {
      type: "purchase-failure",
      kitKey: "mersey-deep-red-26-home",
    })

    expect(failed.pendingKitKey).toBeNull()
    expect(failed.balanceGold).toBe(2_400)
    expect(ownsKit(failed, "mersey-deep-red-26-home")).toBe(false)
  })

  it("keeps club collections grouped with unique kit keys", () => {
    const chelseaKits = getKitsForClub("chelsea")

    expect(CLUB_ROADMAP).toHaveLength(18)
    // 로마·나폴리·도르트문트·레버쿠젠은 정의만 두고 노출 중단 (2026-08-29 운영자 지시)
    expect(AVAILABLE_CLUBS.map((club) => club.clubKey)).toEqual(
      CLUB_ROADMAP.map((club) => club.clubKey).filter(
        (key) => !["roma", "napoli", "dortmund", "leverkusen"].includes(key)
      )
    )
    // 올해 홈 유니폼 1벌씩만 노출 (2026-08-29 운영자 지시)
    expect(KIT_CATALOG).toHaveLength(14)
    expect(AVAILABLE_CLUBS.every((club) => getKitsForClub(club.clubKey).length === 1)).toBe(true)
    expect(chelseaKits).toHaveLength(1)
    expect(chelseaKits.map((kit) => kit.slot)).toEqual(["home"])
    expect(new Set(KIT_CATALOG.map((kit) => kit.kitKey)).size).toBe(KIT_CATALOG.length)
  })

  it("ships every active expansion club with current home/away and two retro slots", () => {
    const expansionClubKeys = [
      "manchester-united",
      "liverpool",
      "manchester-city",
      "tottenham",
      "real-madrid",
      "barcelona",
      "atletico-madrid",
      "bayern-munich",
      "psg",
      "ac-milan",
      "juventus",
      "inter-milan",
    ] as const
    // 정의·레퍼런스는 유지하되 카탈로그에서만 빠진 구단들
    const pausedClubKeys = ["roma", "napoli", "dortmund", "leverkusen"] as const

    expect(AVAILABLE_CLUBS.slice(2).map((club) => club.clubKey)).toEqual(expansionClubKeys)
    expect(Object.keys(KIT_REFERENCE_SOURCES)).toEqual([...expansionClubKeys, ...pausedClubKeys])
    for (const clubKey of pausedClubKeys) {
      expect(getKitsForClub(clubKey)).toHaveLength(0)
    }
    for (const clubKey of expansionClubKeys) {
      const kits = getKitsForClub(clubKey)
      const sources = KIT_REFERENCE_SOURCES[clubKey]
      expect(kits.map((kit) => kit.slot)).toEqual(["home"])
      expect(kits[0]?.collection).toBe("26/27 HOME INSPIRED")
      expect(sources.season).toBe("2026/27")
      expect(sources.verifiedAt).toBe("2026-08-28")
      expect(sources.homeUrl).toMatch(/^https:\/\//)
      expect(sources.awayUrl).toMatch(/^https:\/\//)
    }
  })

  it("ships the flagship home kit with construction-level design data", () => {
    expect(KIT_BY_KEY.get(DEFAULT_KIT_KEY)).toMatchObject({
      clubKey: "arsenal",
      collar: "crew",
      design: "contrast-raglan",
      pattern: "plain",
    })
  })
})

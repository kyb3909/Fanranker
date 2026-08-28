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
      kitKey: "ivory-orbit-away",
    })

    expect(state.previewKitKey).toBe("ivory-orbit-away")
    expect(ownsKit(state, "ivory-orbit-away")).toBe(false)
    expect(state.balanceGold).toBe(2_400)
  })

  it("charges once, grants ownership, and equips after purchase", () => {
    const pending = kitStoreReducer(createInitialKitStore(), {
      type: "purchase-start",
      kitKey: "signal-night-third",
    })
    const purchased = kitStoreReducer(pending, {
      type: "purchase-success",
      kitKey: "signal-night-third",
    })
    const duplicate = kitStoreReducer(purchased, {
      type: "purchase-start",
      kitKey: "signal-night-third",
    })

    expect(purchased.balanceGold).toBe(1_500)
    expect(purchased.equippedKitKey).toBe("signal-night-third")
    expect(ownsKit(purchased, "signal-night-third")).toBe(true)
    expect(duplicate.balanceGold).toBe(1_500)
    expect(duplicate.ownedKitKeys).toHaveLength(2)
  })

  it("does not equip an unowned kit", () => {
    const state = kitStoreReducer(createInitialKitStore(), {
      type: "equip",
      kitKey: "violet-pulse",
    })

    expect(state.equippedKitKey).toBe("red-horizon-home")
    expect(state.notice).toBe("먼저 유니폼을 구매해야 합니다.")
  })

  it("clears pending state without charging when a purchase fails", () => {
    const pending = kitStoreReducer(createInitialKitStore(), {
      type: "purchase-start",
      kitKey: "ivory-orbit-away",
    })
    const failed = kitStoreReducer(pending, {
      type: "purchase-failure",
      kitKey: "ivory-orbit-away",
    })

    expect(failed.pendingKitKey).toBeNull()
    expect(failed.balanceGold).toBe(2_400)
    expect(ownsKit(failed, "ivory-orbit-away")).toBe(false)
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
    expect(KIT_CATALOG).toHaveLength(60)
    expect(AVAILABLE_CLUBS.every((club) => getKitsForClub(club.clubKey).length >= 4)).toBe(true)
    expect(chelseaKits).toHaveLength(4)
    expect(chelseaKits.map((kit) => kit.slot)).toEqual(["home", "away", "retro", "retro"])
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
      expect(kits.map((kit) => kit.slot)).toEqual(["home", "away", "retro", "retro"])
      expect(kits[0]?.collection).toBe("26/27 HOME INSPIRED")
      expect(kits[1]?.collection).toBe("26/27 AWAY INSPIRED")
      expect(sources.season).toBe("2026/27")
      expect(sources.verifiedAt).toBe("2026-08-28")
      expect(sources.homeUrl).toMatch(/^https:\/\//)
      expect(sources.awayUrl).toMatch(/^https:\/\//)
    }
  })

  it("ships the flagship home and away kits with construction-level design data", () => {
    expect(KIT_BY_KEY.get(DEFAULT_KIT_KEY)).toMatchObject({
      clubKey: "arsenal",
      collar: "crew",
      design: "contrast-raglan",
      pattern: "plain",
    })
    expect(KIT_BY_KEY.get("ivory-orbit-away")).toMatchObject({
      clubKey: "arsenal",
      collar: "crew",
      design: "contrast-raglan",
      pattern: "chevron",
    })
  })
})

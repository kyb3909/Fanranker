import { describe, it, expect } from "vitest"
import {
  ALL_COMMUNITIES,
  SPORTS_COMMUNITIES,
  LIFE_COMMUNITIES,
  COMMUNITY_NAMES,
} from "@/lib/constants/communities"

describe("community constants", () => {
  it("has 4 sports communities", () => {
    expect(SPORTS_COMMUNITIES).toHaveLength(4)
    const slugs = SPORTS_COMMUNITIES.map((c) => c.slug)
    expect(slugs).toEqual(["football", "baseball", "basketball", "volleyball"])
  })

  it("has 6 life communities", () => {
    expect(LIFE_COMMUNITIES).toHaveLength(6)
    const slugs = LIFE_COMMUNITIES.map((c) => c.slug)
    expect(slugs).toContain("game")
    expect(slugs).toContain("movies")
    expect(slugs).toContain("anime")
    expect(slugs).toContain("free-board")
  })

  it("ALL_COMMUNITIES = SPORTS + LIFE", () => {
    expect(ALL_COMMUNITIES).toHaveLength(SPORTS_COMMUNITIES.length + LIFE_COMMUNITIES.length)
  })

  it("every community has required fields", () => {
    for (const c of ALL_COMMUNITIES) {
      expect(c.slug).toBeTruthy()
      expect(c.name).toBeTruthy()
      expect(c.emoji).toBeTruthy()
      expect(c.description).toBeTruthy()
    }
  })

  it("every community has SEO metadata", () => {
    for (const c of ALL_COMMUNITIES) {
      expect(c.metaDescription).toBeTruthy()
      expect(c.keywords).toBeDefined()
      expect(c.keywords!.length).toBeGreaterThan(0)
    }
  })

  it("all slugs are unique", () => {
    const slugs = ALL_COMMUNITIES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("COMMUNITY_NAMES maps all active slugs", () => {
    for (const c of ALL_COMMUNITIES) {
      expect(COMMUNITY_NAMES[c.slug]).toBe(c.name)
    }
  })

  it("COMMUNITY_NAMES maps legacy slugs", () => {
    expect(COMMUNITY_NAMES["overseas-football"]).toBe("축구")
    expect(COMMUNITY_NAMES["domestic-football"]).toBe("축구")
    expect(COMMUNITY_NAMES["esports"]).toBe("게임")
    expect(COMMUNITY_NAMES["soccer"]).toBe("축구")
    expect(COMMUNITY_NAMES["free"]).toBe("자유")
  })

  it("slugs only contain valid URL characters", () => {
    for (const c of ALL_COMMUNITIES) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })
})

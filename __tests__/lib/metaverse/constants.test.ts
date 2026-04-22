import { describe, it, expect } from "vitest"
import {
  METAVERSE,
  pinToWorldX,
  pinToWorldY,
  worldToPinX,
  worldToPinY,
} from "@/lib/metaverse/constants"

describe("metaverse/constants", () => {
  describe("pin ↔ world 좌표 변환", () => {
    it("pin 0 → world 0", () => {
      expect(pinToWorldX(0)).toBe(0)
      expect(pinToWorldY(0)).toBe(0)
    })

    it("pin 100 → world 최대값 (경계)", () => {
      expect(pinToWorldX(100)).toBe(METAVERSE.WORLD_WIDTH)
      expect(pinToWorldY(100)).toBe(METAVERSE.WORLD_HEIGHT)
    })

    it("pin 50 → world 중앙", () => {
      expect(pinToWorldX(50)).toBe(METAVERSE.WORLD_WIDTH / 2)
      expect(pinToWorldY(50)).toBe(METAVERSE.WORLD_HEIGHT / 2)
    })

    it("world → pin 역변환 (round-trip)", () => {
      const samples = [0, 10.5, 33.3, 51, 70, 99.9]
      for (const pin of samples) {
        expect(worldToPinX(pinToWorldX(pin))).toBeCloseTo(pin, 10)
        expect(worldToPinY(pinToWorldY(pin))).toBeCloseTo(pin, 10)
      }
    })
  })

  describe("상수 sanity", () => {
    it("proximity 반경이 월드보다 작음", () => {
      expect(METAVERSE.BUBBLE_PROXIMITY_PX).toBeLessThan(METAVERSE.WORLD_WIDTH)
      expect(METAVERSE.BUBBLE_PROXIMITY_PX).toBeLessThan(METAVERSE.WORLD_HEIGHT)
    })

    it("채널 접두사 일관성", () => {
      expect(METAVERSE.CHANNEL_WORLD.startsWith("metaverse:")).toBe(true)
      expect(METAVERSE.CHANNEL_CHAT_ROOM_PREFIX.startsWith("metaverse:")).toBe(true)
      expect(METAVERSE.CHANNEL_STADIUM_PREFIX.startsWith("metaverse:")).toBe(true)
    })

    it("플레이어 속도/크기 양수", () => {
      expect(METAVERSE.PLAYER_SPEED).toBeGreaterThan(0)
      expect(METAVERSE.PLAYER_SIZE).toBeGreaterThan(0)
      expect(METAVERSE.BUBBLE_DURATION_MS).toBeGreaterThan(0)
    })

    it("throttle/쿨다운이 bubble 표시보다 짧음", () => {
      expect(METAVERSE.POSITION_THROTTLE_MS).toBeLessThan(METAVERSE.BUBBLE_DURATION_MS)
      expect(METAVERSE.BUBBLE_COOLDOWN_MS).toBeLessThanOrEqual(METAVERSE.BUBBLE_DURATION_MS)
    })
  })
})

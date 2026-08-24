import { describe, it, expect } from "vitest"
import { mergeRosterIntoSlots, slotCodes } from "@/components/draft/pitch-viz"
import type { Player, Position } from "@/lib/draft/players"

/**
 * 자동 배치 — **제 포지션을 먼저 채운다**.
 *
 * 슬롯 순서가 GK→DF→MF→FW 라, "설 수 있는 첫 빈 자리"로 한 번에 넣으면 미드가 빈
 * 수비 자리에 먼저 빨려 들어간다. 운영자 제보로 드러난 실제 증상:
 * "FW인데 MF 자리에 가 있고 MF인데 DF 자리에 가 있다".
 */

let seq = 0
const mk = (position: Position, price = 5): Player => ({
  id: `x${++seq}`,
  name: `p${seq}`,
  nameKo: `선수${seq}`,
  team: "T",
  teamKo: "티",
  position,
  price,
})

/** 슬롯맵 → "코드:포지션" 요약 */
function placedAt(slots: Record<string, Player | null>, p: Player): string | null {
  const hit = Object.keys(slots).find((c) => slots[c]?.id === p.id)
  return hit ?? null
}

describe("mergeRosterIntoSlots — 제 포지션 우선", () => {
  it("미드는 빈 수비 자리가 있어도 미드 자리로 간다", () => {
    const mf = mk("MF")
    const slots = mergeRosterIntoSlots({}, [mf], "4-4-2")
    expect(placedAt(slots, mf)?.startsWith("MF")).toBe(true)
  })

  it("공격수는 빈 미드 자리가 있어도 공격 자리로 간다", () => {
    const fw = mk("FW")
    const slots = mergeRosterIntoSlots({}, [fw], "4-4-2")
    expect(placedAt(slots, fw)?.startsWith("FW")).toBe(true)
  })

  it("여러 포지션이 섞여도 전원 제 자리에 앉는다", () => {
    const gk = mk("GK")
    const df = mk("DF")
    const mf = mk("MF")
    const fw = mk("FW")
    const slots = mergeRosterIntoSlots({}, [gk, df, mf, fw], "4-4-2")
    expect(placedAt(slots, gk)?.startsWith("GK")).toBe(true)
    expect(placedAt(slots, df)?.startsWith("DF")).toBe(true)
    expect(placedAt(slots, mf)?.startsWith("MF")).toBe(true)
    expect(placedAt(slots, fw)?.startsWith("FW")).toBe(true)
  })

  it("제 포지션이 다 차면 그때만 인접 자리로 흘린다", () => {
    // 4-4-2 는 FW 자리가 2개 — 세 번째 공격수는 미드로 내려온다
    const fws = [mk("FW"), mk("FW"), mk("FW")]
    const slots = mergeRosterIntoSlots({}, fws, "4-4-2")
    const where = fws.map((p) => placedAt(slots, p) ?? "")
    expect(where.filter((c) => c.startsWith("FW"))).toHaveLength(2)
    expect(where.filter((c) => c.startsWith("MF"))).toHaveLength(1)
  })

  it("수비수가 넘치면 미드로 올라간다 (반대 방향도 성립)", () => {
    const dfs = Array.from({ length: 5 }, () => mk("DF"))
    const slots = mergeRosterIntoSlots({}, dfs, "4-4-2")
    const where = dfs.map((p) => placedAt(slots, p) ?? "")
    expect(where.filter((c) => c.startsWith("DF"))).toHaveLength(4)
    expect(where.filter((c) => c.startsWith("MF"))).toHaveLength(1)
  })

  it("손으로 옮긴 배치는 픽이 늘어도 유지된다", () => {
    const fw = mk("FW")
    const mf = mk("MF")
    // FW 를 일부러 MF 자리에 둔 상태
    const arranged: Record<string, Player | null> = { MF1: fw }
    const slots = mergeRosterIntoSlots(arranged, [fw, mf], "4-4-2")
    expect(slots.MF1?.id).toBe(fw.id) // 그대로
    expect(placedAt(slots, mf)?.startsWith("MF")).toBe(true) // 새 선수는 남은 미드 자리로
  })

  it("팀에서 빠진 선수의 자리는 비운다", () => {
    const a = mk("MF")
    const b = mk("MF")
    const arranged: Record<string, Player | null> = { MF1: a }
    const slots = mergeRosterIntoSlots(arranged, [b], "4-4-2")
    expect(Object.values(slots).some((p) => p?.id === a.id)).toBe(false)
    expect(placedAt(slots, b)?.startsWith("MF")).toBe(true)
  })

  it("슬롯 코드는 포메이션 구성과 일치한다", () => {
    const codes = slotCodes("3-5-2")
    expect(codes.filter((c) => c.startsWith("DF"))).toHaveLength(3)
    expect(codes.filter((c) => c.startsWith("MF"))).toHaveLength(5)
    expect(codes.filter((c) => c.startsWith("FW"))).toHaveLength(2)
  })
})

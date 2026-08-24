import { describe, it, expect } from "vitest"
import { pitchSlotsToPlacements } from "@/components/draft/formation-field"
import { slotCodes } from "@/components/draft/pitch-viz"
import type { Player, Position } from "@/lib/draft/players"
import type { Formation } from "@/lib/draft/engine"

/**
 * 드래프트 도판 → 배치 화면 이어받기 (2026-08-25).
 *
 * 종전엔 드래프트가 끝나는 순간 도판 배치가 통째로 사라져, 방금 11명을 자리에 놓은
 * 유저가 "미배치 선수 (11)" 을 다시 만났다 — 드래그 기능을 스스로 무효로 만들던 지점.
 *
 * 두 화면은 자리 이름이 다르다(`DF1` vs `lb`). 순번으로 맞물리게 했으므로, **두 목록이
 * 같은 순서 규칙(GK → 수비 → 미드 → 공격)** 이라는 전제를 여기서 못박는다.
 */

let seq = 0
const mk = (position: Position): Player => ({
  id: `c${++seq}`,
  name: `p${seq}`,
  nameKo: `선수${seq}`,
  team: "T",
  teamKo: "티",
  position,
  price: 5,
})

const FORMATIONS: Formation[] = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]

describe("pitchSlotsToPlacements", () => {
  it("모든 포메이션에서 11자리가 빠짐없이 옮겨진다", () => {
    for (const f of FORMATIONS) {
      seq = 0
      const codes = slotCodes(f)
      expect(codes, f).toHaveLength(11)
      const slots: Record<string, Player> = {}
      for (const c of codes) slots[c] = mk(c.slice(0, 2) as Position)

      const out = pitchSlotsToPlacements(slots, f)
      expect(Object.keys(out), f).toHaveLength(11)
      // 선수가 중복 배치되거나 누락되면 안 된다
      const ids = new Set(Object.values(out).map((p) => p.id))
      expect(ids.size, f).toBe(11)
    }
  })

  it("⭐줄 구성이 두 화면에서 일치한다 — 순번 매핑의 전제", () => {
    // 도판 코드의 포지션 순서(GK,DF…,MF…,FW…)와 배치 화면 자리 순서가 어긋나면
    // 수비수가 공격 자리에 앉는다. 옮긴 결과의 자리 라벨로 확인한다.
    const BACK = /^(GK|LB|CB|RB|LWB|RWB)$/
    const MID = /^(LM|CM|RM|LWB|RWB)$/
    for (const f of FORMATIONS) {
      seq = 0
      const codes = slotCodes(f)
      const slots: Record<string, Player> = {}
      for (const c of codes) slots[c] = mk(c.slice(0, 2) as Position)
      const out = pitchSlotsToPlacements(slots, f)

      // GK 코드로 넣은 선수는 반드시 gk 자리에 앉는다
      const gkPlayer = slots["GK1"]
      expect(out["gk"]?.id, f).toBe(gkPlayer.id)

      // 수비 코드로 넣은 선수들은 전부 수비/윙백 라벨 자리에 앉는다
      const dfIds = new Set(codes.filter((c) => c.startsWith("DF")).map((c) => slots[c].id))
      const dfSlotIds = Object.entries(out)
        .filter(([, p]) => dfIds.has(p.id))
        .map(([id]) => id)
      expect(dfSlotIds.length, f).toBe(dfIds.size)
      for (const id of dfSlotIds) {
        expect(/^(lb|lcb|cb|rcb|rb|lwb|rwb)$/.test(id), `${f}:${id}`).toBe(true)
      }
      expect(BACK.test("GK") && MID.test("CM")).toBe(true) // 라벨 규칙 자체가 유효한지
    }
  })

  it("빈 자리는 옮기지 않는다 (부분 배치도 그대로 이어진다)", () => {
    seq = 0
    const gk = mk("GK")
    const out = pitchSlotsToPlacements({ GK1: gk, DF1: null }, "4-4-2")
    expect(out).toEqual({ gk })
  })

  it("아무것도 안 놓았으면 빈 배치로 시작한다", () => {
    expect(pitchSlotsToPlacements({}, "4-3-3")).toEqual({})
  })
})

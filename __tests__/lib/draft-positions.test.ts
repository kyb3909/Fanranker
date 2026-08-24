import { describe, it, expect } from "vitest"
import { canPlay, canAssignAll, formationSlots, isOutOfPosition } from "@/lib/draft/positions"
import type { Position } from "@/lib/draft/players"

/**
 * 드래프트 포지션 자격 — 틀리면 두 방향 모두 조용히 망가진다.
 *  · 너무 빡빡하면 뽑을 수 있는 선수가 사라져 드래프트가 막힌다
 *  · 너무 헐거우면 GK 2명짜리 팀 같은 게 나온다
 */

const P = (s: string): Position[] => s.split(",") as Position[]

describe("canPlay — 인접 포지션", () => {
  it("골키퍼는 골키퍼 자리만", () => {
    expect(canPlay("GK", "GK")).toBe(true)
    expect(canPlay("GK", "DF")).toBe(false)
    expect(canPlay("GK", "MF")).toBe(false)
    expect(canPlay("GK", "FW")).toBe(false)
  })

  it("수비수는 미드까지 올라갈 수 있다", () => {
    expect(canPlay("DF", "DF")).toBe(true)
    expect(canPlay("DF", "MF")).toBe(true)
    expect(canPlay("DF", "FW")).toBe(false) // 센터백을 최전방에 두지는 않는다
    expect(canPlay("DF", "GK")).toBe(false)
  })

  it("미드필더는 수비·공격 양쪽으로 간다", () => {
    expect(canPlay("MF", "DF")).toBe(true)
    expect(canPlay("MF", "MF")).toBe(true)
    expect(canPlay("MF", "FW")).toBe(true)
    expect(canPlay("MF", "GK")).toBe(false)
  })

  it("공격수는 미드까지 내려온다", () => {
    expect(canPlay("FW", "MF")).toBe(true)
    expect(canPlay("FW", "FW")).toBe(true)
    expect(canPlay("FW", "DF")).toBe(false)
  })

  it("제 자리가 아닌 곳에 선 것을 가려낸다", () => {
    expect(isOutOfPosition("FW", "MF")).toBe(true)
    expect(isOutOfPosition("MF", "MF")).toBe(false)
    expect(isOutOfPosition("FW", "DF")).toBe(false) // 애초에 설 수 없는 자리
  })
})

describe("formationSlots", () => {
  it("4-4-2 는 GK1 DF4 MF4 FW2", () => {
    const s = formationSlots("4-4-2")
    expect(s).toHaveLength(11)
    expect(s.filter((x) => x === "GK")).toHaveLength(1)
    expect(s.filter((x) => x === "DF")).toHaveLength(4)
    expect(s.filter((x) => x === "MF")).toHaveLength(4)
    expect(s.filter((x) => x === "FW")).toHaveLength(2)
  })
})

describe("canAssignAll — 11자리 배치 가능성", () => {
  const F442 = formationSlots("4-4-2")

  it("정석 구성은 당연히 된다", () => {
    expect(canAssignAll(P("GK,DF,DF,DF,DF,MF,MF,MF,MF,FW,FW"), F442)).toBe(true)
  })

  it("⭐수비수를 하나 더 뽑아도 미드에 세우면 된다 (운영자 요청의 핵심)", () => {
    // DF 5명 · MF 3명 — 종전 개수 검사라면 거부됐다
    expect(canAssignAll(P("GK,DF,DF,DF,DF,DF,MF,MF,MF,FW,FW"), F442)).toBe(true)
  })

  it("공격수가 남아도 미드로 내려오면 된다", () => {
    expect(canAssignAll(P("GK,DF,DF,DF,DF,MF,MF,MF,FW,FW,FW"), F442)).toBe(true)
  })

  it("골키퍼 2명은 불가 — GK 자리는 하나뿐이고 다른 데 못 선다", () => {
    expect(canAssignAll(P("GK,GK,DF,DF,DF,DF,MF,MF,MF,FW,FW"), F442)).toBe(false)
  })

  it("골키퍼가 없으면 불가 — 빈 GK 자리를 아무도 못 채운다", () => {
    expect(canAssignAll(P("DF,DF,DF,DF,DF,MF,MF,MF,MF,FW,FW"), F442)).toBe(false)
  })

  it("공격수가 흡수 한계까지는 된다 — MF4 + FW2 = 6명", () => {
    expect(canAssignAll(P("GK,DF,DF,DF,DF,FW,FW,FW,FW,FW,FW"), F442)).toBe(true)
  })

  it("한 명만 더 넘어가면 불가 — FW 는 DF 자리에 못 선다", () => {
    // FW 7명인데 FW 가 설 수 있는 자리(MF4+FW2)는 6개뿐. 남는 DF 자리도 못 채운다.
    expect(canAssignAll(P("GK,DF,DF,DF,FW,FW,FW,FW,FW,FW,FW"), F442)).toBe(false)
  })

  it("아직 덜 뽑은 중간 상태도 판정한다", () => {
    expect(canAssignAll(P("GK,DF,DF"), F442)).toBe(true)
    expect(canAssignAll(P("GK,GK"), F442)).toBe(false)
  })

  it("자리보다 선수가 많으면 불가", () => {
    expect(canAssignAll(P("GK,DF,DF,DF,DF,MF,MF,MF,MF,FW,FW,FW"), F442)).toBe(false)
  })

  it("3-5-2 처럼 미드가 많은 포메이션도 같은 규칙으로 판정한다", () => {
    const F352 = formationSlots("3-5-2")
    // DF 6명 — DF3 + MF5 중 3자리까지 흡수 가능
    expect(canAssignAll(P("GK,DF,DF,DF,DF,DF,DF,MF,MF,FW,FW"), F352)).toBe(true)
  })
})

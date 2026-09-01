import { describe, it, expect } from "vitest"
import { recordNameCorrection } from "@/lib/dictionary/sync-news"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * 2026-09-01 — 표기 정정이 저장분으로 퍼지지 않던 문제.
 *
 * 스쿼드 표기를 고치면 `update({ name_kr })` 가 옛 값을 그냥 덮어서, "무엇을 → 무엇으로"
 * 쌍이 어디에도 안 남았다. 그래서 "마르틴 외데고르 → 마틴 외데고르" 하나를 고치는 데
 * 저장분 9곳을 손으로 SQL 해야 했다. 이 함수가 그 쌍을 뉴스 사전에 남긴다.
 */

interface FakeState {
  rows: Record<string, unknown>[] | null
  updated: Record<string, unknown> | null
  updatedId: string | null
}

/** `.select().eq().or()` 와 `.update().eq()` 두 갈래만 흉내 낸다 */
function fakeSupabase(rows: FakeState["rows"]): { sb: SupabaseClient; state: FakeState } {
  const state: FakeState = { rows, updated: null, updatedId: null }
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                or: async () => ({ data: state.rows }),
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          state.updated = patch
          return {
            eq: async (_col: string, id: string) => {
              state.updatedId = id
              return { error: null }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
  return { sb, state }
}

const ENTRY = {
  id: "player_squad_odegaard_martin",
  preferred_ko: "마르틴 외데고르",
  hangul_alts: [],
  surfaces: ["odegaard martin", "마르틴 외데고르"],
}

describe("recordNameCorrection", () => {
  it("실사고 재현 — 옛 표기를 별칭으로 남기고 대표 표기를 새 값으로", async () => {
    const { sb, state } = fakeSupabase([ENTRY])
    const r = await recordNameCorrection(sb, {
      nameEn: "Odegaard Martin",
      oldNameKr: "마르틴 외데고르",
      newNameKr: "마틴 외데고르",
    })
    expect(r).toBe("updated")
    expect(state.updatedId).toBe("player_squad_odegaard_martin")
    expect(state.updated?.preferred_ko).toBe("마틴 외데고르")
    // 이 한 줄이 전파의 입력이 된다 — (옛 → 새) 쌍
    expect(state.updated?.hangul_alts).toContain("마르틴 외데고르")
  })

  it("⚠️ 새 대표 표기가 자기 별칭에 남으면 자기 자신을 치환한다 — 빼낸다", async () => {
    const { sb, state } = fakeSupabase([{ ...ENTRY, hangul_alts: ["마틴 외데고르", "외데고르"] }])
    await recordNameCorrection(sb, {
      nameEn: "Odegaard Martin",
      oldNameKr: "마르틴 외데고르",
      newNameKr: "마틴 외데고르",
    })
    expect(state.updated?.hangul_alts).not.toContain("마틴 외데고르")
    expect(state.updated?.hangul_alts).toContain("외데고르")
  })

  it("첫 입력은 정정이 아니다 — 아무것도 안 한다", async () => {
    const { sb, state } = fakeSupabase([ENTRY])
    expect(
      await recordNameCorrection(sb, {
        nameEn: "Odegaard Martin",
        oldNameKr: null,
        newNameKr: "마틴 외데고르",
      })
    ).toBe("not_a_correction")
    expect(state.updated).toBeNull()
  })

  it("값이 그대로면 안 건드린다", async () => {
    const { sb, state } = fakeSupabase([ENTRY])
    expect(
      await recordNameCorrection(sb, {
        nameEn: "Odegaard Martin",
        oldNameKr: "마틴 외데고르",
        newNameKr: " 마틴 외데고르 ",
      })
    ).toBe("not_a_correction")
    expect(state.updated).toBeNull()
  })

  it("사전에 항목이 없으면 만들지 않는다 — 생성은 일괄 동기화의 몫이다", async () => {
    const { sb, state } = fakeSupabase([])
    expect(
      await recordNameCorrection(sb, {
        nameEn: "Nobody Here",
        oldNameKr: "옛이름",
        newNameKr: "새이름",
      })
    ).toBe("no_entry")
    expect(state.updated).toBeNull()
  })

  it("⚠️ 항목이 여럿이면 손대지 않는다 — 어느 쪽이 이 선수인지 기계가 못 고른다", async () => {
    const { sb, state } = fakeSupabase([ENTRY, { ...ENTRY, id: "player_odegaard_m" }])
    expect(
      await recordNameCorrection(sb, {
        nameEn: "Odegaard Martin",
        oldNameKr: "마르틴 외데고르",
        newNameKr: "마틴 외데고르",
      })
    ).toBe("no_entry")
    expect(state.updated).toBeNull()
  })

  it("surfaces 에 새 표기와 로마자 키가 함께 들어간다", async () => {
    const { sb, state } = fakeSupabase([ENTRY])
    await recordNameCorrection(sb, {
      nameEn: "Odegaard Martin",
      oldNameKr: "마르틴 외데고르",
      newNameKr: "마틴 외데고르",
    })
    const surfaces = state.updated?.surfaces as string[]
    expect(surfaces).toContain("마틴 외데고르")
    expect(surfaces).toContain("odegaard martin")
  })
})

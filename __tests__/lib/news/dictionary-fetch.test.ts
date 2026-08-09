import { describe, expect, it } from "vitest"
import { fetchDictionaryRows } from "@/lib/news/dictionary-fetch"

/**
 * 2026-08-09 실사고 재발 방지: PostgREST 가 1,000행에서 **오류 없이** 잘라
 * 사전 1,041행 중 955건만 도착했고, 새로 등재한 매체 항목이 통째로 사라졌다.
 * 사전은 자동 등재로 매일 자라므로 이 경계는 계속 넘게 된다.
 */

interface Row {
  id: string
}

/** range(from,to) 를 실제 PostgREST 처럼 자르는 가짜 클라이언트 */
function makeSupabase(total: number, opts: { pageCap?: number } = {}) {
  const cap = opts.pageCap ?? 1000
  const all: Row[] = Array.from({ length: total }, (_, i) => ({
    id: `r${String(i).padStart(5, "0")}`,
  }))
  const calls: [number, number][] = []
  return {
    calls,
    client: {
      from: () => ({
        select: () => ({
          in: () => ({
            order: () => ({
              range: async (from: number, to: number) => {
                calls.push([from, to])
                const size = Math.min(to - from + 1, cap)
                return { data: all.slice(from, from + size), error: null }
              },
            }),
          }),
        }),
      }),
    },
  }
}

describe("fetchDictionaryRows", () => {
  it("1,000행을 넘어도 전량을 가져온다 (무음 절단 방지)", async () => {
    const sb = makeSupabase(1041)
    const rows = await fetchDictionaryRows<Row>(sb.client as never, "id", ["player"])
    expect(rows).toHaveLength(1041)
    // 마지막 항목까지 실제로 도착했는지 — 잘리면 여기서 걸린다
    expect(rows[rows.length - 1].id).toBe("r01040")
    expect(sb.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it("한 페이지로 끝나면 추가 요청을 하지 않는다", async () => {
    const sb = makeSupabase(42)
    const rows = await fetchDictionaryRows<Row>(sb.client as never, "id", ["media"])
    expect(rows).toHaveLength(42)
    expect(sb.calls).toHaveLength(1)
  })

  it("정확히 경계(1,000행)에서도 다음 페이지를 확인한다", async () => {
    const sb = makeSupabase(1000)
    const rows = await fetchDictionaryRows<Row>(sb.client as never, "id", ["player"])
    expect(rows).toHaveLength(1000)
    // 꽉 찬 페이지는 "더 있을 수 있다"는 뜻이므로 한 번 더 물어봐야 한다
    expect(sb.calls).toHaveLength(2)
  })

  it("조회 실패는 조용히 빈 배열이 아니라 throw — 호출부가 fail-safe 를 선택하게 한다", async () => {
    const client = {
      from: () => ({
        select: () => ({
          in: () => ({
            order: () => ({ range: async () => ({ data: null, error: { message: "boom" } }) }),
          }),
        }),
      }),
    }
    await expect(fetchDictionaryRows(client as never, "id", ["player"])).rejects.toThrow("boom")
  })
})

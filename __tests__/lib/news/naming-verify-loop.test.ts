import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 발행 전 표기 검증 루프 (2026-08-07 운영자: "루프 다 돌고 무결 검증 후 발행")
 *
 * 계약: 네이버 근거가 있는 이름만 등재(→발행 진행), 근거 부족은 보류 유지,
 * 인프라 실패는 판정이 아니므로 별도 분류(retry_wait 재료). 클럽명은 오탐 차단.
 */

const verifyMock = vi.fn()
vi.mock("@/lib/naming/verify", () => ({
  verifySpelling: (...args: unknown[]) => verifyMock(...args),
}))
vi.mock("@/lib/naming/pick", () => ({
  isClubName: (n: string) => n === "리버풀",
}))

import { resolveUnknownPlayersViaNaver } from "@/lib/news/naming-verify-loop"

function makeSupabase() {
  const upserts: Record<string, unknown>[] = []
  return {
    upserts,
    client: {
      from: () => ({
        upsert: async (row: Record<string, unknown>) => {
          upserts.push(row)
          return { error: null }
        },
      }),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolveUnknownPlayersViaNaver", () => {
  it("네이버 승자 → 사전 등재 + 기사 표기는 옛 표기(alt)로", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "코디 각포",
      romanized: "Cody Gakpo",
      counts: [
        { candidate: "코디 각포", total: 3966 },
        { candidate: "코디 갓포", total: 0 },
      ],
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["코디 갓포"], "기사 제목")

    expect(r.registered).toEqual([{ name: "코디 갓포", preferred: "코디 각포" }])
    expect(r.stillUnknown).toEqual([])
    expect(sb.upserts).toHaveLength(1)
    expect(sb.upserts[0]).toMatchObject({
      preferred_ko: "코디 각포",
      hangul_alts: ["코디 갓포"],
      category: "player",
    })
  })

  it("근거 부족(판정) → 등재 없이 stillUnknown — 기존 보류 경로 유지", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: null,
      romanized: "Some Player",
      counts: [{ candidate: "아무개", total: 2 }],
      reason: "근거 부족 — 우세 표기 없음",
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["아무개"], "제목")

    expect(r.stillUnknown).toEqual(["아무개"])
    expect(r.registered).toEqual([])
    expect(sb.upserts).toHaveLength(0)
  })

  it("네이버 API 미가동 → infraFailed (낙인 없이 재시도 재료)", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: null,
      romanized: null,
      counts: [],
      reason: "네이버 API 미가동 — 사람 검수",
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["신인선수"], "제목")

    expect(r.infraFailed).toEqual(["신인선수"])
    expect(r.stillUnknown).toEqual([])
  })

  it("클럽명은 검증 대상에서 제외 (선수 오탐 차단)", async () => {
    const sb = makeSupabase()
    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["리버풀"], "제목")
    expect(verifyMock).not.toHaveBeenCalled()
    expect(r.stillUnknown).toEqual([])
    expect(r.registered).toEqual([])
  })

  it("런 캐시 — 같은 이름은 기사가 달라도 1회만 검증", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "코디 각포",
      romanized: "Cody Gakpo",
      counts: [{ candidate: "코디 각포", total: 3966 }],
    })
    const cache = new Map()

    await resolveUnknownPlayersViaNaver(sb.client as never, ["코디 갓포"], "기사1", cache)
    const r2 = await resolveUnknownPlayersViaNaver(
      sb.client as never,
      ["코디 갓포"],
      "기사2",
      cache
    )

    expect(verifyMock).toHaveBeenCalledTimes(1)
    // 두 번째 기사에서는 이미 등재됨 — unknown 도 registered 도 아님 (통과)
    expect(r2.stillUnknown).toEqual([])
    expect(r2.registered).toEqual([])
  })

  it("기사당 검증 상한 초과분은 infraFailed (시도 못 함 ≠ 판정)", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: null,
      romanized: null,
      counts: [],
      reason: "근거 부족",
    })
    const names = Array.from({ length: 10 }, (_, i) => `선수${i}`)

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, names, "제목")

    expect(verifyMock).toHaveBeenCalledTimes(8)
    expect(r.stillUnknown).toHaveLength(8)
    expect(r.infraFailed).toHaveLength(2)
  })
})

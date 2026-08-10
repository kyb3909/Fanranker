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
// isClubName 만 좁게 바꾸고 plausibleCorrection 은 **실제 구현**을 쓴다 —
// 승자 타당성 가드가 진짜 규칙으로 검증돼야 의미가 있다
vi.mock("@/lib/naming/pick", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/naming/pick")>()),
  isClubName: (n: string) => n === "리버풀",
}))

import { resolveUnknownPlayersViaNaver } from "@/lib/news/naming-verify-loop"
import { findUniqueRomanizedMatch } from "@/lib/news/notation"

function makeSupabase() {
  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  return {
    inserts,
    updates,
    client: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row)
          return { error: null }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }), // 신규 등재 경로: 기존 행 없음
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(row)
            return { error: null }
          },
        }),
      }),
    },
  }
}

/** 흡수 경로용 — 사전 행 조회가 기존 항목(hangul_alts)을 돌려준다 */
function makeSupabaseWithDict() {
  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  return {
    inserts,
    updates,
    client: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row)
          return { error: null }
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { hangul_alts: [] }, error: null }),
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(row)
            return { error: null }
          },
        }),
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
    expect(sb.inserts).toHaveLength(1)
    expect(sb.inserts[0]).toMatchObject({
      preferred_ko: "코디 각포",
      hangul_alts: ["코디 갓포"],
      category: "player",
    })
  })

  it("감독은 coach 로 등재된다 — 선수 사전을 오염시키지 않는다 (2026-08-09 하비/사비 실사고)", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "사비 알론소",
      romanized: "Xabi Alonso",
      counts: [
        { candidate: "사비 알론소", total: 12000 },
        { candidate: "하비 알론소", total: 30 },
      ],
    })

    const r = await resolveUnknownPlayersViaNaver(
      sb.client as never,
      ["하비 알론소"],
      "리버풀 프리시즌",
      undefined,
      [],
      "coach"
    )

    expect(r.registered).toEqual([{ name: "하비 알론소", preferred: "사비 알론소" }])
    expect(sb.inserts[0]).toMatchObject({
      id: "coach_auto_xabi_alonso",
      category: "coach",
      preferred_ko: "사비 알론소",
      hangul_alts: ["하비 알론소"],
    })
  })

  it("category 를 안 주면 기존대로 player — 호출부 미변경 경로 보호", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "코디 각포",
      romanized: "Cody Gakpo",
      counts: [{ candidate: "코디 각포", total: 3966 }],
    })

    await resolveUnknownPlayersViaNaver(sb.client as never, ["코디 갓포"], "제목")

    expect(sb.inserts[0]).toMatchObject({ id: "player_auto_cody_gakpo", category: "player" })
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
    expect(sb.inserts).toHaveLength(0)
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

  describe("기존 항목 흡수 (비니시우스 주니어 실사고 2026-08-07)", () => {
    const vini = {
      id: "player_vinicius_jr",
      preferred_ko: "비니시우스 주니오르",
      romanized: "Vinicius Junior",
      surfaces: ["vinicius junior", "vinicius jr"],
      hangul_alts: [],
    }
    const martinelli = {
      id: "player_martinelli",
      preferred_ko: "가브리엘 마르티넬리",
      romanized: "Gabriel Martinelli",
      surfaces: ["gabriel martinelli"],
      hangul_alts: [],
    }

    it("승자 판정 실패(양쪽 병용)여도 로마자가 기존 항목과 일치하면 별칭 흡수", async () => {
      const sb = makeSupabaseWithDict()
      verifyMock.mockResolvedValue({
        winner: null, // 주니오르/주니어 둘 다 많이 쓰여 압도 승자 없음 — 실사고 그대로
        romanized: "Vinicius Junior",
        counts: [
          { candidate: "비니시우스 주니오르", total: 15000 },
          { candidate: "비니시우스 주니어", total: 12000 },
        ],
        reason: "우세 불충분",
      })

      const r = await resolveUnknownPlayersViaNaver(
        sb.client as never,
        ["비니시우스 주니어"],
        "제목",
        undefined,
        [vini, martinelli]
      )

      expect(r.registered).toEqual([
        { name: "비니시우스 주니어", preferred: "비니시우스 주니오르" },
      ])
      expect(r.stillUnknown).toEqual([])
      expect(sb.updates).toHaveLength(1)
      expect(sb.updates[0].hangul_alts).toContain("비니시우스 주니어")
    })

    it("자모 유사도가 높아도 로마자 불일치(다른 선수)면 흡수 금지 — 마르티네스≠마르티넬리", async () => {
      const sb = makeSupabaseWithDict()
      verifyMock.mockResolvedValue({
        winner: null,
        romanized: "Gabriel Martinez",
        counts: [],
        reason: "근거 부족",
      })

      const r = await resolveUnknownPlayersViaNaver(
        sb.client as never,
        ["가브리엘 마르티네스"],
        "제목",
        undefined,
        [vini, martinelli]
      )

      expect(r.registered).toEqual([])
      expect(r.stillUnknown).toEqual(["가브리엘 마르티네스"])
      expect(sb.updates).toHaveLength(0)
    })

    it("네이버 승자가 기존 대표 표기와 같으면 신규 등재 대신 별칭 흡수", async () => {
      const sb = makeSupabaseWithDict()
      verifyMock.mockResolvedValue({
        winner: "비니시우스 주니오르",
        romanized: "Vinicius Junior",
        counts: [{ candidate: "비니시우스 주니오르", total: 15000 }],
      })

      const r = await resolveUnknownPlayersViaNaver(
        sb.client as never,
        ["비니시우스 주니어"],
        "제목",
        undefined,
        [vini, martinelli]
      )

      expect(r.registered).toEqual([
        { name: "비니시우스 주니어", preferred: "비니시우스 주니오르" },
      ])
      expect(sb.inserts).toHaveLength(0) // 신규 행 생성 없음 — 기존 항목에 흡수
      expect(sb.updates).toHaveLength(1)
    })
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

/**
 * 2026-08-09 실사고: 네이버 검증이 **틀린 답을 근거와 함께 확정**했다.
 * 후보 생성(LLM)이 정답을 빠뜨리면 네이버는 남은 오답 중에서만 고르기 때문이다.
 *   "카릭"        → 후보 [카릭, 마이클 카릭, 미하엘 카릭] — 정답 '캐릭' 없음 → 카릭 확정
 *   "하비 알론소" → 후보 [샤비, 하비, 자비]              — 정답 '사비' 없음 → 샤비 확정
 * 로마자는 LLM 이 거의 안 틀린다(누구인지는 안다) → 로마자로 신원을 맞추고
 * 한글 표기는 **운영자가 확정한 사전**을 따른다. 사전이 네이버보다 위다.
 */
describe("findUniqueRomanizedMatch", () => {
  const DICT = [
    {
      id: "a",
      preferred_ko: "마이클 캐릭",
      romanized: "Michael Carrick",
      surfaces: [],
      hangul_alts: [],
    },
    { id: "b", preferred_ko: "캐릭", romanized: "Carrick", surfaces: [], hangul_alts: [] },
    {
      id: "c",
      preferred_ko: "사비 알론소",
      romanized: "Xabi Alonso",
      surfaces: [],
      hangul_alts: [],
    },
    {
      id: "d",
      preferred_ko: "가브리엘 실바",
      romanized: "Gabriel Silva",
      surfaces: [],
      hangul_alts: [],
    },
    {
      id: "e",
      preferred_ko: "치아구 실바",
      romanized: "Thiago Silva",
      surfaces: [],
      hangul_alts: [],
    },
  ]

  it("로마자가 정확히 같으면 그 항목 — 성씨 항목과 풀네임 항목이 함께 있어도 고른다", () => {
    expect(findUniqueRomanizedMatch(DICT, "Carrick")?.preferred_ko).toBe("캐릭")
  })

  it("풀네임 일치도 잡는다 (네이버가 '샤비'라 해도 사전의 '사비'가 이긴다)", () => {
    expect(findUniqueRomanizedMatch(DICT, "Xabi Alonso")?.preferred_ko).toBe("사비 알론소")
  })

  it("성씨만으로 풀네임 항목에 닿는다 (정확 일치 항목이 없을 때)", () => {
    const onlyFull = DICT.filter((d) => d.id !== "b")
    expect(findUniqueRomanizedMatch(onlyFull, "Carrick")?.preferred_ko).toBe("마이클 캐릭")
  })

  it("⚠️ 흔한 성씨는 판단하지 않는다 — Silva 는 두 선수의 부분집합이다", () => {
    expect(findUniqueRomanizedMatch(DICT, "Silva")).toBeNull()
  })

  it("사전에 없는 인물은 매칭 없음 (없는 답을 지어내지 않는다)", () => {
    expect(findUniqueRomanizedMatch(DICT, "Erling Haaland")).toBeNull()
    expect(findUniqueRomanizedMatch(DICT, null)).toBeNull()
  })
})

/**
 * 2026-08-10 실사고 — 이니셜 축약형이 성씨 동명이인을 뭉쳤다.
 * FPL 시드 747건 중 49건이 `J.Araujo` `A.García` 형태인데, romanTokens 가 1글자
 * 토큰을 버려서 `J.Araujo` → ["araujo"] 가 된다. 그러면 성이 같은 모든 선수가 한
 * 사람이 되고, 기사가 '아라우호'로 옳게 써도 본머스의 '아라우조'로 흡수된다.
 * 실측으로 확인: findUniqueRomanizedMatch(실사전, "Ronald Araujo") → 아라우조.
 */
describe("findUniqueRomanizedMatch — 이니셜 축약형 배제", () => {
  const DICT = [
    { id: "fpl", preferred_ko: "아라우조", romanized: "J.Araujo", surfaces: [], hangul_alts: [] },
    { id: "ok", preferred_ko: "캐릭", romanized: "Carrick", surfaces: [], hangul_alts: [] },
  ]

  it("이니셜 항목은 앵커가 되지 않는다 — 다른 Araujo 를 흡수하면 안 된다", () => {
    expect(findUniqueRomanizedMatch(DICT, "Ronald Araujo")).toBeNull()
    expect(findUniqueRomanizedMatch(DICT, "Araujo")).toBeNull()
  })

  it("입력이 이니셜 형태여도 판단하지 않는다", () => {
    expect(findUniqueRomanizedMatch(DICT, "J.Araujo")).toBeNull()
  })

  it("정상 항목은 그대로 매칭된다 (회귀)", () => {
    expect(findUniqueRomanizedMatch(DICT, "Carrick")?.preferred_ko).toBe("캐릭")
  })
})

/**
 * 2026-08-10 — 네이버 승자를 그대로 믿지 않는다.
 * 실측: '라파엘 레앙' 검증에서 '레온'(45,133건)이 이겼다. 흔한 단어라 검색량이
 * 폭발하는 다른 대상이다. 소급 감사에는 plausibleCorrection 가드가 있었는데
 * 발행 게이트에는 없어서 그대로 등재됐다.
 */
describe("승자 타당성 가드", () => {
  it("⚠️ 닮지 않은 승자는 등재하지 않고 보류한다 (레앙 → 레온)", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "레온",
      romanized: "Rafael Leao",
      counts: [
        { candidate: "레온", total: 45133 },
        { candidate: "레앙", total: 5209 },
      ],
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["라파엘 레앙"], "제목")

    expect(r.registered).toEqual([])
    expect(r.stillUnknown).toEqual(["라파엘 레앙"])
    expect(sb.inserts).toHaveLength(0)
  })

  it("길이 변형이면 교정이 아니라 확인 — 기사 표기를 그대로 등재해 차단만 푼다", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "아라우호",
      romanized: "Ronald Araujo",
      counts: [
        { candidate: "아라우호", total: 6790 },
        { candidate: "로날드 아라우호", total: 3957 },
      ],
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["로날드 아라우호"], "제목")

    // 풀네임→성 축약을 '교정'으로 적용하면 본문이 훼손된다 — 기사 표기가 대표가 된다
    expect(r.registered).toEqual([{ name: "로날드 아라우호", preferred: "로날드 아라우호" }])
    expect(sb.inserts[0]).toMatchObject({ preferred_ko: "로날드 아라우호" })
  })

  it("진짜 음차 교정은 그대로 통과한다 (회귀 — 갓포→각포)", async () => {
    const sb = makeSupabase()
    verifyMock.mockResolvedValue({
      winner: "코디 각포",
      romanized: "Cody Gakpo",
      counts: [{ candidate: "코디 각포", total: 3966 }],
    })

    const r = await resolveUnknownPlayersViaNaver(sb.client as never, ["코디 갓포"], "제목")

    expect(r.registered).toEqual([{ name: "코디 갓포", preferred: "코디 각포" }])
  })
})

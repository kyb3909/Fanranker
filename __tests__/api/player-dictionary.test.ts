import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { UNKNOWN_PLAYER_PREFIX } from "@/lib/news/alias-suggest"

const m = vi.hoisted(() => ({ auth: vi.fn(), requeue: vi.fn() }))
vi.mock("@/lib/admin/roles", () => ({ requireStaffApi: m.auth }))
vi.mock("@/lib/news/dictionary-recheck", () => ({ requeueDraftsUnblockedByDictionary: m.requeue }))
import { GET } from "@/app/api/admin/player-dictionary/route"

type Row = Record<string, unknown>
function database({
  dictionary = [],
  news = [],
  saga = [],
  failTable,
  failOffset = 0,
  nullTable,
}: {
  dictionary?: Row[]
  news?: Row[]
  saga?: Row[]
  failTable?: string
  failOffset?: number
  nullTable?: string
} = {}) {
  const ranges: number[] = []
  const sources: Record<string, Row[]> = {
    news_alias_dictionary: dictionary,
    news_reservoir: news,
    saga_reservoir: saga,
  }
  const from = vi.fn((table: string) => {
    let rows = [...(sources[table] ?? [])],
      start = 0,
      end = 999
    const q = {
      select: () => q,
      gte: () => q,
      not: () => q,
      eq: (key: string, value: unknown) => {
        rows = rows.filter((r) => r[key] === value)
        return q
      },
      in: (key: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[key]))
        return q
      },
      order: (key: string) => {
        rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])))
        return q
      },
      limit: (size: number) => {
        end = size - 1
        return q
      },
      range: (a: number, b: number) => {
        ranges.push(a)
        start = a
        end = b
        return q
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: table === nullTable ? null : rows.slice(start, end + 1),
          error:
            table === failTable && start === failOffset
              ? { message: "private database error" }
              : null,
        }).then(resolve),
    }
    return q
  })
  const client = { from }
  m.auth.mockResolvedValue({ supabase: client, userId: "staff" })
  return { client, ranges }
}
const blocked = (names: string) => ({
  draft: { title: "기사 제목" },
  decision: { auto_gate: { reasons: [`${UNKNOWN_PLAYER_PREFIX}${names}`] } },
})
const held = (name: string) => ({
  title: "사가 제목",
  status: "queued",
  error: "auto_hold:unknown_player",
  extracted: { player_kr: name },
})
const entry = (id: string, name = "등록 선수", extra: Row = {}) => ({
  id,
  category: "player",
  preferred_ko: name,
  romanized: "",
  hangul_alts: [],
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe("player dictionary candidate GET", () => {
  it("1001번째 이후 선수의 대표명·별칭은 뉴스와 사가의 미등재 후보에서 제외한다", async () => {
    const db = database({
      dictionary: [
        ...Array.from({ length: 1000 }, (_, i) => entry(`a${String(i).padStart(4, "0")}`)),
        entry("z1", "손흥민", { hangul_alts: ["쏘니"] }),
        entry("z2", "이강인"),
        entry("z3", "감독이름", { category: "coach" }),
      ],
      news: [blocked("손흥민, 쏘니, 새선수")],
      saga: [held("이강인"), held("새선수"), held("English Only")],
    })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      dictionarySize: 1002,
      candidates: [{ name: "새선수", hits: 2 }],
    })
    expect(db.ranges).toEqual([0, 1000])
    expect(m.requeue).not.toHaveBeenCalled()
  })

  it("뒷 페이지의 유사 표기도 기존 항목 제안에 포함한다", async () => {
    database({
      dictionary: [
        ...Array.from({ length: 1000 }, (_, i) =>
          entry(`a${String(i).padStart(4, "0")}`, "가나다")
        ),
        entry("z", "비니시우스 주니오르"),
      ],
      news: [blocked("비니시우스 주니어")],
    })
    expect(await (await GET()).json()).toMatchObject({
      candidates: [
        {
          name: "비니시우스 주니어",
          suggestions: [{ id: "z", preferred_ko: "비니시우스 주니오르" }],
        },
      ],
    })
  })

  it.each(["news_reservoir", "saga_reservoir", "news_alias_dictionary"])(
    "%s 조회 실패는 빈 후보 대신 503",
    async (failTable) => {
      database({
        dictionary: [entry("known")],
        news: [blocked("새선수")],
        saga: [held("새선수")],
        failTable,
      })
      const response = await GET()
      const body = await response.json()
      expect(response.status).toBe(503)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(body.error).toContain("다시 시도")
      expect(body).not.toHaveProperty("candidates")
      expect(JSON.stringify(body)).not.toContain("private database error")
      expect(m.requeue).not.toHaveBeenCalled()
    }
  )

  it("사전의 두 번째 페이지 실패도 부분 사전으로 후보를 만들지 않는다", async () => {
    database({
      dictionary: Array.from({ length: 1001 }, (_, i) => entry(String(i))),
      news: [blocked("새선수")],
      failTable: "news_alias_dictionary",
      failOffset: 1000,
    })
    expect((await GET()).status).toBe(503)
  })

  it.each(["news_reservoir", "saga_reservoir"])(
    "%s 데이터가 없으면 성공한 빈 조회로 간주하지 않는다",
    async (nullTable) => {
      database({ nullTable })
      expect((await GET()).status).toBe(503)
    }
  )

  it("성공한 빈 조회는 정상적으로 후보 0건", async () => {
    database()
    expect(await (await GET()).json()).toEqual({ candidates: [], dictionarySize: 0 })
  })

  it.each([401, 403])("권한 오류 %s이면 조회를 시작하지 않는다", async (status) => {
    const { client } = database()
    m.auth.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
    expect((await GET()).status).toBe(status)
    expect(client.from).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: "",
  reads: [] as string[],
  cacheOptions: {} as { revalidate?: number },
}))
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, _keys: string[], options: object) => {
    state.cacheOptions = options
    // Next의 JSON 캐시 왕복 후에도 팀 집합이 복구되어야 한다.
    return async () => JSON.parse(JSON.stringify(await fn()))
  },
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      type Row = Record<string, unknown>
      const filters: ((row: Row) => boolean)[] = []
      let start = 0
      let end = Infinity
      let sortKey = ""
      const q = {
        select: () => q,
        gte: (key: string, value: string) => {
          filters.push((r) => String(r[key]) >= value)
          return q
        },
        lt: (key: string, value: string) => {
          filters.push((r) => String(r[key]) < value)
          return q
        },
        neq: (key: string, value: unknown) => {
          filters.push((r) => r[key] !== value)
          return q
        },
        in: (key: string, values: unknown[]) => {
          filters.push((r) => values.includes(r[key]))
          return q
        },
        order: (key: string) => {
          sortKey = key
          return q
        },
        range: (from: number, to: number) => {
          start = from
          end = to + 1
          return q
        },
        then: (resolve: (value: unknown) => unknown) => {
          state.reads.push(table)
          const result =
            state.fail === table
              ? { data: null, error: { code: "unavailable", message: "DB failed" } }
              : {
                  data: (state.tables[table] ?? [])
                    .filter((r) => filters.every((f) => f(r)))
                    .sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])))
                    .slice(start, end),
                  error: null,
                }
          return Promise.resolve(result).then(resolve)
        },
      }
      return q
    },
  }),
}))

import { getBetmanLeagueMembers } from "@/lib/lfa/league-members"
import { LFA_LEAGUE_IDS } from "@/lib/lfa/leagues"

const match = (league: string, home: string, away: string) => ({
  league: { id: LFA_LEAGUE_IDS.get(league) },
  home: { name: home },
  away: { name: away },
})
const day = (date_utc: string, payload: unknown[]) => ({ date_utc, payload })
const dictionary = (name_kr: string, name_en: string, extra: object = {}) => ({
  soccerway_team_id: name_en,
  name_kr,
  name_en,
  aliases_kr: [],
  status: "confirmed",
  ...extra,
})

describe("발매 판정용 시즌 리그 멤버", () => {
  beforeEach(() => {
    state.tables = {}
    state.fail = ""
    state.reads = []
  })
  it("2026년 8월 이후 이번 시즌 리그 영문명만 모으고 컵·이전/다음 시즌은 제외한다", async () => {
    state.tables.lfa_day_cache = [
      day("2026-07-31", [match("EPL", "Relegated", "Old Team")]),
      day("2026-08-01", [
        match("EPL", "Man. City", "Liverpool"),
        match("EFL챔", "Leicester", "Ipswich"),
      ]),
      day("2026-09-01", [
        match("잉리그컵", "Chelsea", "Luton"),
        match("EPL", "Man. City", "Chelsea"),
      ]),
      day("2027-08-01", [match("EPL", "Next Season", "Other")]),
    ]
    state.tables.standings_cache = [{ league_id: "epl", data: [{ 팀명: "다른 이름" }] }]
    const members = await getBetmanLeagueMembers()
    expect(members.get("EPL")).toEqual(new Set(["Man. City", "Liverpool", "Chelsea"]))
    expect(members.get("EFL챔")).toEqual(new Set(["Leicester", "Ipswich"]))
    expect(state.reads).not.toContain("team_dictionary")
    expect(state.cacheOptions.revalidate).toBeGreaterThanOrEqual(300)
  })
  it("리그별 LFA 목록이 비면 네이버 한글명·별칭을 사전 영문명으로 변환한다", async () => {
    state.tables.lfa_day_cache = [day("2026-08-20", [match("EPL", "Chelsea", "Liverpool")])]
    state.tables.standings_cache = [
      { league_id: "bundesliga", data: [{ 팀명: "바이에른" }, { 팀명: "도르트문트" }] },
    ]
    state.tables.team_dictionary = [
      dictionary("바이에른 뮌헨", "Bayern Munich", { aliases_kr: ["바이에른"] }),
      dictionary("도르트문트", "Dortmund"),
    ]
    const members = await getBetmanLeagueMembers()
    expect(members.get("EPL")).toEqual(new Set(["Chelsea", "Liverpool"]))
    expect(members.get("분데스리")).toEqual(new Set(["Bayern Munich", "Dortmund"]))
    expect(members.get("EFL챔")?.size).toBe(0)
  })
  it.each(["missing", "ambiguous", "rejected", "empty"])(
    "변환 %s 팀이 하나라도 있으면 그 리그 전체가 unknown용 빈 집합이다",
    async (kind) => {
      state.tables.standings_cache = [
        { league_id: "bundesliga", data: [{ 팀명: "바이에른" }, { 팀명: "도르트문트" }] },
      ]
      state.tables.team_dictionary = [dictionary("바이에른", "Bayern Munich")]
      if (kind !== "missing")
        state.tables.team_dictionary.push(
          dictionary("도르트문트", kind === "empty" ? "" : "Dortmund", {
            status: kind === "rejected" ? "rejected" : "confirmed",
          })
        )
      if (kind === "ambiguous")
        state.tables.team_dictionary.push(dictionary("도르트문트", "Other Dortmund"))
      expect((await getBetmanLeagueMembers()).get("분데스리")?.size).toBe(0)
    }
  )
  it("일정·사전을 페이지 끝까지 읽는다", async () => {
    state.tables.lfa_day_cache = Array.from({ length: 101 }, (_, i) =>
      day(
        new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10),
        i === 100 ? [match("EFL챔", "Leicester", "Ipswich")] : []
      )
    )
    state.tables.standings_cache = [{ league_id: "bundesliga", data: [{ 팀명: "바이에른" }] }]
    state.tables.team_dictionary = Array.from({ length: 1000 }, (_, i) =>
      dictionary(`팀${i}`, `Team${i}`, { soccerway_team_id: String(i).padStart(4, "0") })
    )
    state.tables.team_dictionary.push(
      dictionary("바이에른", "Bayern Munich", { soccerway_team_id: "zzzz" })
    )
    const members = await getBetmanLeagueMembers()
    expect(members.get("EFL챔")).toEqual(new Set(["Leicester", "Ipswich"]))
    expect(members.get("분데스리")).toEqual(new Set(["Bayern Munich"]))
    expect(state.reads.filter((table) => table === "lfa_day_cache")).toHaveLength(2)
    expect(state.reads.filter((table) => table === "team_dictionary")).toHaveLength(2)
  })
  it.each(["lfa_day_cache", "standings_cache", "team_dictionary"])(
    "%s 조회 오류를 정상 빈 캐시로 저장하지 않는다",
    async (table) => {
      state.fail = table
      state.tables.standings_cache = [{ league_id: "epl", data: [{ 팀명: "첼시" }] }]
      await expect(getBetmanLeagueMembers()).rejects.toThrow("unavailable:DB failed")
    }
  )
})

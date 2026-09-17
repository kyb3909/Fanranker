// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ManagedNotation } from "@/lib/news/notation/manage"
import {
  buildPlayerNamingQueue,
  loadPlayerNamingQueue,
  PlayerNamingSaveSchema,
  type NamingSquadRow,
} from "@/lib/news/notation/player-naming-queue"
const mocks = vi.hoisted(() => ({ dictionary: vi.fn() }))
vi.mock("@/lib/news/notation/manage", () => ({ listManagedNotation: mocks.dictionary }))
const date = "2026-09-15T00:00:00.000Z"
const squad = (id: string, overrides: Partial<NamingSquadRow> = {}): NamingSquadRow => ({
  player_id: id,
  soccerway_team_id: "arsenal",
  name_en: `Player ${id}`,
  name_kr: null,
  name_kr_draft: null,
  status: "pending",
  updated_at: date,
  team_dictionary: { name_kr: "아스널", name_en: "Arsenal" },
  ...overrides,
})
const notation = (id: string, overrides: Partial<ManagedNotation> = {}): ManagedNotation => ({
  id,
  category: "player",
  preferred_ko: "English Name",
  romanized: "English Name",
  surfaces: [],
  hangul_alts: [],
  given_name_ko: "",
  family_name_ko: "",
  short_name_ko: "",
  disambiguation: "",
  notes: "",
  updated_at: date,
  ...overrides,
})
beforeEach(() => {
  mocks.dictionary.mockResolvedValue([])
})

describe("existing-player unfinished naming queue", () => {
  it("excludes completed Korean names even when optional name parts are blank", () => {
    const result = buildPlayerNamingQueue(
      [
        squad("completed", { name_en: "Bukayo Saka", name_kr: "부카요 사카" }),
        squad("covered", { name_en: "Rico Lewis", name_kr: "Rico Lewis" }),
        squad("missing", { name_en: "Unknown Player", name_kr_draft: "후보 이름" }),
        squad("left", { status: "left" }),
      ],
      [notation("rico", { romanized: " Rico Lewis ", preferred_ko: "리코 루이스" })]
    )
    // 기사 사전에만 한글이 있는 선수는 경기 화면에서 여전히 영문이다 — 큐에 남기고 제안만 붙인다.
    expect(result.items.map((item) => item.id)).toEqual(["covered", "missing"])
    expect(result.items[0]).toMatchObject({ name_kr: "Rico Lewis", news_name_kr: "리코 루이스" })
    expect(result.items[1].name_kr_draft).toBe("후보 이름")
    expect(result.pageSize).toBe(100)
  })

  it("uses exact normalized aliases and never fuzzy names or accent folding", () => {
    const result = buildPlayerNamingQueue(
      [
        squad("alias", { name_en: "  BUKAYO SAKA " }),
        squad("accent", { name_en: "João Pedro" }),
        squad("ambiguous", { name_en: "Alex Smith" }),
      ],
      [
        notation("saka", {
          romanized: "Other Name",
          preferred_ko: "부카요 사카",
          surfaces: [" Bukayo Saka "],
        }),
        notation("joao", { romanized: "Joao Pedro", preferred_ko: "주앙 페드루" }),
        notation("alex1", { romanized: "Alex Smith", preferred_ko: "앨릭스 스미스" }),
        notation("alex2", { romanized: "Alex Smith", preferred_ko: "알렉스 스미스" }),
      ]
    )
    // 정확일치 별칭이 있어도 명단 한글이 비면 큐에 남는다(기사 사전 제안만 붙는다).
    expect(result.items.map((item) => item.id).sort()).toEqual(["accent", "alias", "ambiguous"])
    expect(result.items.find((item) => item.id === "alias")?.news_name_kr).toBe("부카요 사카")
    expect(result.items.find((item) => item.id === "ambiguous")?.news_name_kr).toBeNull()
  })

  it("includes article-dictionary people without a current roster and skips represented entries", () => {
    const result = buildPlayerNamingQueue(
      [squad("existing", { name_en: "Existing Player" })],
      [
        notation("represented", { romanized: "Existing Player", preferred_ko: "Existing Player" }),
        notation("orphan", {
          category: "coach",
          romanized: "New Coach",
          preferred_ko: "New Coach",
          disambiguation: "Everton|에버턴",
        }),
        notation("team", { category: "team", preferred_ko: "English Team" }),
      ]
    )
    expect(result.items.map((item) => item.key).sort()).toEqual([
      "dictionary:orphan",
      "squad:arsenal:existing",
    ])
    expect(
      buildPlayerNamingQueue([], [notation("orphan", { disambiguation: "Everton|에버턴" })], {
        q: "EVERton",
      }).total
    ).toBe(1)
  })

  it("offers name parts only as an explicit filter without guessing a family name", () => {
    const sources = [squad("son", { name_en: "Son Heung-min", name_kr: "손흥민" })]
    const dictionary = [
      notation("son", {
        romanized: "Son Heung-min",
        preferred_ko: "손흥민",
        given_name_ko: "흥민",
      }),
    ]
    expect(buildPlayerNamingQueue(sources, dictionary).total).toBe(0)
    const result = buildPlayerNamingQueue(sources, dictionary, { filter: "name_parts" })
    expect(result.items[0]).toMatchObject({
      given_name_ko: "흥민",
      family_name_ko: "",
      short_name_ko: "",
      news_id: "son",
      news_expected: date,
      news_name_kr: "손흥민",
    })
  })

  it("keeps existing Korean spelling review separate and uses only an exact dictionary fallback", () => {
    const sources = [
      squad("saka", { name_en: "Bukayo Saka", name_kr: "부카요 사카" }),
      squad("rico", { name_en: "Rico Lewis", name_kr: "Rico Lewis" }),
      squad("unfilled", { name_en: "Unknown Player" }),
    ]
    const dictionary = [
      notation("rico", { romanized: "Rico Lewis", preferred_ko: "리코 루이스" }),
      notation("orphan", { romanized: "Another Player", preferred_ko: "다른 선수" }),
    ]
    const reviewed = buildPlayerNamingQueue(sources, dictionary, { filter: "korean" })
    expect(reviewed.items.map((item) => [item.key, item.name_kr]).sort()).toEqual([
      ["dictionary:orphan", "다른 선수"],
      ["squad:arsenal:rico", "리코 루이스"],
      ["squad:arsenal:saka", "부카요 사카"],
    ])
    expect(buildPlayerNamingQueue(sources, dictionary).items.map((item) => item.id)).toEqual([
      "rico",
      "unfilled",
    ])
  })

  it("keeps roster composite keys and paginates 100 rows after filtering", () => {
    const rows = Array.from({ length: 205 }, (_, index) => squad(String(index).padStart(3, "0")))
    rows.push(
      squad("000", { soccerway_team_id: "everton", team_dictionary: { name_en: "Everton" } })
    )
    const result = buildPlayerNamingQueue(rows, [], { page: 1 })
    expect(result.total).toBe(206)
    expect(result.items).toHaveLength(100)
    expect(
      new Set(buildPlayerNamingQueue(rows, [], { q: "Player 000" }).items.map((item) => item.key))
        .size
    ).toBe(2)
  })

  it("loads every 1000-row database page and does not return a partial roster on errors", async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => squad(String(i))),
        error: null,
      })
      .mockResolvedValueOnce({ data: [squad("last")], error: null })
    const chain = {
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    }
    const db = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient
    expect((await loadPlayerNamingQueue(db)).total).toBe(1001)
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    range.mockResolvedValueOnce({ data: null, error: { message: "failed" } })
    await expect(loadPlayerNamingQueue(db)).rejects.toThrow("선수 목록")
  })

  it("accepts blank optional name parts but rejects duplicated or mismatched row keys", () => {
    const row = {
      key: "squad:arsenal:saka",
      kind: "squad",
      id: "saka",
      team_id: "arsenal",
      expected: date,
      name_kr: "부카요 사카",
    }
    expect(PlayerNamingSaveSchema.parse({ entries: [row] }).entries[0]).toMatchObject({
      given_name_ko: "",
      family_name_ko: "",
      short_name_ko: "",
      news_id: null,
      news_expected: null,
      news_name_kr: null,
    })
    expect(PlayerNamingSaveSchema.safeParse({ entries: [row, row] }).success).toBe(false)
    expect(
      PlayerNamingSaveSchema.safeParse({ entries: [{ ...row, key: "squad:everton:saka" }] }).success
    ).toBe(false)
    expect(
      PlayerNamingSaveSchema.safeParse({ entries: [{ ...row, name_kr: "Bukayo Saka" }] }).success
    ).toBe(false)
    expect(
      PlayerNamingSaveSchema.safeParse({ entries: [{ ...row, news_id: "saka" }] }).success
    ).toBe(false)
  })
})

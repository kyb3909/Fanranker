import { describe, it, expect } from "vitest"
import { z } from "zod"

// app/api/betman/unknown-games/route.ts 의 schema 와 동일하게 유지.
const unknownItemSchema = z.object({
  source: z.enum(["game", "result"]),
  gm_ts: z.union([z.string(), z.number()]).transform(String),
  game_no: z.number().int().nullable().optional(),
  bet_typ_id: z.union([z.string(), z.number()]).nullable().optional(),
  handi_val: z.number().int().nullable().optional(),
  game_result: z.string().nullable().optional(),
  mch_score: z.string().nullable().optional(),
  home_score: z.number().int().nullable().optional(),
  away_score: z.number().int().nullable().optional(),
  sport: z.string().nullable().optional(),
  league_code: z.string().nullable().optional(),
  home_team_name: z.string().nullable().optional(),
  away_team_name: z.string().nullable().optional(),
  match_time: z.string().nullable().optional(),
  raw_data: z.record(z.unknown()),
})

const postSchema = z.object({
  items: z.array(unknownItemSchema).min(1),
})

describe("POST /api/betman/unknown-games — schema", () => {
  it("accepts a 'game' source row from parseGames unknown branch", () => {
    const body = {
      items: [
        {
          source: "game",
          gm_ts: "260050",
          bet_typ_id: "3", // 미지원 betTypId 예시 (e.g. 승N패)
          game_no: 12,
          sport: "야구",
          league_code: "KBO",
          home_team_name: "두산",
          away_team_name: "LG",
          match_time: "2026-05-02T09:30:00.000Z",
          raw_data: { betTypId: 3, winAllot: 0 },
        },
      ],
    }
    expect(postSchema.parse(body)).toBeDefined()
  })

  it("accepts a 'result' source row from sendResultsToApi unknown branch", () => {
    const body = {
      items: [
        {
          source: "result",
          gm_ts: 260050, // number 도 허용 (transform → string)
          handi_val: 11, // 미지원 HANDI_VAL 예시
          game_no: 12,
          game_result: "5",
          mch_score: "1:2",
          home_score: 1,
          away_score: 2,
          home_team_name: "두산",
          away_team_name: "LG",
          raw_data: { GAME_RESULT: "5", HANDI_VAL: 11 },
        },
      ],
    }
    const parsed = postSchema.parse(body)
    expect(parsed.items[0].gm_ts).toBe("260050")
  })

  it("rejects empty items array", () => {
    expect(() => postSchema.parse({ items: [] })).toThrow()
  })

  it("rejects unknown source", () => {
    expect(() =>
      postSchema.parse({
        items: [{ source: "halftime", gm_ts: "1", raw_data: {} }],
      })
    ).toThrow()
  })

  it("requires raw_data", () => {
    expect(() => postSchema.parse({ items: [{ source: "game", gm_ts: "1" }] })).toThrow()
  })
})

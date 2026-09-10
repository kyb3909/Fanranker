import type { SupabaseClient } from "@supabase/supabase-js"

type Row = Record<string, unknown>
export function auditDb(tables: Record<string, Row[]> = {}) {
  const reads: { table: string; offset: number }[] = []
  const writes: { table: string; method: string; data: unknown }[] = []
  const state = { fail: "", failAfter: 0 }
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let offset = 0,
        end = Infinity,
        single = false
      let mutation: { method: string; data: unknown } | null = null
      const compare = (value: unknown, other: unknown) => {
        const a = Date.parse(String(value)),
          b = Date.parse(String(other))
        return Number.isFinite(a) && Number.isFinite(b)
          ? a - b
          : String(value).localeCompare(String(other))
      }
      const q = {
        select: () => q,
        order: () => q,
        eq: (key: string, value: unknown) => {
          filters.push((r) => r[key] === value)
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
        is: (key: string, value: unknown) => {
          filters.push((r) => (r[key] ?? null) === value)
          return q
        },
        not: (key: string, _op: string, value: unknown) => {
          filters.push((r) => (r[key] ?? null) !== value)
          return q
        },
        gte: (key: string, value: unknown) => {
          filters.push((r) => r[key] != null && compare(r[key], value) >= 0)
          return q
        },
        gt: (key: string, value: unknown) => {
          filters.push((r) => r[key] != null && compare(r[key], value) > 0)
          return q
        },
        lte: (key: string, value: unknown) => {
          filters.push((r) => r[key] != null && compare(r[key], value) <= 0)
          return q
        },
        lt: (key: string, value: unknown) => {
          filters.push((r) => r[key] != null && compare(r[key], value) < 0)
          return q
        },
        range: (from: number, to: number) => {
          offset = from
          end = to + 1
          return q
        },
        limit: (n: number) => {
          end = n
          return q
        },
        maybeSingle: () => {
          single = true
          return q
        },
        update: (data: unknown) => {
          mutation = { method: "update", data }
          return q
        },
        upsert: (data: unknown) => {
          mutation = { method: "upsert", data }
          return q
        },
        then: (resolve: (r: unknown) => unknown) => {
          if (mutation) writes.push({ table, ...mutation })
          else reads.push({ table, offset })
          if (state.fail === table && offset >= state.failAfter) {
            return Promise.resolve({
              data: null,
              error: { message: "DB unavailable" },
              count: null,
            }).then(resolve)
          }
          const found = (tables[table] ?? [])
            .filter((r) => filters.every((f) => f(r)))
            .slice(offset, end)
          return Promise.resolve({
            data: single ? (found[0] ?? null) : found,
            error: null,
            count: found.length,
          }).then(resolve)
        },
      }
      return q
    },
  } as unknown as SupabaseClient
  return { db, state, reads, writes, tables }
}

export const auditGame = (id = "betman-a") => ({
  id,
  home_team_name: "첼시",
  away_team_name: "리즈 유나이티드",
  match_time: "2026-09-09T19:00:00+00:00",
  league_code: "잉리그컵",
  sport: "축구",
  status: "completed",
  home_score: 6,
  away_score: 3,
})
export const auditLfa = (id = "lfa-uuid", linked: string | null = "betman-b") => ({
  id,
  betman_game_id: linked,
  lfa_match_id: `provider-${id}`,
  match_time: "2026-09-09T19:15:00+00:00",
  fixture: {
    homeTeam: "첼시",
    awayTeam: "리즈 유나이티드",
    leagueCode: "잉리그컵",
    status: "completed",
    homeScore: 6,
    awayScore: 3,
  },
})

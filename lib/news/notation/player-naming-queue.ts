import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { listManagedNotation, type ManagedNotation } from "./manage"

export const PLAYER_NAMING_PAGE_SIZE = 100
export type PlayerNamingFilter = "missing" | "korean" | "name_parts"
export interface PlayerNamingItem {
  key: string
  kind: "squad" | "dictionary"
  id: string
  team_id: string
  team_name: string
  name_en: string
  name_kr: string | null
  name_kr_draft: string | null
  expected: string
  news_id: string | null
  news_expected: string | null
  news_name_kr: string | null
  given_name_ko: string
  family_name_ko: string
  short_name_ko: string
}
export interface NamingSquadRow {
  soccerway_team_id: string
  player_id: string
  name_en: string
  name_kr: string | null
  name_kr_draft: string | null
  updated_at: string
  status: string
  team_dictionary:
    | { name_kr?: string | null; name_en?: string | null }
    | { name_kr?: string | null; name_en?: string | null }[]
    | null
}
export const namingQueueKey = (kind: PlayerNamingItem["kind"], id: string, teamId: string) =>
  kind === "squad" ? `squad:${teamId}:${id}` : `dictionary:${id}`
const exactName = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()
export const hasKoreanPlayerName = (value: string | null | undefined) =>
  Boolean(value && /[가-힣]/.test(value) && !/[a-z]/i.test(value))
const nameParts = (entry?: ManagedNotation) => ({
  given_name_ko: entry?.given_name_ko ?? "",
  family_name_ko: entry?.family_name_ko ?? "",
  short_name_ko: entry?.short_name_ko ?? "",
})

/** The queue matches exact lower/trim spellings only, following save_player_naming_row. */
export function buildPlayerNamingQueue(
  squads: NamingSquadRow[],
  notation: ManagedNotation[],
  options: { filter?: PlayerNamingFilter; q?: string; page?: number } = {}
) {
  const filter = options.filter ?? "missing"
  const page = Math.max(0, Math.floor(options.page ?? 0))
  const query = exactName(options.q)
  const persons = notation.filter(
    (entry) => entry.category === "player" || entry.category === "coach"
  )
  const byEnglish = new Map<string, Map<string, ManagedNotation>>()
  for (const entry of persons) {
    for (const value of [entry.romanized, ...(entry.surfaces ?? [])]) {
      const key = exactName(value)
      if (!key) continue
      const matches = byEnglish.get(key) ?? new Map<string, ManagedNotation>()
      matches.set(entry.id, entry)
      byEnglish.set(key, matches)
    }
  }
  const represented = new Set<string>()
  const rows: PlayerNamingItem[] = []
  const included = (item: PlayerNamingItem) =>
    filter === "missing"
      ? !hasKoreanPlayerName(item.name_kr)
      : filter === "korean"
        ? hasKoreanPlayerName(item.name_kr)
        : !item.given_name_ko.trim() || !item.family_name_ko.trim() || !item.short_name_ko.trim()
  for (const squad of squads) {
    if (squad.status === "left") continue
    const matches = [...(byEnglish.get(exactName(squad.name_en))?.values() ?? [])]
    matches.forEach((entry) => represented.add(entry.id))
    const match = matches.length === 1 ? matches[0] : undefined
    // A settled article spelling is not new naming work. Missing name parts are an explicit,
    // optional queue; completed Korean names do not reappear in the default queue.
    if (
      filter === "missing" &&
      (hasKoreanPlayerName(squad.name_kr) || (match && hasKoreanPlayerName(match.preferred_ko)))
    )
      continue
    const team = Array.isArray(squad.team_dictionary)
      ? squad.team_dictionary[0]
      : squad.team_dictionary
    const row: PlayerNamingItem = {
      key: namingQueueKey("squad", squad.player_id, squad.soccerway_team_id),
      kind: "squad",
      id: squad.player_id,
      team_id: squad.soccerway_team_id,
      team_name: team?.name_kr || team?.name_en || squad.soccerway_team_id,
      name_en: squad.name_en,
      name_kr: squad.name_kr,
      name_kr_draft: squad.name_kr_draft,
      expected: squad.updated_at,
      news_id: match?.id ?? null,
      news_expected: match?.updated_at ?? null,
      news_name_kr: match?.preferred_ko ?? null,
      ...nameParts(match),
    }
    if (
      filter !== "missing" &&
      !hasKoreanPlayerName(row.name_kr) &&
      match &&
      hasKoreanPlayerName(match.preferred_ko)
    )
      row.name_kr = match.preferred_ko
    if (included(row)) rows.push(row)
  }
  for (const entry of persons) {
    if (represented.has(entry.id)) continue
    const row: PlayerNamingItem = {
      key: namingQueueKey("dictionary", entry.id, ""),
      kind: "dictionary",
      id: entry.id,
      team_id: "",
      team_name: entry.disambiguation?.trim() || "기사 사전",
      name_en: entry.romanized?.trim() || entry.preferred_ko,
      name_kr: entry.preferred_ko,
      name_kr_draft: null,
      expected: entry.updated_at,
      news_id: entry.id,
      news_expected: entry.updated_at,
      news_name_kr: entry.preferred_ko,
      ...nameParts(entry),
    }
    if (included(row)) rows.push(row)
  }
  const filtered = rows
    .filter(
      (row) =>
        !query ||
        [row.name_en, row.team_name, row.team_id, row.name_kr ?? ""].some((value) =>
          exactName(value).includes(query)
        )
    )
    .sort(
      (a, b) =>
        a.team_name.localeCompare(b.team_name, "ko") ||
        a.name_en.localeCompare(b.name_en) ||
        a.key.localeCompare(b.key)
    )
  return {
    items: filtered.slice(page * PLAYER_NAMING_PAGE_SIZE, (page + 1) * PLAYER_NAMING_PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: PLAYER_NAMING_PAGE_SIZE,
  }
}

export async function loadPlayerNamingQueue(
  db: SupabaseClient,
  options: { filter?: PlayerNamingFilter; q?: string; page?: number } = {}
) {
  const roster = async () => {
    const rows: NamingSquadRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("team_squads")
        .select(
          "soccerway_team_id,player_id,name_en,name_kr,name_kr_draft,updated_at,status,team_dictionary(name_kr,name_en)"
        )
        .neq("status", "left")
        .order("soccerway_team_id")
        .order("player_id")
        .range(from, from + 999)
      if (error) throw Error("선수 목록을 불러오지 못했습니다.")
      rows.push(...((data ?? []) as NamingSquadRow[]))
      if (!data || data.length < 1000) return rows
    }
  }
  const [squads, notation] = await Promise.all([roster(), listManagedNotation(db)])
  return buildPlayerNamingQueue(squads, notation, options)
}

const optionalName = z
  .string()
  .trim()
  .max(100)
  .refine((value) => !/[\[\]\r\n]/.test(value))
  .default("")
export const PlayerNamingSaveSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            key: z.string().min(1).max(500),
            kind: z.enum(["squad", "dictionary"]),
            id: z.string().min(1).max(200),
            team_id: z.string().max(200).default(""),
            expected: z.string().datetime({ offset: true }),
            news_id: z.string().min(1).max(200).nullable().default(null),
            news_expected: z.string().datetime({ offset: true }).nullable().default(null),
            news_name_kr: z.string().max(100).nullable().default(null),
            name_kr: z
              .string()
              .trim()
              .min(1)
              .max(100)
              .refine((value) => /[가-힣]/.test(value) && !/[\[\]\r\n]/.test(value)),
            given_name_ko: optionalName,
            family_name_ko: optionalName,
            short_name_ko: optionalName,
          })
          .refine(
            (entry) =>
              (entry.kind !== "squad" || Boolean(entry.team_id)) &&
              Boolean(entry.news_id) === Boolean(entry.news_expected) &&
              entry.key === namingQueueKey(entry.kind, entry.id, entry.team_id)
          )
      )
      .min(1)
      .max(100),
  })
  .refine((body) => new Set(body.entries.map((entry) => entry.key)).size === body.entries.length)

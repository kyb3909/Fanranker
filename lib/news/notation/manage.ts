import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchDictionaryRows } from "@/lib/news/dictionary-fetch"

export const NOTATION_LABELS = {
  player: "선수",
  coach: "감독",
  team: "팀",
  competition: "대회",
  media: "매체",
  term: "용어",
}
const namePart = z
  .string()
  .trim()
  .max(100)
  .refine((s) => !/[\[\]\r\n]/.test(s), "이름에는 대괄호나 줄바꿈을 넣을 수 없습니다.")
  .default("")
export const NotationEditSchema = z
  .object({
    id: z.string().min(1).max(200).optional(),
    category: z.enum(["player", "coach", "team", "competition", "media", "term"]),
    preferred_ko: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((s) => !/[\[\]\r\n]/.test(s), "표기에는 대괄호나 줄바꿈을 넣을 수 없습니다."),
    romanized: z.string().trim().max(150),
    given_name_ko: namePart,
    family_name_ko: namePart,
    short_name_ko: namePart,
    surfaces: z
      .array(
        z
          .string()
          .trim()
          .min(2)
          .max(150)
          .refine((s) => !/[\[\]\r\n]/.test(s))
      )
      .max(60),
    disambiguation: z.string().trim().max(400),
    notes: z.string().trim().max(1000),
  })
  .transform((entry) =>
    entry.category === "player" || entry.category === "coach"
      ? entry
      : { ...entry, given_name_ko: "", family_name_ko: "", short_name_ko: "" }
  )
export type ManagedNotation = z.infer<typeof NotationEditSchema> & {
  id: string
  updated_at: string
  hangul_alts?: string[] | null
}
export async function listManagedNotation(db: SupabaseClient) {
  return fetchDictionaryRows<ManagedNotation>(
    db,
    "id,category,preferred_ko,romanized,given_name_ko,family_name_ko,short_name_ko,surfaces,hangul_alts,disambiguation,notes,updated_at",
    Object.keys(NOTATION_LABELS)
  )
}

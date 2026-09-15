import type { NotationHint } from "./rules"

const AMBIGUOUS_EN = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "inter",
  "athletic",
])

function appearsAsName(
  text: string,
  lower: string,
  needle: string,
  allowLowercase = false
): boolean {
  if (!needle) return false
  let at = lower.indexOf(needle)
  while (at !== -1) {
    const before = at === 0 ? " " : lower[at - 1]
    const after = lower[at + needle.length] ?? " "
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
      const first = text[at] ?? ""
      if (allowLowercase || first !== first.toLowerCase() || /[0-9]/.test(first)) return true
    }
    at = lower.indexOf(needle, at + 1)
  }
  return false
}

/** Bound writer input to relevant names, with the scanner's surname/team safeguards. */
export function selectNotationHints(
  naming: readonly NotationHint[],
  sourceText: string,
  limit = 25
): NotationHint[] {
  if (!sourceText || limit < 1) return []
  const lower = sourceText.toLowerCase()
  const hits: { hint: NotationHint; matched: string }[] = []
  for (const hint of naming) {
    const pick = (forms: string[]) =>
      [...forms]
        .map((form) => form.trim().toLowerCase())
        .filter((form) => form && !AMBIGUOUS_EN.has(form))
        .sort((a, b) => b.length - a.length)
        .find((form) =>
          appearsAsName(
            sourceText,
            lower,
            form,
            hint.allow_lowercase === true && hint.kind === "label"
          )
        )
    let matched = pick(hint.en)
    if (
      !matched &&
      hint.enTeam?.length &&
      hint.team?.some(
        (team) => appearsAsName(sourceText, lower, team.toLowerCase()) || sourceText.includes(team)
      )
    )
      matched = pick(hint.enTeam)
    if (matched) hits.push({ hint, matched })
  }
  // Check every source match before applying the prompt budget. A truncated second player
  // must not make a shared surname appear unique.
  const mentionOwners = new Map<string, Set<string>>()
  for (const { hint } of hits) {
    if (hint.kind !== "person") continue
    for (const name of [hint.family_name_ko, hint.short_name_ko]) {
      const key = name?.replace(/\s+/g, "")
      if (!key) continue
      const owners = mentionOwners.get(key) ?? new Set<string>()
      owners.add(hint.first_mention_ko ?? hint.ko)
      mentionOwners.set(key, owners)
    }
  }
  return hits
    .sort((a, b) => b.matched.length - a.matched.length)
    .slice(0, Math.min(100, Math.floor(limit)))
    .map(({ hint, matched }) => {
      const ambiguous =
        hint.kind === "person" &&
        [hint.family_name_ko, hint.short_name_ko].some(
          (name) => (mentionOwners.get(name?.replace(/\s+/g, "") ?? "")?.size ?? 0) > 1
        )
      return {
        ko: hint.ko,
        kind: hint.kind,
        en: [matched],
        ...(hint.allow_lowercase ? { allow_lowercase: true } : {}),
        ...(hint.first_mention_ko ? { first_mention_ko: hint.first_mention_ko } : {}),
        ...(hint.subsequent_mention_ko
          ? {
              subsequent_mention_ko: ambiguous
                ? (hint.first_mention_ko ?? hint.ko)
                : hint.subsequent_mention_ko,
            }
          : {}),
        ...(hint.given_name_ko ? { given_name_ko: hint.given_name_ko } : {}),
        ...(hint.family_name_ko ? { family_name_ko: hint.family_name_ko } : {}),
        ...(hint.short_name_ko ? { short_name_ko: hint.short_name_ko } : {}),
        ...(ambiguous ? { short_name_ambiguous: true } : {}),
      }
    })
}

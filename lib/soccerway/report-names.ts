import { applyNamingPairs, buildNamingPairs, type NotationEntry } from "@/lib/news/notation"
import { foldLatin } from "@/lib/text/fold-latin"
import { matchByNickname } from "@/lib/soccerway/nickname-match"

export interface ReportNameRow {
  romanized: string | null
  preferred_ko: string
  surfaces?: string[] | null
  hangul_alts?: string[] | null
}
export interface ReportRosterName {
  roman: string | null
  label: string
}

const korean = (value: string) => /[가-힣]/.test(value) && !/[A-Za-z]/.test(value)
const tokens = (value: string) =>
  foldLatin(value)
    .split(/[^a-z]+/)
    .filter(Boolean)
const key = (value: string) => tokens(value).sort().join(" ")
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function fixNameParticles(text: string, names: string[]): string {
  let result = text
  for (const name of names) {
    if (!result.includes(name)) continue
    const last = name.charCodeAt(name.length - 1)
    if (last < 0xac00 || last > 0xd7a3) continue
    const final = (last - 0xac00) % 28
    result = result.replace(
      new RegExp(`${escapeRe(name)}(으로|로|은|는|이|가|을|를|과|와)(?=\\s|[.,!?…]|$)`, "g"),
      (_, particle: string) => {
        if (particle === "으로" || particle === "로")
          return name + (final && final !== 8 ? "으로" : "로")
        const pair = ["은는", "이가", "을를", "과와"].find((p) => p.includes(particle))!
        return name + pair[final ? 0 : 1]
      }
    )
  }
  return result
}

function matches(query: string, candidate: string) {
  const want = tokens(query),
    have = tokens(candidate)
  if (!want.length || !have.length) return false
  if (key(query) === key(candidate)) return true
  // Initials must match a remaining given-name token; never discard them.
  if (want.some((t) => t.length === 1)) {
    const whole = want.filter((t) => t.length > 1)
    const initials = want.filter((t) => t.length === 1)
    const rest = have.filter((t) => !whole.includes(t))
    return (
      whole.length > 0 &&
      whole.every((t) => have.includes(t)) &&
      initials.every((t) => rest.some((r) => r.startsWith(t)))
    )
  }
  return (
    want.every((t) => have.includes(t)) ||
    (have.length >= 2 && have.every((t) => t.length > 1 && want.includes(t)))
  )
}

const indexes = new WeakMap<
  ReportNameRow[],
  {
    exact: Map<string, Set<ReportNameRow>>
    token: Map<string, Set<ReportNameRow>>
    memo: Map<string, string | null>
  }
>()

function uniqueName(rows: ReportNameRow[], query: string): string | null {
  let index = indexes.get(rows)
  if (!index) {
    index = { exact: new Map(), token: new Map(), memo: new Map() }
    for (const row of rows)
      for (const alias of [row.romanized, ...(row.surfaces ?? [])]) {
        if (!alias) continue
        const parts = tokens(alias)
        if (!parts.length) continue
        const k = [...parts].sort().join(" ")
        const exactRows = index.exact.get(k) ?? new Set()
        exactRows.add(row)
        index.exact.set(k, exactRows)
        for (const part of parts) {
          const tokenRows = index.token.get(part) ?? new Set()
          tokenRows.add(row)
          index.token.set(part, tokenRows)
        }
      }
    indexes.set(rows, index)
  }
  const queryKey = key(query)
  if (index.memo.has(queryKey)) return index.memo.get(queryKey)!
  const exact = [...(index.exact.get(queryKey) ?? [])]
  const candidates = [
    ...new Set(
      tokens(query)
        .filter((t) => t.length > 1)
        .flatMap((t) => [...(index.token.get(t) ?? [])])
    ),
  ]
  const hits = exact.length
    ? exact
    : candidates.filter((r) =>
        [r.romanized, ...(r.surfaces ?? [])].some((s) => s && matches(query, s))
      )
  const names = [...new Set(hits.map((r) => r.preferred_ko).filter(korean))]
  const nick = names.length ? null : matchByNickname(candidates, query)?.preferred_ko
  const result = names.length
    ? names.length === 1
      ? names[0]
      : null
    : nick && korean(nick)
      ? nick
      : null
  index.memo.set(queryKey, result)
  return result
}

/** Dictionary spelling wins; an English lineup label never stops dictionary lookup. */
export function createReportNameEditor(
  persons: ReportNameRow[],
  roster: ReportRosterName[],
  squads: ReportNameRow[] = []
) {
  const resolve = (name: string): string | null => {
    const inRoster = roster.filter((r) => r.roman && matches(name, r.roman))
    const identities = [...new Set(inRoster.map((r) => key(r.roman!)))]
    if (identities.length > 1) return null
    const player = inRoster[0]
    const canonical =
      (player?.roman ? uniqueName(persons, player.roman) : null) ?? uniqueName(persons, name)
    if (canonical) return canonical
    if (player && korean(player.label)) return player.label
    return (player?.roman ? uniqueName(squads, player.roman) : null) ?? uniqueName(squads, name)
  }
  const pairs = buildNamingPairs(persons as NotationEntry[])
  const koreanNames = [
    ...new Set(
      [
        ...persons.map((p) => p.preferred_ko),
        ...squads.map((p) => p.preferred_ko),
        ...roster.map((p) => p.label),
      ].filter(korean)
    ),
  ].sort((a, b) => b.length - a.length)
  const aliases = new Map<string, string>()
  // Only full dictionary names are candidates for free-text replacement. Short names
  // are supplied by the match roster/events and resolved in that context.
  const fullNames = new Map<string, Set<string>>()
  for (const row of persons) {
    for (const value of [row.romanized, ...(row.surfaces ?? [])]) {
      if (value && tokens(value).length >= 2 && !/[가-힣]/.test(value)) {
        const names = fullNames.get(value) ?? new Set<string>()
        if (korean(row.preferred_ko)) names.add(row.preferred_ko)
        fullNames.set(value, names)
      }
    }
  }
  for (const [value, names] of fullNames) if (names.size === 1) aliases.set(value, [...names][0])
  for (const row of roster)
    if (row.roman) {
      const ko = resolve(row.roman)
      if (ko) aliases.set(row.roman, ko)
    }
  const edit = (text: string, knownNames: string[] = []) => {
    const replacements = new Map(aliases)
    for (const name of knownNames) {
      const ko = resolve(name)
      if (ko && !/[가-힣]/.test(name)) replacements.set(name, ko)
    }
    let result = text
    const lowerText = text.toLowerCase()
    for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) {
      if (!lowerText.includes(from.toLowerCase())) continue
      result = result.replace(
        new RegExp(`(?<![A-Za-zÀ-ž])${escapeRe(from)}(?![A-Za-zÀ-ž])`, "giu"),
        to
      )
    }
    // Reports already written in Korean may contain English full names or surnames.
    result = result.replace(/[A-Za-zÀ-ž]+(?:[ .'’-]+[A-Za-zÀ-ž]+)*\.?/g, (value) => {
      const trimmed = value.trim()
      if (
        ["VAR", "xG", "PSG", "PL", "EPL", "MLS", "AS", "AC", "US", "SSC", "ACF", "AJ"].includes(
          trimmed
        )
      )
        return value
      return resolve(trimmed) ?? value
    })
    return fixNameParticles(applyNamingPairs(result, pairs), koreanNames)
  }
  return { resolve, edit }
}

/** Football abbreviations may remain; unresolved Latin prose/names require another edit. */
export function reportLatinRemainders(
  report: { title: string; paragraphs: string[] },
  teamNames: string[] = []
): string[] {
  const teamAbbreviations = new Set(teamNames.flatMap((name) => name.match(/[A-Za-z]+/g) ?? []))
  const values =
    [report.title, ...report.paragraphs]
      .join("\n")
      .match(/[A-Za-zÀ-ž]+(?:[ .'’-]+[A-Za-zÀ-ž]+)*\.?/g) ?? []
  return [
    ...new Set(
      values
        .map((v) => v.trim())
        .filter(
          (v) =>
            !/^(?:VAR|xG|PSG|PL|EPL|MLS|AS|AC|US|SSC|ACF|AJ)$/.test(v) && !teamAbbreviations.has(v)
        )
    ),
  ]
}
